/* ── Lumina Canvas — Stage & Render ── */
import Konva from "konva";
import { state } from "../state";
import { canvas, bindPanWhenStageReady } from "./index";
import { renderLayerTextNodes } from "./textool";

/**
 * Canvas render module.
 * Single Konva stage inside #canvas-container.
 * Composite order: original page image → inpaint mask images (one per
 * visible patch, alpha = feathered mask) → text layers.
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

  // Background is the original page image — inpaint patches are composited
  // on top as layered masks (Photoshop-style). Hiding it leaves text and
  // masks visible above the dark backdrop.
  if (page.backgroundVisible !== false) {
    _bgImage = new Konva.Image({
      name: "bg",
      image: page.image,
      x: off.x,
      y: off.y,
      width: page.naturalWidth * sr,
      height: page.naturalHeight * sr,
    });
    _layer.add(_bgImage);
  }

  // Inpaint masks: one Konva.Image per patch. The patch PNG's alpha channel
  // is the feathered mask, so Konva's normal alpha compositing reproduces
  // the old cleaned result exactly — while each region stays independently
  // toggleable / deletable / opacity-adjustable.
  if (page.inpaintMasks) {
    page.inpaintMasks.forEach(function (m) {
      if (!m.visible || !m.image) return;
      const mi = new Konva.Image({
        name: "inpaint-mask",
        image: m.image,
        x: off.x + m.bbox.x * sr,
        y: off.y + m.bbox.y * sr,
        width: m.bbox.w * sr,
        height: m.bbox.h * sr,
        opacity: m.opacity,
        listening: false,
      });
      _layer!.add(mi);
    });
  }

  // Detection overlays — shown only while boxes are toggled on, BEFORE the
  // first inpaint run; once mask layers exist the patches themselves are the
  // visual representation of the boxes. After OCR the boxes auto-hide (the
  // OCR text lives in the sidebar layers) but the user can re-show them to
  // verify/adjust a box and re-run OCR.
  if (
    state.showDetBoxes &&
    page.inpaintMasks.length === 0 &&
    page.textDetections &&
    page.textDetections.length > 0
  ) {
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

  // Unified text layers are rendered by textTool.renderLayerTextNodes() —
  // one Konva.Text per layer that is both visual and interactive (select,
  // move, resize via transformer, double-click to edit).
  renderLayerTextNodes();

  canvas._updateStatus();
  canvas.updateBoxToggle();
  _layer.draw();
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
