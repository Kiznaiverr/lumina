/* ── Paint Tool — stroke engine ──
 * Brush/eraser stamp a pre-rendered radial-gradient sprite along the
 * pointer path (hardness 0-100). Bucket runs a BFS flood fill against the
 * COMPOSITE image (what the user sees) and writes the result into the
 * cleanup layer. All strokes draw into the runtime cleanup canvas at
 * natural size; the caller serializes it to a versioned PNG on stroke-end.
 */
import type { Page } from "../../../types";
import { paintSettings, ensureCleanupCanvas, compositeRegion } from "./shared";

const MAX_SAMPLE_STEP = 0.25; // stamps every 25% of brush diameter

// ── Brush sprite (rebuilt when settings change) ──

let _sprite: HTMLCanvasElement | null = null;
let _spriteKey = "";

/** Build the radial-gradient stamp for current size/hardness/opacity. */
function sprite(): HTMLCanvasElement {
  const s = paintSettings();
  const key = [s.size, s.hardness, s.opacity, s.color, "brush"].join("|");
  if (_sprite && _spriteKey === key) return _sprite;

  const size = s.size;
  const pad = Math.max(1, Math.ceil(size * 0.5));
  const c = document.createElement("canvas");
  c.width = c.height = Math.max(2, Math.ceil(size) + pad * 2);
  const ctx = c.getContext("2d")!;
  const cx = c.width / 2;
  const cy = c.height / 2;
  const radius = size / 2;

  // Hardness 100 = hard circle; 0 = fully soft edge (Photoshop).
  // NOTE: inner === radius makes the gradient degenerate (r0==r1 → canvas
  // renders it fully transparent), so hard circles skip the gradient and
  // fill a solid arc instead.
  const hard = s.hardness / 100;
  const alpha = s.opacity;
  if (hard >= 1) {
    ctx.fillStyle = "rgba(0,0,0,1)";
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fill();
  } else {
    const inner = radius * hard;
    const g = ctx.createRadialGradient(cx, cy, inner, cx, cy, radius);
    g.addColorStop(0, "rgba(0,0,0,1)");
    g.addColorStop(hard, "rgba(0,0,0,1)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, c.width, c.height);
  }

  // Tint with the paint color — eraser reuses the shape with a different op.
  ctx.globalCompositeOperation = "source-in";
  ctx.fillStyle = s.color;
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.globalCompositeOperation = "source-over";
  if (alpha !== 1) {
    // Apply opacity into the sprite alpha so overlapping stamps accumulate
    // naturally instead of multiplying.
    ctx.globalCompositeOperation = "destination-in";
    ctx.globalAlpha = alpha;
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
  }

  _sprite = c;
  _spriteKey = key;
  return c;
}

function eraserSprite(): HTMLCanvasElement {
  const s = paintSettings();
  const key = [s.size, s.hardness, s.opacity, "eraser"].join("|");
  if (_sprite && _spriteKey === key) return _sprite;

  const size = s.size;
  const pad = Math.max(1, Math.ceil(size * 0.5));
  const c = document.createElement("canvas");
  c.width = c.height = Math.max(2, Math.ceil(size) + pad * 2);
  const ctx = c.getContext("2d")!;
  const cx = c.width / 2;
  const cy = c.height / 2;
  const radius = size / 2;
  const hard = s.hardness / 100;
  if (hard >= 1) {
    // Degenerate-gradient guard (r0==r1 → transparent) — fill a solid arc.
    ctx.fillStyle = "rgba(0,0,0,1)";
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fill();
  } else {
    const inner = radius * hard;
    const g = ctx.createRadialGradient(cx, cy, inner, cx, cy, radius);
    g.addColorStop(0, "rgba(0,0,0,1)");
    g.addColorStop(Math.max(0.001, hard), "rgba(0,0,0,1)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, c.width, c.height);
  }

  // Eraser opacity scales the stamp alpha (destination-out uses it as the
  // erase amount) — same slider as the brush.
  if (s.opacity !== 1) {
    ctx.globalCompositeOperation = "destination-in";
    ctx.globalAlpha = s.opacity;
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
  }

  _sprite = c;
  _spriteKey = key;
  return c;
}

function clearSprite(): void {
  _sprite = null;
  _spriteKey = "";
}

// ── Brush / eraser stroke ──

export interface StrokePoint {
  x: number;
  y: number;
}

/** Stamp one sprite centered at image px (x,y). */
function stamp(
  page: Page,
  c: HTMLCanvasElement,
  img: HTMLCanvasElement,
  x: number,
  y: number,
): void {
  void page;
  const ctx = c.getContext("2d")!;
  const cx = img.width / 2;
  const cy = img.height / 2;
  ctx.drawImage(img, Math.round(x) - cx, Math.round(y) - cy);
}

/** Stamp a line between a and b (image px) — interpolated for smoothness. */
function stampLine(
  page: Page,
  c: HTMLCanvasElement,
  img: HTMLCanvasElement,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): void {
  const dx = bx - ax;
  const dy = by - ay;
  const dist = Math.hypot(dx, dy);
  const step = Math.max(1, paintSettings().size * MAX_SAMPLE_STEP);
  const n = Math.max(1, Math.ceil(dist / step));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    stamp(page, c, img, ax + dx * t, ay + dy * t);
  }
}

/** Paint (or erase) along a polyline path. */
export function applyStroke(
  page: Page,
  points: StrokePoint[],
  mode: "brush" | "eraser",
): void {
  const c = ensureCleanupCanvas(page);
  if (!c || points.length === 0) return;
  const ctx = c.getContext("2d")!;
  const img = mode === "brush" ? sprite() : eraserSprite();
  if (mode === "eraser") ctx.globalCompositeOperation = "destination-out";
  else ctx.globalCompositeOperation = "source-over";

  stamp(page, c, img, points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) {
    stampLine(
      page,
      c,
      img,
      points[i - 1].x,
      points[i - 1].y,
      points[i].x,
      points[i].y,
    );
  }
  ctx.globalCompositeOperation = "source-over";
}

// ── Bucket flood fill (composite-aware) ──

function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return [17, 17, 17];
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Compute the fill mask against the composite image. Returns a boolean
 *  array (length w*h) with `match[i]` = pixel inside the fill region. */
function computeFillMask(
  composite: ImageData,
  seedX: number,
  seedY: number,
  tolerance: number,
  contiguous: boolean,
): Uint8Array {
  const w = composite.width;
  const h = composite.height;
  const d = composite.data;
  const si = (seedY * w + seedX) * 4;
  const sr = d[si],
    sg = d[si + 1],
    sb = d[si + 2];

  const match = new Uint8Array(w * h);
  const inTol = function (i: number): boolean {
    const r = d[i],
      g = d[i + 1],
      b = d[i + 2];
    const dr = r - sr,
      dg = g - sg,
      db = b - sb;
    return dr * dr + dg * dg + db * db <= tolerance * tolerance;
  };

  if (contiguous) {
    // BFS from the seed
    const stack: number[] = [seedY * w + seedX];
    match[seedY * w + seedX] = 1;
    while (stack.length) {
      const idx = stack.pop()!;
      const x = idx % w;
      const y = (idx / w) | 0;
      const nbrs = [
        y > 0 ? idx - w : -1,
        y < h - 1 ? idx + w : -1,
        x > 0 ? idx - 1 : -1,
        x < w - 1 ? idx + 1 : -1,
      ];
      for (const n of nbrs) {
        if (n < 0 || match[n]) continue;
        if (inTol(n * 4)) {
          match[n] = 1;
          stack.push(n);
        }
      }
    }
  } else {
    for (let i = 0; i < w * h; i++) {
      if (inTol(i * 4)) match[i] = 1;
    }
  }
  return match;
}

/** Flood-fill the cleanup layer: matching composite pixels get the paint
 *  color (at paint opacity). Returns true if anything changed. */
export function applyBucket(page: Page, seedX: number, seedY: number): boolean {
  const c = ensureCleanupCanvas(page);
  if (!c) return false;
  const s = paintSettings();
  const [fr, fg, fb] = hexToRgb(s.color);
  const fa = s.opacity;

  const composite = compositeRegion(
    page,
    0,
    0,
    page.naturalWidth,
    page.naturalHeight,
  )
    .getContext("2d")!
    .getImageData(0, 0, c.width, c.height);

  const w = c.width;
  const h = c.height;
  if (seedX < 0 || seedY < 0 || seedX >= w || seedY >= h) return false;

  const match = computeFillMask(
    composite,
    seedX,
    seedY,
    s.tolerance,
    s.contiguous,
  );

  const ctx = c.getContext("2d")!;
  const cur = ctx.getImageData(0, 0, w, h);
  const out = cur.data;
  let changed = 0;
  for (let i = 0; i < w * h; i++) {
    if (!match[i]) continue;
    const o = i * 4;
    const a = fa;
    out[o] = fr * a + out[o] * (1 - a);
    out[o + 1] = fg * a + out[o + 1] * (1 - a);
    out[o + 2] = fb * a + out[o + 2] * (1 - a);
    out[o + 3] = Math.max(out[o + 3], 255 * a);
    changed++;
  }
  if (!changed) return false;
  ctx.putImageData(cur, 0, 0);
  return true;
}

export { clearSprite };
