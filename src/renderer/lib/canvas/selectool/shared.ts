/* ── Select Tool — shared state & types ──
 * Photoshop-style selection tool state. Selections are transient UI state
 * (module-level, like the textool editor) — they are NOT persisted to the
 * project and clear on page switch / explicit clear.
 */
import { canvas } from "../index";

export type SelectionShape =
  | { kind: "rect"; x: number; y: number; w: number; h: number }
  | { kind: "polygon"; points: Array<{ x: number; y: number }> };

export interface Selection {
  id: string;
  /** All sub-shapes that make up this selection (merged / carved pieces). */
  shapes: SelectionShape[];
}

/** Committed selections (image-pixel coords). */
export const selections: Selection[] = [];
/** The selection the context bar anchors to. */
export let activeId: string | null = null;

export function setActiveId(id: string | null): void {
  activeId = id;
}

export function activeSelection(): Selection | null {
  return (
    selections.find(function (s) {
      return s.id === activeId;
    }) || null
  );
}

export function clearSelections(): void {
  selections.length = 0;
  activeId = null;
}

/** Stage coords → image-space page coords (pixels) */
export function stageToImg(sx: number, sy: number): { x: number; y: number } {
  const sr = canvas.getScaleRatio();
  const off = canvas.getOffset();
  return {
    x: Math.round((sx - off.x) / sr),
    y: Math.round((sy - off.y) / sr),
  };
}

/** Image-space page coords (pixels) → stage coords */
export function imgToStage(ix: number, iy: number): { x: number; y: number } {
  const sr = canvas.getScaleRatio();
  const off = canvas.getOffset();
  return { x: off.x + ix * sr, y: off.y + iy * sr };
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

function _shapeAABB(shape: SelectionShape): Rect {
  if (shape.kind === "rect") return Object.assign({}, shape);
  const xs = shape.points.map(function (p) {
    return p.x;
  });
  const ys = shape.points.map(function (p) {
    return p.y;
  });
  const x = Math.min.apply(null, xs);
  const y = Math.min.apply(null, ys);
  return {
    x: x,
    y: y,
    w: Math.max.apply(null, xs) - x,
    h: Math.max.apply(null, ys) - y,
  };
}

/** Axis-aligned bounding box of a single shape, in image pixels */
export function shapeAABB(shape: SelectionShape): Rect {
  return _shapeAABB(shape);
}

/** Axis-aligned bounding box of a whole selection, in image pixels */
export function selectionAABB(s: Selection): Rect {
  let b: Rect | null = null;
  s.shapes.forEach(function (sh) {
    const a = _shapeAABB(sh);
    if (!b) {
      b = a;
    } else {
      const minX = Math.min(b.x, a.x);
      const minY = Math.min(b.y, a.y);
      b = {
        x: minX,
        y: minY,
        w: Math.max(b.x + b.w, a.x + a.w) - minX,
        h: Math.max(b.y + b.h, a.y + a.h) - minY,
      };
    }
  });
  return b || { x: 0, y: 0, w: 0, h: 0 };
}

/** Point (image px) inside a shape? */
export function pointInShape(
  shape: SelectionShape,
  p: { x: number; y: number },
): boolean {
  if (shape.kind === "rect") {
    return (
      p.x >= shape.x &&
      p.x <= shape.x + shape.w &&
      p.y >= shape.y &&
      p.y <= shape.y + shape.h
    );
  }
  const pts = shape.points;
  // point-in-polygon (ray casting)
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i].x;
    const yi = pts[i].y;
    const xj = pts[j].x;
    const yj = pts[j].y;
    if (
      yi > p.y !== yj > p.y &&
      p.x < ((xj - xi) * (p.y - yi)) / (yj - yi) + xi
    ) {
      inside = !inside;
    }
  }
  return inside;
}

/** Hit test in stage coords (click-to-activate). */
export function hitTest(s: Selection, sx: number, sy: number): boolean {
  const p = stageToImg(sx, sy);
  return s.shapes.some(function (sh) {
    return pointInShape(sh, p);
  });
}

// ── Geometry: intersection / boolean ops (image px) ──

