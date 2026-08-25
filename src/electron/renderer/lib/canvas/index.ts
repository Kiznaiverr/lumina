/* ── Lumina Canvas — Public API ── */
import Konva from "konva";
import { state } from "../state";
import { ui } from "../ui";
import { contextMenu } from "../contextMenu";

/**
 * Canvas modules:
 *   render.ts     — stage, render(), getScaleRatio(), getOffset()
 *   detections.ts — group factories, selection, refresh, onToolChange
 *   pages.ts      — page strip, switchPage, removePage
 *
 * This file defines the shared canvas API object that the other
 * canvas modules attach their functions to.
 */
export interface CanvasAPI {
  render(): void;
  getStage(): Konva.Stage | null;
  getLayer(): Konva.Layer | null;
  getScaleRatio(): number;
  getBaseScaleRatio(): number;
  getOffset(): { x: number; y: number };
  TEXT_COLOR: string;
  BUBBLE_COLOR: string;

  _clearGroups(): void;
  _createTextGroup(
    det: import("../../types").TextDetection,
    idx: number,
    sr: number,
    off: { x: number; y: number },
  ): Konva.Group;
  _createBubbleGroup(
    det: import("../../types").BubbleDetection,
    idx: number,
    sr: number,
    off: { x: number; y: number },
  ): Konva.Group;
  _setTextTransformer(t: Konva.Transformer): void;
  _setBubbleTransformer(b: Konva.Transformer): void;
  selectTextDetection(idx: number | null): void;
  selectBubbleDetection(idx: number | null): void;
  deleteTextDetection(idx: number): void;
  deleteBubbleDetection(idx: number): void;
  moveTextDetection(idx: number, dir: number): void;
  moveBubbleDetection(idx: number, dir: number): void;
  _refreshTextGroup(idx: number): void;
  _refreshBubbleGroup(idx: number): void;
  _updateStatus(): void;
  onToolChange(tool: string): void;

  renderPageStrip(): void;
  switchPage(idx: number): void;
  removePage(idx: number): void;
  generateThumbnail(
    page: import("../../types").Page,
    maxW?: number,
    maxH?: number,
  ): string | null;

  setZoom(level: number, anchor?: { x: number; y: number }): void;
  zoomIn(): void;
  zoomOut(): void;
  zoomReset(): void;
  setViewMode(mode: "original" | "cleaned"): void;
  updateViewToggle(): void;
  initBindings(): void;
  _initWheelZoom(): void;
  _initPanDrag(): void;
  _initZoomControls(): void;
  _initKeyboard(): void;
  _initViewToggle(): void;
  _initSidebarResize(): void;
  _initDeselectClick(): void;
}

export const canvas: CanvasAPI = {
  render() {},
  getStage() {
    return null;
  },
  getLayer() {
    return null;
  },
  getScaleRatio() {
    return 1;
  },
  getBaseScaleRatio() {
    return 1;
  },
  getOffset() {
    return { x: 0, y: 0 };
  },
  TEXT_COLOR: "#00ff88",
  BUBBLE_COLOR: "#00bfff",

  _clearGroups() {},
  _createTextGroup() {
    throw new Error("not implemented");
  },
  _createBubbleGroup() {
    throw new Error("not implemented");
  },
  _setTextTransformer() {},
  _setBubbleTransformer() {},
  selectTextDetection() {},
  selectBubbleDetection() {},
  deleteTextDetection() {},
  deleteBubbleDetection() {},
  moveTextDetection() {},
  moveBubbleDetection() {},
  _refreshTextGroup() {},
  _refreshBubbleGroup() {},
  _updateStatus() {},
  onToolChange() {},

  renderPageStrip() {},
  switchPage() {},
  removePage() {},
  generateThumbnail() {
    return null;
  },

  setZoom() {},
  zoomIn() {},
  zoomOut() {},
  zoomReset() {},
  setViewMode() {},
  updateViewToggle() {},
  initBindings() {},
  _initWheelZoom() {},
  _initPanDrag() {},
  _initZoomControls() {},
  _initKeyboard() {},
  _initViewToggle() {},
  _initSidebarResize() {},
  _initDeselectClick() {},
};

/** Zoom constants — zoom level is relative to "fit" (1 = fit) */
const ZOOM_MAX = 64;
const ZOOM_MIN = 0.1;
const ZOOM_STEP = 1.2;

/** Clamp pan so the image can never be dragged fully out of view */
function _clampPan(): void {
  const container = document.getElementById("canvas-container");
  const page = state.getActivePage();
  if (!container || !page) {
    state._panX = 0;
    state._panY = 0;
    return;
  }
  const sr = canvas.getBaseScaleRatio();
  const imgW = page.naturalWidth * sr * (state._zoomLevel || 1);
  const imgH = page.naturalHeight * sr * (state._zoomLevel || 1);
  const cw = container.clientWidth;
  const ch = container.clientHeight;

  // Keep at least 50% of the image visible
  const marginX = Math.max(imgW, cw) / 2;
  const marginY = Math.max(imgH, ch) / 2;

  state._panX = Math.max(-marginX, Math.min(marginX, state._panX || 0));
  state._panY = Math.max(-marginY, Math.min(marginY, state._panY || 0));
}

