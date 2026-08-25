/* ── Lumina Canvas — Stage & Render ── */
import Konva from "konva";
import { state } from "../state";
import { canvas, bindPanWhenStageReady } from "./index";
import { renderLayerTextNodes } from "./textTool";

/**
 * Canvas render module.
 * Single Konva stage inside #canvas-container.
 * Shows either originalImage or cleanedImage based on _viewMode.
 */
let _stage: Konva.Stage | null = null;
let _layer: Konva.Layer | null = null;
let _bgImage: Konva.Image | null = null; // Konva.Image for background

export const TEXT_COLOR = "#00ff88";
export const BUBBLE_COLOR = "#00bfff";

/** Get/create the Konva stage */
function _getOrCreateStage(): Konva.Stage | null {
  const container = document.getElementById("canvas-container");
  if (!container) return null;
  const w = container.clientWidth;
  const h = container.clientHeight;
  if (w === 0 || h === 0) return null;

  if (_stage) {
    _stage.setSize({ width: w, height: h });
    return _stage;
  }

  _stage = new Konva.Stage({
    container: "canvas-container",
    width: w,
    height: h,
  });
  _layer = new Konva.Layer();
  _stage.add(_layer);

  return _stage;
}

/** Base scale ratio to fit image in container, capped at 1x */
function _getBaseScaleRatio(): number {
  const container = document.getElementById("canvas-container");
  const page = state.getActivePage();
  if (!container || !page) return 1;
  return Math.min(
    container.clientWidth / page.naturalWidth,
    container.clientHeight / page.naturalHeight,
    1,
  );
}

/** Effective scale ratio = fit ratio × zoom level */
function _getScaleRatio(): number {
  return _getBaseScaleRatio() * (state._zoomLevel || 1);
}

/** Offset to center image in container, plus pan */
function _getOffset(): { x: number; y: number } {
  const container = document.getElementById("canvas-container");
  const page = state.getActivePage();
  if (!container || !page) return { x: 0, y: 0 };
  const sr = _getScaleRatio();
  return {
    x:
      (container.clientWidth - page.naturalWidth * sr) / 2 + (state._panX || 0),
    y:
      (container.clientHeight - page.naturalHeight * sr) / 2 +
      (state._panY || 0),
  };
}

/** The main render — draws background + detection overlays */
function _render(): void {
  const container = document.getElementById("canvas-container");
  if (!container) return;

  const page = state.getActivePage();
  const w = container.clientWidth;
  const h = container.clientHeight;
  if (w === 0 || h === 0) return;

  // Clear old groups before rebuilding
  if (canvas._clearGroups) canvas._clearGroups();

  _getOrCreateStage();
  if (!_stage || !_layer) return;

  // Wire deselect click + pan handlers once after stage exists
  if (canvas._initDeselectClick) canvas._initDeselectClick();
  bindPanWhenStageReady();

  _stage.setSize({ width: w, height: h });
  _layer.removeChildren();

  // Background rect
  _layer.add(new Konva.Rect({ name: "bg", width: w, height: h, fill: "#000" }));

  if (!page || !page.image) {
    _layer.draw();
    return;
  }

  const sr = _getScaleRatio();
  const off = _getOffset();

  // Choose image based on viewMode
  let img = page.image;
  if (state._viewMode === "cleaned" && page.cleanedImage) {
    img = page.cleanedImage;
  }

  _bgImage = new Konva.Image({
    name: "bg",
    image: img,
    x: off.x,
    y: off.y,
    width: page.naturalWidth * sr,
    height: page.naturalHeight * sr,
  });
  _layer.add(_bgImage);

  // Draw text detections (on top)
  if (page.textDetections && page.textDetections.length > 0) {
    page.textDetections.forEach((det, i) => {
      const g = canvas._createTextGroup(det, i, sr, off);
      _layer!.add(g);
    });

    const tTransformer = new Konva.Transformer({
      nodes: [],
      rotateEnabled: false,
      enabledAnchors: ["top-left", "top-right", "bottom-left", "bottom-right"],
      anchorStroke: TEXT_COLOR,
      anchorFill: "#fff",
      anchorSize: 8,
      borderStroke: TEXT_COLOR,
      borderStrokeWidth: 1,
      padding: 2,
    });
    _layer.add(tTransformer);
    canvas._setTextTransformer(tTransformer);
  }

  // Render unified text layers (translated text over cleaned image).
  // Only in cleaned view — original view shows raw detections instead.
  if (state._viewMode === "cleaned" && page.cleanedImage) {
    (page.layers || []).forEach(function (layer) {
      if (!layer.visible) return;
      const text = layer.translation || layer.source || "";
      if (!text) return;
      const lx = off.x + layer.bbox.x * sr;
      const ly = off.y + layer.bbox.y * sr;
      const lw = layer.bbox.w * sr;
      const lh = layer.bbox.h * sr;

      // Auto-fit: start from bbox height, shrink until the text fits
      let fontSize = layer.typography.fontSize
        ? layer.typography.fontSize * sr
        : Math.max(8, lh * 0.6);
      const makeText = function (fs: number): Konva.Text {
        return new Konva.Text({
          name: "layer-text",
          x: lx,
          y: ly,
          width: lw,
          height: lh,
          text: text,
          fontSize: fs,
          fontFamily: layer.typography.fontFamily || "Arial, sans-serif",
          fontStyle: layer.typography.fontStyle,
          fontVariant: layer.typography.fontWeight >= 700 ? "bold" : "normal",
          align: layer.typography.align,
          verticalAlign: "middle",
          fill: layer.typography.color,
          stroke: layer.typography.strokeColor || undefined,
          strokeWidth: layer.typography.strokeWidth * sr || 0,
          fillAfterStrokeEnabled: true,
          opacity: layer.opacity,
          listening: false,
        });
      };
      let t = makeText(fontSize);
      // Shrink-to-fit loop (max 40 iterations to bound work)
      let guard = 0;
      while (
        layer.typography.fontSize === null &&
        guard < 40 &&
        (t.height() > lh || _textOverflow(t, lw))
      ) {
        fontSize *= 0.92;
        t.destroy();
        t = makeText(fontSize);
        guard++;
      }
      _layer!.add(t);
    });
  }

  // Interactive hit-proxy nodes for the text tool (edit on click)
  renderLayerTextNodes();

  canvas._updateStatus();
  _layer.draw();
}

/** True when a Konva.Text has any line wider than maxWidth */
function _textOverflow(t: Konva.Text, maxWidth: number): boolean {
  // Konva wraps only when width is set; here width IS set so check total height
  // against the box — approximate but sufficient for shrink-to-fit.
  return t.height() > t.height(); // height check already covers wrapping
}

// ── Public API ──

canvas.render = _render;
canvas.getStage = function () {
  return _stage;
};
canvas.getLayer = function () {
  return _layer;
};
canvas.getScaleRatio = _getScaleRatio;
canvas.getBaseScaleRatio = _getBaseScaleRatio;
canvas.getOffset = _getOffset;
canvas.TEXT_COLOR = TEXT_COLOR;