function _shapePoints(shape: SelectionShape): Array<{ x: number; y: number }> {
  if (shape.kind === "rect") {
    return [
      { x: shape.x, y: shape.y },
      { x: shape.x + shape.w, y: shape.y },
      { x: shape.x + shape.w, y: shape.y + shape.h },
      { x: shape.x, y: shape.y + shape.h },
    ];
  }
  return shape.points;
}

function _orient(
  a: { x: number; y: number },
  b: { x: number; y: number },
  c: { x: number; y: number },
): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function _onSeg(
  p: { x: number; y: number },
  a: { x: number; y: number },
  b: { x: number; y: number },
): boolean {
  return (
    p.x >= Math.min(a.x, b.x) - 1e-9 &&
    p.x <= Math.max(a.x, b.x) + 1e-9 &&
    p.y >= Math.min(a.y, b.y) - 1e-9 &&
    p.y <= Math.max(a.y, b.y) + 1e-9
  );
}

function _segIntersect(
  a: { x: number; y: number },
  b: { x: number; y: number },
  c: { x: number; y: number },
  d: { x: number; y: number },
): boolean {
  const o1 = _orient(a, b, c);
  const o2 = _orient(a, b, d);
  const o3 = _orient(c, d, a);
  const o4 = _orient(c, d, b);
  if (
    ((o1 > 0 && o2 < 0) || (o1 < 0 && o2 > 0)) &&
    ((o3 > 0 && o4 < 0) || (o3 < 0 && o4 > 0))
  ) {
    return true;
  }
  if (o1 === 0 && _onSeg(c, a, b)) return true;
  if (o2 === 0 && _onSeg(d, a, b)) return true;
  if (o3 === 0 && _onSeg(a, c, d)) return true;
  if (o4 === 0 && _onSeg(b, c, d)) return true;
  return false;
}

/** Do two shapes overlap at all? */
export function shapesIntersect(a: SelectionShape, b: SelectionShape): boolean {
  const aa = _shapeAABB(a);
  const ab = _shapeAABB(b);
  if (
    aa.x > ab.x + ab.w ||
    ab.x > aa.x + aa.w ||
    aa.y > ab.y + ab.h ||
    ab.y > aa.y + aa.h
  ) {
    return false;
  }
  const pa = _shapePoints(a);
  const pb = _shapePoints(b);
  for (let i = 0; i < pa.length; i++) {
    for (let j = 0; j < pb.length; j++) {
      if (
        _segIntersect(
          pa[i],
          pa[(i + 1) % pa.length],
          pb[j],
          pb[(j + 1) % pb.length],
        )
      ) {
        return true;
      }
    }
  }
  if (
    pa.some(function (p) {
      return pointInShape(b, p);
    })
  ) {
    return true;
  }
  if (
    pb.some(function (p) {
      return pointInShape(a, p);
    })
  ) {
    return true;
  }
  return false;
}

/** Rect minus rect → up to 4 non-overlapping rect slabs. */
function _carveRect(r: Rect, c: Rect): Rect[] {
  const l = Math.max(r.x, c.x);
  const t = Math.max(r.y, c.y);
  const rr = Math.min(r.x + r.w, c.x + c.w);
  const bb = Math.min(r.y + r.h, c.y + c.h);
  const out: Rect[] = [];
  if (l > r.x) out.push({ x: r.x, y: r.y, w: l - r.x, h: r.h });
  if (rr < r.x + r.w) out.push({ x: rr, y: r.y, w: r.x + r.w - rr, h: r.h });
  if (t > r.y) out.push({ x: l, y: r.y, w: rr - l, h: t - r.y });
  if (bb < r.y + r.h) out.push({ x: l, y: bb, w: rr - l, h: r.y + r.h - bb });
  return out.filter(function (s) {
    return s.w >= 1 && s.h >= 1;
  });
}

function _polyArea(pts: Array<{ x: number; y: number }>): number {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    a += p.x * q.y - p.y * q.x;
  }
  return Math.abs(a) / 2;
}

/** Polygon minus rect → exact boundary loops (outer + holes, each a loop).
 * The old 4-strip Sutherland-Hodgman clip could not represent a disjoint
 * intersection of a concave polygon, emitting "bridge" edges (extra lines).
 * This uses the same edge-splitting + probe classification as unionOutline. */