/** Set zoom level (1 = fit). anchor: optional {x,y} screen point to zoom around */
canvas.setZoom = function (level, anchor) {
  const old = state._zoomLevel || 1;
  // Min zoom = fit — you can never zoom out past the fitted size
  const next = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, level));
  if (next === old) return;

  // Keep the point under the anchor stationary while zooming IN
  if (anchor && next > old) {
    const container = document.getElementById("canvas-container");
    if (container) {
      const rect = container.getBoundingClientRect();
      // Cursor relative to container center, minus current pan
      const cx =
        anchor.x - rect.left - container.clientWidth / 2 - (state._panX || 0);
      const cy =
        anchor.y - rect.top - container.clientHeight / 2 - (state._panY || 0);
      const ratio = next / old;
      state._panX = (state._panX || 0) + cx * (1 - ratio);
      state._panY = (state._panY || 0) + cy * (1 - ratio);
    }
  } else {
    // Zoom OUT shrink toward the viewport center.
    // Scaling pan by the zoom ratio pulls the image smoothly back to
    // center — at fit (zoom 1) pan lands exactly on 0, no snap.
    const ratio = next / old;
    state._panX = (state._panX || 0) * ratio;
    state._panY = (state._panY || 0) * ratio;
  }

  state._zoomLevel = next;
  _clampPan();
  ui.updateZoom();
  canvas.render();
};

canvas.zoomIn = function () {
  canvas.setZoom((state._zoomLevel || 1) * ZOOM_STEP);
};

canvas.zoomOut = function () {
  canvas.setZoom((state._zoomLevel || 1) / ZOOM_STEP);
};

/** Reset zoom to fit AND re-center pan */
canvas.zoomReset = function () {
  state._zoomLevel = 1;
  state._panX = 0;
  state._panY = 0;
  ui.updateZoom();
  canvas.render();
};

/** Wheel: ctrl+wheel or plain wheel = zoom at cursor */
canvas._initWheelZoom = function (): void {
  const container = document.getElementById("canvas-container");
  if (!container) return;
  container.addEventListener(
    "wheel",
    function (e) {
      const page = state.getActivePage();
      if (!page) return;
      e.preventDefault();
      if (e.deltaY < 0) {
        // Zoom in — anchored at cursor
        canvas.setZoom((state._zoomLevel || 1) * ZOOM_STEP, {
          x: e.clientX,
          y: e.clientY,
        });
      } else {
        // Zoom out — Photoshop-style, shrinks toward viewport center
        canvas.setZoom((state._zoomLevel || 1) / ZOOM_STEP);
      }
    },
    { passive: false },
  );
};

/** Pan via select-tool background drag or middle-mouse drag */
let _panBound = false;
export function bindPanWhenStageReady(): void {
  if (_panBound || !canvas.getStage()) return;
  _panBound = true;
  canvas._initPanDrag();
}

canvas._initPanDrag = function (): void {
  let panning = false;
  let last: { x: number; y: number } | null = null;

  function bind(s: Konva.Stage | null): void {
    if (!s) return;
    s.on("mousedown touchstart", function (e) {
      const middleBtn = e.evt && e.evt.button === 1;
      // Pan on: middle-mouse, or ANY tool dragging the empty canvas
      // background. Background = stage itself, backdrop rect, or the
      // page image (all named "bg"). Detection groups/badges never pan.
      const onBackground =
        e.target === s || (e.target.name && e.target.name() === "bg");
      if (!middleBtn && !onBackground) return;
      panning = true;
      last = { x: e.evt.clientX, y: e.evt.clientY };
      const container = document.getElementById("canvas-container");
      if (container) container.style.cursor = "grabbing";
      e.evt.preventDefault();
    });

    window.addEventListener("mousemove", function (e) {
      if (!panning || !last) return;
      state._panX = (state._panX || 0) + (e.clientX - last.x);
      state._panY = (state._panY || 0) + (e.clientY - last.y);
      last = { x: e.clientX, y: e.clientY };
      _clampPan();
      canvas.render();
    });

    window.addEventListener("mouseup", function () {
      if (!panning) return;
      panning = false;
      const container = document.getElementById("canvas-container");
      if (container)
        container.style.cursor =
          state.activeTool === "lasso" ? "crosshair" : "default";
    });
  }

  bind(canvas.getStage());
};

