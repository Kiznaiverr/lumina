/* ── Paint Tool — shared state & coordinate/composite helpers ──
 * Persistent brush settings (localStorage), the per-page cleanup layer
 * lifecycle, stage↔image coordinate mapping, and composite-color sampling
 * (bg + inpaint patches + cleanup) for the eyedropper and bucket.
 */
import { state } from "../../state";
import { canvas } from "../index";
import type { Page, CleanupMask } from "../../../types";

// ── Brush settings (persisted per app) ──

const PAINT_KEY = "lumina-paint-settings";

export interface PaintSettings {
  color: string; // hex
  size: number; // px diameter 2-300
  opacity: number; // 0-1
  hardness: number; // 0-100
  tolerance: number; // 0-255 (bucket)
  contiguous: boolean; // bucket
}

function defaultSettings(): PaintSettings {
  return {
    color: "#111111",
    size: 24,
    opacity: 1,
    hardness: 50,
    tolerance: 32,
    contiguous: true,
  };
}

let _settings: PaintSettings = (function () {
  try {
    const raw = localStorage.getItem(PAINT_KEY);
    if (raw) return Object.assign(defaultSettings(), JSON.parse(raw));
  } catch {
    /* corrupted — fall through */
  }
  return defaultSettings();
})();

export function paintSettings(): PaintSettings {
  return _settings;
}

function persist(): void {
  try {
    localStorage.setItem(PAINT_KEY, JSON.stringify(_settings));
  } catch {
    /* storage blocked — non-fatal */
  }
}

export function setPaintColor(color: string): void {
  _settings.color = color;
  persist();
}
export function setPaintSize(size: number): void {
  _settings.size = Math.max(2, Math.min(300, Math.round(size)));
  persist();
}
export function setPaintOpacity(opacity: number): void {
  _settings.opacity = Math.max(0, Math.min(1, opacity));
  persist();
}
export function setPaintHardness(hardness: number): void {
  _settings.hardness = Math.max(0, Math.min(100, Math.round(hardness)));
  persist();
}
export function setPaintTolerance(tolerance: number): void {
  _settings.tolerance = Math.max(0, Math.min(255, Math.round(tolerance)));
  persist();
}
export function setPaintContiguous(v: boolean): void {
  _settings.contiguous = v;
  persist();
}

/** Restore every paint setting to its default (options bar reset button). */
export function resetPaintSettings(): void {
  _settings = defaultSettings();
  persist();
}

// ── Cleanup layer lifecycle ──

/** Create the raster layer (never auto-created by paint tools). */
export function ensureCleanupMask(page: Page): CleanupMask {
  if (!page.cleanupMask) {
    page.cleanupMask = {
      id:
        "cleanup-" + Date.now() + "-" + Math.random().toString(36).slice(2, 7),
      visible: true,
      opacity: 1,
      imagePath: null,
      _hydrated: true, // empty layer — nothing to load
    };
  }
  return page.cleanupMask;
}

/** Lazy-allocate the runtime paint surface at natural size. */
export function ensureCleanupCanvas(page: Page): HTMLCanvasElement | null {
  const mask = page.cleanupMask;
  if (!mask) return null;
  if (!mask.cleanupCanvas) {
    const c = document.createElement("canvas");
    c.width = page.naturalWidth;
    c.height = page.naturalHeight;
    mask.cleanupCanvas = c;
  }
  return mask.cleanupCanvas;
}

export function clearCleanupCanvas(page: Page): void {
  const c = ensureCleanupCanvas(page);
  if (c) c.getContext("2d")!.clearRect(0, 0, c.width, c.height);
}

function _fileUrl(p: string): string {
  let norm = p.replace(/\\/g, "/");
  if (!norm.startsWith("/")) norm = "/" + norm;
  return "file://" + encodeURI(norm).replace(/#/g, "%23").replace(/\?/g, "%3F");
}

/** Reload the runtime paint canvas from its stored PNG path (undo/redo/open). */
export function hydrateCleanupCanvas(page: Page): void {
  const mask = page.cleanupMask;
  const c = ensureCleanupCanvas(page);
  if (!mask || !c) return;
  const ctx = c.getContext("2d")!;
  ctx.clearRect(0, 0, c.width, c.height);
  mask._hydrated = !mask.imagePath; // empty layer = nothing to load
  if (!mask.imagePath) return;
  const img = new Image();
  img.onload = function () {
    if (page.cleanupMask !== mask) return; // replaced meanwhile
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.drawImage(img, 0, 0);
    mask._hydrated = true;
    if (state.getActivePage() === page) canvas.render();
  };
  img.onerror = function () {
    /* file missing — leave empty */
    mask._hydrated = true; // nothing loadable — treat as ready
  };
  img.src = _fileUrl(mask.imagePath);
}

// ── Coordinates ──

export function stageToImg(sx: number, sy: number): { x: number; y: number } {
  const sr = canvas.getScaleRatio();
  const off = canvas.getOffset();
  return {
    x: Math.round((sx - off.x) / sr),
    y: Math.round((sy - off.y) / sr),
  };
}

export function imgToStage(ix: number, iy: number): { x: number; y: number } {
  const sr = canvas.getScaleRatio();
  const off = canvas.getOffset();
  return { x: off.x + ix * sr, y: off.y + iy * sr };
}

// ── Composite sampling (bg + inpaint patches + cleanup) ──

/** Composite a natural-pixel region into an offscreen canvas. */
export function compositeRegion(
  page: Page,
  x: number,
  y: number,
  w: number,
  h: number,
): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  const ctx = c.getContext("2d")!;
  if (page.backgroundVisible !== false) {
    ctx.drawImage(page.image, x, y, c.width, c.height, 0, 0, c.width, c.height);
  }
  for (const m of page.inpaintMasks) {
    if (!m.visible || !m.image) continue;
    const x0 = Math.max(x, m.bbox.x);
    const y0 = Math.max(y, m.bbox.y);
    const x1 = Math.min(x + w, m.bbox.x + m.bbox.w);
    const y1 = Math.min(y + h, m.bbox.y + m.bbox.h);
    if (x1 <= x0 || y1 <= y0) continue;
    ctx.globalAlpha = m.opacity;
    ctx.drawImage(
      m.image,
      x0 - m.bbox.x,
      y0 - m.bbox.y,
      x1 - x0,
      y1 - y0,
      x0 - x,
      y0 - y,
      x1 - x0,
      y1 - y0,
    );
  }
  ctx.globalAlpha = 1;
  const cc = ensureCleanupCanvas(page);
  if (cc && page.cleanupMask && page.cleanupMask.visible) {
    ctx.globalAlpha = page.cleanupMask.opacity;
    ctx.drawImage(cc, x, y, c.width, c.height, 0, 0, c.width, c.height);
    ctx.globalAlpha = 1;
  }
  return c;
}

export function compositeFull(page: Page): ImageData | null {
  const c = compositeRegion(page, 0, 0, page.naturalWidth, page.naturalHeight);
  return c.getContext("2d")!.getImageData(0, 0, c.width, c.height);
}