function _polygonMinusRect(
  points: Array<{ x: number; y: number }>,
  r: Rect,
): Array<Array<{ x: number; y: number }>> {
  return _diffLoops(
    { kind: "polygon", points: points },
    { kind: "rect", x: r.x, y: r.y, w: r.w, h: r.h },
  );
}

/** True when `shape` sits fully inside another shape of the same selection —
 * a "hole" loop produced by carving. Rendered as an inner outline but never
 * converted to its own detection, and excluded from later unions. */
export function isHoleShape(
  shapes: SelectionShape[],
  shape: SelectionShape,
): boolean {
  const c = _shapeCentroid(shape);
  return shapes.some(function (o) {
    if (o === shape) return false;
    return pointInShape(o, c);
  });
}

function _shapeCentroid(shape: SelectionShape): { x: number; y: number } {
  const b = _shapeAABB(shape);
  return { x: b.x + b.w / 2, y: b.y + b.h / 2 };
}

function _aabbOverlapArea(a: Rect, b: Rect): number {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}

/** Remove `sub` from `shape` → remaining shapes (may be []). */
export function subtractShape(
  shape: SelectionShape,
  sub: SelectionShape,
): SelectionShape[] {
  if (!shapesIntersect(shape, sub)) return [shape];

  // Exact cases: rect − rect (slab decomposition), polygon − rect (clip).
  if (shape.kind === "rect" && sub.kind === "rect") {
    return _carveRect(shape, sub)
      .filter(function (r) {
        return r.w >= 6 || r.h >= 6;
      })
      .map(function (r): SelectionShape {
        return { kind: "rect", x: r.x, y: r.y, w: r.w, h: r.h };
      });
  }
  if (shape.kind === "polygon" && sub.kind === "rect") {
    return _polygonMinusRect(shape.points, sub)
      .map(function (pts): SelectionShape {
        return { kind: "polygon", points: pts };
      })
      .filter(function (p) {
        return p.kind === "polygon" && _polyArea(p.points) >= 1;
      });
  }

  // Lasso as the cutting tool: an exact difference would need polygon-on-
  // polygon clipping — approximate by dropping the shape when the overlap
  // covers a meaningful part of its bounding box.
  const total = _shapeAABB(shape);
  const totalArea = total.w * total.h;
  const ov = _aabbOverlapArea(total, _shapeAABB(sub));
  if (totalArea > 0 && ov / totalArea >= 0.4) return [];
  return [shape];
}

// ── Boolean union (Photoshop-style merge outline) ──

interface _Seg {
  a: { x: number; y: number };
  b: { x: number; y: number };
}

/** Split every edge at every crossing (incl. collinear overlap & T-junctions). */
function _splitEdges(shapes: SelectionShape[]): _Seg[] {
  const edges: _Seg[] = [];
  shapes.forEach(function (sh) {
    const pts = _shapePoints(sh);
    for (let i = 0; i < pts.length; i++) {
      edges.push({ a: pts[i], b: pts[(i + 1) % pts.length] });
    }
  });
  const splitAt: Array<Array<{ t: number; p: { x: number; y: number } }>> =
    edges.map(function () {
      return [];
    });
  for (let i = 0; i < edges.length; i++) {
    for (let j = i + 1; j < edges.length; j++) {
      const e1 = edges[i];
      const e2 = edges[j];
      _segCrossPoints(e1.a, e1.b, e2.a, e2.b).forEach(function (p) {
        const t1 = _paramOnSeg(e1.a, e1.b, p);
        const t2 = _paramOnSeg(e2.a, e2.b, p);
        if (t1 !== null) splitAt[i].push({ t: t1, p: p });
        if (t2 !== null) splitAt[j].push({ t: t2, p: p });
      });
    }
  }
  const out: _Seg[] = [];
  edges.forEach(function (e, i) {
    const pts: Array<{ t: number; p: { x: number; y: number } }> = [
      { t: 0, p: e.a },
    ];
    splitAt[i]
      .sort(function (x, y) {
        return x.t - y.t;
      })
      .forEach(function (s) {
        const last = pts[pts.length - 1];
        if (Math.abs(s.t - last.t) > 1e-9) pts.push(s);
      });
    pts.push({ t: 1, p: e.b });
    for (let k = 0; k < pts.length - 1; k++) {
      if (pts[k + 1].t - pts[k].t > 1e-9) {
        out.push({ a: pts[k].p, b: pts[k + 1].p });
      }
    }
  });
  return out;
}

