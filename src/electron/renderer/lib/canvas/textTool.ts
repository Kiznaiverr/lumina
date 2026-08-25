/* ── Lumina Canvas — Text Tool (Photoshop-style) ──
 * Tool "text": click on canvas → create a free text layer with an inline
 * textarea editor at the click position. Commit on Enter/blur, cancel on Esc.
 * Double-click an existing layer (in cleaned view) to edit its text.
 */
import Konva from "konva";
import { state } from "../state";
import { canvas } from "./index";
import { sidebar } from "../sidebar";
import { history } from "../history";
import { defaultTypography } from "../../types";
import type { PageLayer } from "../../types";

let _editor: HTMLTextAreaElement | null = null;
let _editingLayerId: string | null = null;
let _bound = false;

function _stagePos(e: MouseEvent): { x: number; y: number } | null {
  const stage = canvas.getStage();
  if (!stage) return null;
  const container = stage.container();
  const rect = container.getBoundingClientRect();
  return { x: e.clientX - rect.left, y: e.clientY - rect.top };
}

/** Convert a stage-space point into image-space page coordinates */
function _toImageSpace(sx: number, sy: number): { x: number; y: number } {
  const sr = canvas.getScaleRatio();
  const off = canvas.getOffset();
  return {
    x: Math.round((sx - off.x) / sr),
    y: Math.round((sy - off.y) / sr),
  };
}

function _removeEditor(): void {
  if (_editor) {
    _editor.remove();
    _editor = null;
  }
  _editingLayerId = null;
}

/** Show a textarea overlay at a stage position for inline text entry */
function _showEditor(
  sx: number,
  sy: number,
  initial: string,
  layerId: string | null,
): void {
  _removeEditor();
  const stage = canvas.getStage();
  if (!stage) return;
  const container = stage.container();
  const abs = stage.getAbsoluteTransform().point({ x: sx, y: sy });

  const ta = document.createElement("textarea");
  ta.id = "text-tool-editor";
  ta.value = initial;
  ta.style.position = "absolute";
  ta.style.left = abs.x + "px";
  ta.style.top = abs.y + "px";
  ta.style.minWidth = "160px";
  ta.style.minHeight = "40px";
  ta.style.background = "rgba(14,14,16,0.92)";
  ta.style.color = "#fff";
  ta.style.border = "1px solid #e94560";
  ta.style.borderRadius = "4px";
  ta.style.padding = "4px 6px";
  ta.style.fontSize = "13px";
  ta.style.fontFamily = "Arial, sans-serif";
  ta.style.outline = "none";
  ta.style.resize = "both";
  ta.style.zIndex = "50";

  const commit = function (): void {
    const value = ta.value.trim();
    if (layerId && value) {
      // Edit existing layer
      canvas.setLayerText(layerId, "translation", value);
    } else if (layerId && !value) {
      // Emptied text deletes the layer
      canvas.deleteLayer(layerId);
    } else if (value) {
      // Create new free-text layer at the click position
      _createLayerAt(sx, sy, value);
    }
    _removeEditor();
  };

  ta.addEventListener("keydown", function (e) {
    e.stopPropagation();
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      commit();
    } else if (e.key === "Escape") {
      _removeEditor();
    }
  });
  ta.addEventListener("blur", function () {
    commit();
  });

  container.appendChild(ta);
  _editor = ta;
  _editingLayerId = layerId;
  ta.focus();
  ta.select();
}

function _createLayerAt(sx: number, sy: number, text: string): void {
  const page = state.getActivePage();
  if (!page) return;
  const img = _toImageSpace(sx, sy);
  const layer: PageLayer = {
    id: "layer-free-" + Date.now(),
    type: "text-free",
    bbox: { x: img.x, y: img.y, w: 200, h: 40 },
    source: "",
    translation: text,
    typography: defaultTypography(),
    visible: true,
    opacity: 1,
  };
  page.layers.push(layer);
  page._selectedLayerId = layer.id;
  canvas.render();
  sidebar.render();
  history.snapshot();
}

// ── Layer text nodes on the stage (cleaned view) ──

const _layerTextNodes: Konva.Text[] = [];

/** Rebuild interactive Konva.Text nodes for layers (called from render) */
export function renderLayerTextNodes(): void {
  const stage = canvas.getStage();
  const layer = canvas.getLayer();
  const page = state.getActivePage();
  // Clear previous nodes
  _layerTextNodes.forEach(function (n) {
    n.destroy();
  });
  _layerTextNodes.length = 0;
  if (!stage || !layer || !page || !page.cleanedImage) return;
  if (state._viewMode !== "cleaned" || state.activeTool === "select") {
    // In select mode keep texts non-interactive; only text tool makes them
    // clickable for editing. They are still rendered by render.ts visually.
    return;
  }

  const sr = canvas.getScaleRatio();
  const off = canvas.getOffset();

  (page.layers || []).forEach(function (lay) {
    if (!lay.visible) return;
    const text = lay.translation || lay.source || "";
    if (!text) return;
    const node = new Konva.Text({
      name: "layer-text-hit",
      x: off.x + lay.bbox.x * sr,
      y: off.y + lay.bbox.y * sr,
      width: lay.bbox.w * sr,
      height: lay.bbox.h * sr,
      text: "",
      fontSize: 1, // invisible hit proxy; visual text comes from render.ts
      fill: "rgba(0,0,0,0)",
      listening: true,
    });
    node.on("click tap", function (e) {
      e.cancelBubble = true;
      if (state.activeTool === "text") {
        const pos = stage.getPointerPosition();
        if (pos) _showEditor(pos.x, pos.y, text, lay.id);
      } else {
        canvas.selectLayer(lay.id);
      }
    });
    node.on("dblclick dbltap", function (e) {
      e.cancelBubble = true;
      const pos = stage.getPointerPosition();
      if (pos) _showEditor(pos.x, pos.y, text, lay.id);
    });
    layer.add(node);
    _layerTextNodes.push(node);
  });
  layer.draw();
}

// ── Stage click binding ──

export function bindTextTool(): void {
  if (_bound) return;
  _bound = true;
  document.addEventListener("click", function (e) {
    // Commit open editor when clicking elsewhere
    if (_editor && e.target !== _editor) {
      _editor.blur();
    }
  });

  const bindWhenReady = function (): void {
    const stage = canvas.getStage();
    if (!stage) {
      setTimeout(bindWhenReady, 500);
      return;
    }
    stage.on("mousedown touchstart", function (e) {
      if (state.activeTool !== "text") return;
      // Only left button
      if (e.evt.button !== 0) return;
      // Accept clicks on empty stage OR the page image/background — the bg
      // image covers the whole stage so target is rarely the stage itself.
      const targetName = e.target.name ? e.target.name() : "";
      const onBackground =
        e.target === stage || targetName === "bg" || targetName === "";
      if (!onBackground) return; // clicked a detection group/badge → ignore

      const pos = stage.getPointerPosition();
      if (!pos) return;

      // Cleaned view required for placing text (visual reference)
      if (
        state._viewMode !== "cleaned" ||
        !state.getActivePage()?.cleanedImage
      ) {
        return;
      }

      e.cancelBubble = true;
      _showEditor(pos.x, pos.y, "", null);
    });
  };
  bindWhenReady();
}

export const textTool = {
  get editing(): boolean {
    return _editor !== null;
  },
  cancelEdit(): void {
    _removeEditor();
  },
};
