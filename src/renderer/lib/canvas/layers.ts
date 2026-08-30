/* ── Lumina Canvas — Unified layer operations (koharu-style panel) ── */
import { state } from "../state";
import { canvas } from "./index";
import { sidebar } from "../sidebar";
import { history } from "../history";
import { textIdxForLayerId, applyTextSelection } from "./selection";

function _findLayer(
  page: { layers: Array<{ id: string }> } | null,
  id: string | null,
): number {
  if (!page || !id) return -1;
  return page.layers.findIndex(function (l) {
    return l.id === id;
  });
}

canvas.selectLayer = function (id): void {
  const page = state.getActivePage();
  if (!page) return;
  page._selectedLayerId = id;
  // Mirror to the parallel detection selection so the text box on the
  // canvas highlights when a layer is picked from the sidebar.
  page._selectedTextIdx = textIdxForLayerId(page, id);
  canvas.render(); // re-syncs textool transformer to _selectedLayerId
  if (page._selectedTextIdx !== null) {
    canvas.selectTextDetection(page._selectedTextIdx);
  } else {
    // Free-text layer — no parallel detection box; clear the rect highlight
    // without touching _selectedLayerId.
    applyTextSelection(null);
    if (sidebar && sidebar.render) sidebar.render();
  }
};

canvas.setLayerText = function (id, field, text): void {
  const page = state.getActivePage();
  const i = _findLayer(page, id);
  if (!page || i < 0) return;
  const layer = page.layers[i];
  if (field === "source") layer.source = text;
  else layer.translation = text;
  // Mirror to parallel detection model
  if (layer.type === "text-dialogue") {
    const det = page.textDetections[i];
    if (det) {
      if (field === "source") det.text = text;
      else det.translated = text;
    }
  }
  canvas.render();
  history.snapshot();
};

canvas.toggleLayerVisible = function (id): void {
  const page = state.getActivePage();
  const i = _findLayer(page, id);
  if (!page || i < 0) return;
  page.layers[i].visible = !page.layers[i].visible;
  canvas.render();
  sidebar.render();
  history.snapshot();
};

// Virtual "Mask" row — one toggle that flips every inpaint patch at once.
canvas.toggleAllMasks = function (): void {
  const page = state.getActivePage();
  if (!page || page.inpaintMasks.length === 0) return;
  const show = !page.inpaintMasks.some((m) => m.visible);
  page.inpaintMasks.forEach((m) => {
    m.visible = show;
  });
  canvas.render();
  sidebar.render();
  history.snapshot();
};

// Virtual "Background" row — the imported page image itself.
canvas.toggleBackgroundVisible = function (): void {
  const page = state.getActivePage();
  if (!page) return;
  page.backgroundVisible = !page.backgroundVisible;
  canvas.render();
  sidebar.render();
  history.snapshot();
};

canvas.deleteLayer = function (id): void {
  const page = state.getActivePage();
  const i = _findLayer(page, id);
  if (!page || i < 0) return;
  const layer = page.layers[i];
  page.layers.splice(i, 1);
  // Mirror deletion into the parallel detection model
  if (layer.type === "text-dialogue" && i < page.textDetections.length) {
    page.textDetections.splice(i, 1);
  }
  if (page._selectedLayerId === id) page._selectedLayerId = null;
  canvas.render();
  sidebar.render();
  history.snapshot();
};

canvas.moveLayerTo = function (id, insertAt): void {
  const page = state.getActivePage();
  const from = _findLayer(page, id);
  if (!page || from < 0) return;
  const layer = page.layers[from];

  // Clamp the insertion point to the layer's type group — dialogue layers
  // must stay ahead of free-text layers (parallel detection index).
  let groupStart = -1;
  let groupEnd = -1;
  page.layers.forEach(function (l, i) {
    if (l.type === layer.type) {
      if (groupStart < 0) groupStart = i;
      groupEnd = i;
    }
  });
  if (groupStart < 0) return;
  const to = Math.max(groupStart, Math.min(groupEnd + 1, insertAt));
  if (to === from || to === from + 1) return; // no-op

  page.layers.splice(from, 1);
  const insert = from < to ? to - 1 : to;
  page.layers.splice(insert, 0, layer);

  // Mirror reorder in the parallel detection model
  if (layer.type === "text-dialogue") {
    const dets = page.textDetections;
    if (from < dets.length && insert < dets.length) {
      const det = dets.splice(from, 1)[0];
      dets.splice(insert, 0, det);
    }
  }
  canvas.render();
  sidebar.render();
  history.snapshot();
};

// ──