/** All points where segment ab and cd meet (proper crossing, endpoints, overlap). */
function _segCrossPoints(
  a: { x: number; y: number },
  b: { x: number; y: number },
  c: { x: number; y: number },
  d: { x: number; y: number },
): Array<{ x: number; y: number }> {
  const o1 = _orient(a, b, c);
  const o2 = _orient(a, b, d);
  const o3 = _orient(c, d, a);
  const o4 = _orient(c, d, b);
  const out: Array<{ x: number; y: number }> = [];
  if (
    ((o1 > 0 && o2 < 0) || (o1 < 0 && o2 > 0)) &&
    ((o3 > 0 && o4 < 0) || (o3 < 0 && o4 > 0))
  ) {
    const denom = (a.x - b.x) * (c.y - d.y) - (a.y - b.y) * (c.x - d.x);
    if (denom !== 0) {
      const t = ((a.x - c.x) * (c.y - d.y) - (a.y - c.y) * (c.x - d.x)) / denom;
      out.push({ x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) });
    }
  } else if (o1 === 0 && o2 === 0) {
    // Collinear: shared/overlapping span endpoints.
    if (_onSeg(c, a, b)) out.push(c);
    if (_onSeg(d, a, b)) out.push(d);
    if (_onSeg(a, c, d)) out.push(a);
    if (_onSeg(b, c, d)) out.push(b);
  } else {
    // T-junction / endpoint touching the interior of the other edge.
    if (o1 === 0 && _onSeg(c, a, b)) out.push(c);
    if (o2 === 0 && _onSeg(d, a, b)) out.push(d);
    if (o3 === 0 && _onSeg(a, c, d)) out.push(a);
    if (o4 === 0 && _onSeg(b, c, d)) out.push(b);
  }
  return out;
}

function _paramOnSeg(
  a: { x: number; y: number },
  b: { x: number; y: number },
  p: { x: number; y: number },
): number | null {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return null;
  const t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  if (t < -1e-9 || t > 1 + 1e-9) return null;
  const qx = a.x + t * dx;
  const qy = a.y + t * dy;
  if (Math.abs(qx - p.x) > 1e-6 || Math.abs(qy - p.y) > 1e-6) return null;
  return t;
}

/** Union of every shape = one or more closed outline loops (exact boolean OR). */
export function unionOutline(
  shapes: SelectionShape[],
): Array<Array<{ x: number; y: number }>> {
  if (!shapes.length) return [];
  const segs = _splitEdges(shapes);
  // Keep boundary segments: exactly ONE side of the segment is inside the
  // union (probe ±0.5px along the normal). Interior segments have both
  // sides inside; coincident ones are deduped below.
  const kept: _Seg[] = [];
  segs.forEach(function (s) {
    const mx = (s.a.x + s.b.x) / 2;
    const my = (s.a.y + s.b.y) / 2;
    const dx = s.b.x - s.a.x;
    const dy = s.b.y - s.a.y;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    const inL = _anyPointIn(shapes, { x: mx + nx * 0.5, y: my + ny * 0.5 });
    const inR = _anyPointIn(shapes, { x: mx - nx * 0.5, y: my - ny * 0.5 });
    if (inL !== inR) kept.push(s);
  });
  // Dedupe coincident segments (touching shapes share an edge).
  const seen = new Set<string>();
  const unique: _Seg[] = [];
  kept.forEach(function (s) {
    const key = _segKey(s);
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(s);
    }
  });
  return _chainSegs(unique);
}

/** Exact boolean difference A − B as closed boundary loops (outer ring +
 * holes, each loop separate). Same edge-splitting machinery as the union:
 * keep a sub-segment when exactly ONE of its sides lies in A \ B. */