/** Wire zoom control buttons in the overlay */
canvas._initZoomControls = function (): void {
  const btnIn = document.getElementById("btn-zoom-in");
  const btnOut = document.getElementById("btn-zoom-out");
  const btnFit = document.getElementById("btn-zoom-fit");
  if (btnIn)
    btnIn.addEventListener("click", function () {
      canvas.zoomIn();
    });
  if (btnOut)
    btnOut.addEventListener("click", function () {
      canvas.zoomOut();
    });
  if (btnFit)
    btnFit.addEventListener("click", function () {
      canvas.zoomReset();
    });
};

/** Toggle before/after view */
canvas.setViewMode = function (mode): void {
  state._viewMode = mode;
  const btnOriginal = document.getElementById("btn-view-original");
  const btnCleaned = document.getElementById("btn-view-cleaned");
  if (btnOriginal) btnOriginal.classList.toggle("active", mode === "original");
  if (btnCleaned) btnCleaned.classList.toggle("active", mode === "cleaned");
  canvas.render();
};

/** Toggle view buttons visibility */
canvas.updateViewToggle = function (): void {
  const toggle = document.getElementById("view-toggle");
  if (!toggle) return;
  const page = state.getActivePage();
  if (page && page.cleanedImage) {
    toggle.classList.remove("hidden");
  } else {
    toggle.classList.add("hidden");
  }
};

/** Keyboard shortcuts for canvas */
canvas._initKeyboard = function (): void {
  document.addEventListener("keydown", function (e) {
    if (
      e.target instanceof HTMLInputElement ||
      e.target instanceof HTMLTextAreaElement
    )
      return;
    // Delete selected detection
    if (e.key === "Delete" || e.key === "Backspace") {
      const page = state.getActivePage();
      if (!page) return;
      if (page._selectedTextIdx !== null) {
        e.preventDefault();
        canvas.deleteTextDetection(page._selectedTextIdx);
      } else if (page._selectedBubbleIdx !== null) {
        e.preventDefault();
        canvas.deleteBubbleDetection(page._selectedBubbleIdx);
      }
      return;
    }
    if (e.key === " " || e.code === "Space") {
      e.preventDefault();
      const page = state.getActivePage();
      if (page && page.cleanedImage) {
        canvas.setViewMode(
          state._viewMode === "original" ? "cleaned" : "original",
        );
      }
    }
  });
};

/** Wire view toggle buttons */
canvas._initViewToggle = function (): void {
  const btnOriginal = document.getElementById("btn-view-original");
  const btnCleaned = document.getElementById("btn-view-cleaned");
  if (btnOriginal) {
    btnOriginal.addEventListener("click", function () {
      canvas.setViewMode("original");
    });
  }
  if (btnCleaned) {
    btnCleaned.addEventListener("click", function () {
      canvas.setViewMode("cleaned");
    });
  }
};

/** Wire deselect-on-empty-click once */
let _deselectBound = false;
canvas._initDeselectClick = function (): void {
  if (_deselectBound) return;
  const stage = canvas.getStage();
  if (!stage) return;
  _deselectBound = true;
  stage.on("click tap", function (e) {
    if (e.target === stage || e.target.getParent() === canvas.getLayer()) {
      canvas.selectTextDetection(null);
      canvas.selectBubbleDetection(null);
    }
  });
  // Right-click on empty canvas → deselect-only context menu
  stage.on("contextmenu", function (e) {
    if (e.target !== stage && e.target.getParent() !== canvas.getLayer())
      return;
    e.evt.preventDefault();
    // Detection groups fire their own contextmenu with cancelBubble —
    // reaching here means empty area.
    contextMenu.show(e.evt.clientX, e.evt.clientY, [
      {
        labelKey: "ctx.deselect",
        action: function () {
          canvas.selectTextDetection(null);
          canvas.selectBubbleDetection(null);
        },
      },
    ]);
  });
};

/** Sidebar resize */
canvas._initSidebarResize = function (): void {
  const sidebarEl = document.getElementById("sidebar");
  const resizeHandle = document.getElementById("sidebar-resize");
  if (!sidebarEl || !resizeHandle) return;

  let dragging = false;
  resizeHandle.addEventListener("mousedown", function (e) {
    dragging = true;
    e.preventDefault();
  });
  document.addEventListener("mousemove", function (e) {
    if (!dragging) return;
    let newWidth = window.innerWidth - e.clientX;
    newWidth = Math.max(180, Math.min(400, newWidth));
    sidebarEl.style.width = newWidth + "px";
    state.sidebarWidth = newWidth;
  });
  document.addEventListener("mouseup", function () {
    if (dragging) {
      dragging = false;
      // Canvas stage size depends on container width — re-fit after resize
      canvas.render();
    }
  });
};

/** Init all canvas-related keyboard/UI bindings */
canvas.initBindings = function (): void {
  canvas._initKeyboard();
  canvas._initViewToggle();
  canvas._initSidebarResize();
  canvas._initWheelZoom();
  canvas._initPanDrag();
  canvas._initZoomControls();
};
