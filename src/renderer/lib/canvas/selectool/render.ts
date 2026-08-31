/* ── Select Tool — overlay rendering: live preview + marching ants ──
 * The overlay lives on its own Konva layer above the main layer, so it
 * survives the main render loop's full rebuild. Drawn in stage coords so it
 * tracks zoom/pan automatically (canvas.render → refreshOverlay).
 */
import Konva from "konva";
import { canvas } from "../index";
import { state } from "../../state";
import { selections, activeId, imgToStage } from "./shared";

let _layer: Konva.Layer | null = null;
let _ants: Konva.Line[] = [];
let _preview: Konva.Shape | null = null;
let _animation: Konva.Animation | null = null;

/** Closed polyline points array (flat [x,y,...]) from stage-space points */
function _closedPoints(points: Array<{ x: number; y: number }>): number[] {
  const out: number[] = [];
  points.forEach(function (p) {
    out.push(p.x, p.y);
  });
  if (points.length) out.push(points[0].x, points[0].y);
  return out;
}

/** Rect corners from image-pixel bbox, in stage coords */
function _rectStagePoints(b: {
  x: number;
  y: number;
  w: number;
  h: number;
}): Array<{ x: number; y: number }> {
  const a = imgToStage(b.x, b.y);
  const c = imgToStage(b.x + b.w, b.y + b.h);
  return [
    { x: a.x, y: a.y },
    { x: c.x, y: a.y },
    { x: c.x, y: c.y },
    { x: a.x, y: c.y },
  ];
}

function _getLayer(): Konva.Layer | null {
  const stage = canvas.getStage();
  if (!stage) return null;
  if (!_layer) {
    _layer = new Konva.Layer({ listening: false });
    stage.add(_layer);
    _layer.moveToTop();
  }
  return _layer;
}

/** Two overlapping dashed lines = classic black/white marching ants */
function _makeAnt(points: number[], accent: string): Konva.Line[] {
  const dark = new Konva.Line({
    points: points,
    stroke: "#0a0a0a",
    strokeWidth: 2,
    dash: [6, 6],
    listening: false,
    lineJoin: "round",
  });
  const light = new Konva.Line({
    points: points,
    stroke: accent,
    strokeWidth: 1.5,
    dash: [6, 6],
    dashOffset: 6,
    listening: false,
    lineJoin: "round",
  });
  return [dark, light];
}

function _ensureAnimation(): void {
  if (_animation) return;
  _animation = new Konva.Animation(function (frame) {
    const offset = -((frame.time * 0.05) % 12);
    _ants.forEach(function (l) {
      l.dashOffset(offset);
    });
    if (_layer) _layer.batchDraw();
  });
  _animation.start();
}

function _stopAnimationIfIdle(): void {
  if (!_animation) return;
  if (_ants.length === 0 && !_preview) {
    _animation.stop();
    _animation = null;
  }
}

/** Redraw all committed selections on the overlay layer */
export function refreshOverlay(): void {
  const layer = _getLayer();
  if (!state.getActivePage()) {
    if (layer) {
      layer.removeChildren();
      layer.draw();
    }
    _ants = [];
    _stopAnimationIfIdle();
    return;
  }
  if (!layer) {
    _ants = [];
    return;
  }
  layer.removeChildren();
  _ants = [];

  selections.forEach(function (s) {
    const accent = s.id === activeId ? "#ff4d6d" : "#ffffff";
    s.shapes.forEach(function (shape) {
      const pts =
        shape.kind === "rect"
          ? _closedPoints(_rectStagePoints(shape))
          : _closedPoints(
              shape.points.map(function (p) {
                return imgToStage(p.x, p.y);
              }),
            );
      _ants.push.apply(_ants, _makeAnt(pts, accent));
    });
  });

  _ants.forEach(function (l) {
    layer.add(l);
  });
  layer.draw();
  if (_ants.length) _ensureAnimation();
  else _stopAnimationIfIdle();
}

/** Live rubber-band while dragging (before commit) */
export function updatePreview(
  mode: "lasso" | "rect",
  points: Array<{ x: number; y: number }>,
  cx: number,
  cy: number,
): void {
  const layer = _getLayer();
  if (!layer) return;
  if (_preview) {
    _preview.destroy();
    _preview = null;
  }
  if (mode === "rect") {
    _preview = new Konva.Rect({
      x: Math.min(points[0].x, cx),
      y: Math.min(points[0].y, cy),
      width: Math.abs(cx - points[0].x),
      height: Math.abs(cy - points[0].y),
      stroke: "#ff4d6d",
      strokeWidth: 1,
      dash: [5, 5],
      fill: "rgba(255,77,109,0.06)",
      listening: false,
    });
  } else {
    const pts = points.concat([{ x: cx, y: cy }]);
    _preview = new Konva.Line({
      points: _closedPoints(pts),
      stroke: "#ff4d6d",
      strokeWidth: 1.5,
      dash: [5, 5],
      lineJoin: "round",
      listening: false,
    });
  }
  layer.add(_preview);
  layer.draw();
}

export function clearPreview(): void {
  if (!_layer || !_preview) return;
  _preview.destroy();
  _preview = null;
  _layer.draw();
  _stopAnimationIfIdle();
}