function _diffLoops(
  a: SelectionShape,
  b: SelectionShape,
): Array<Array<{ x: number; y: number }>> {
  const segs = _splitEdges([a, b]);
  const kept: _Seg[] = [];
  segs.forEach(function (s) {
    const mx = (s.a.x + s.b.x) / 2;
    const my = (s.a.y + s.b.y) / 2;
    const dx = s.b.x - s.a.x;
    const dy = s.b.y - s.a.y;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    const inA = function (p: { x: number; y: number }): boolean {
      return pointInShape(a, p);
    };
    const inB = function (p: { x: number; y: number }): boolean {
      return pointInShape(b, p);
    };
    const rL =
      inA({ x: mx + nx * 0.5, y: my + ny * 0.5 }) &&
      !inB({ x: mx + nx * 0.5, y: my + ny * 0.5 });
    const rR =
      inA({ x: mx - nx * 0.5, y: my - ny * 0.5 }) &&
      !inB({ x: mx - nx * 0.5, y: my - ny * 0.5 });
    if (rL !== rR) kept.push(s);
  });
  // Coincident segments (shared edges) cancel in a difference.
  const seen = new Set<string>();
  const unique: _Seg[] = [];
  kept.forEach(function (s) {
    const key = _segKey(s);
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(s);
    }
  });
  return _chainSegs(unique);
}

function _anyPointIn(
  shapes: SelectionShape[],
  p: { x: number; y: number },
): boolean {
  return shapes.some(function (sh) {
    return pointInShape(sh, p);
  });
}

function _segKey(s: _Seg): string {
  const f =
    s.a.x < s.b.x || (s.a.x === s.b.x && s.a.y <= s.b.y)
      ? { p: s.a, q: s.b }
      : { p: s.b, q: s.a };
  return (
    f.p.x.toFixed(3) +
    "," +
    f.p.y.toFixed(3) +
    "-" +
    f.q.x.toFixed(3) +
    "," +
    f.q.y.toFixed(3)
  );
}

function _near(
  a: { x: number; y: number },
  b: { x: number; y: number },
  eps = 1e-3,
): boolean {
  return Math.abs(a.x - b.x) <= eps && Math.abs(a.y - b.y) <= eps;
}

/** Greedy chain of kept segments into closed loops, dropping collinear points. */
function _chainSegs(segs: _Seg[]): Array<Array<{ x: number; y: number }>> {
  const loops: Array<Array<{ x: number; y: number }>> = [];
  const used = new Array<boolean>(segs.length).fill(false);
  let guardTotal = 0;
  while (guardTotal++ < segs.length + 1) {
    let start = -1;
    for (let i = 0; i < segs.length; i++) {
      if (!used[i]) {
        start = i;
        break;
      }
    }
    if (start < 0) break;
    const loop: Array<{ x: number; y: number }> = [
      segs[start].a,
      segs[start].b,
    ];
    used[start] = true;
    let cur = segs[start].b;
    let guard = 0;
    while (guard++ < segs.length * 2) {
      let next = -1;
      for (let i = 0; i < segs.length; i++) {
        if (used[i]) continue;
        if (_near(segs[i].a, cur)) {
          next = i;
          cur = segs[i].b;
          loop.push(segs[i].b);
          break;
        }
        if (_near(segs[i].b, cur)) {
          next = i;
          cur = segs[i].a;
          loop.push(segs[i].a);
          break;
        }
      }
      if (next < 0) break;
      used[next] = true;
      if (_near(cur, loop[0])) break;
    }
    if (loop.length && _near(loop[loop.length - 1], loop[0])) loop.pop();
    const out: Array<{ x: number; y: number }> = [];
    const n = loop.length;
    for (let i = 0; i < n; i++) {
      const prev = loop[(i - 1 + n) % n];
      const curP = loop[i];
      const next = loop[(i + 1) % n];
      const c =
        (curP.x - prev.x) * (next.y - curP.y) -
        (curP.y - prev.y) * (next.x - curP.x);
      if (Math.abs(c) > 1e-6) out.push(curP);
    }
    if (out.length >= 3) loops.push(out);
  }
  return loops;
}
