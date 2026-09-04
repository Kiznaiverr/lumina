/* ── Text Tool — node lifecycle & event wiring (called from render.ts) ── */
import Konva from "konva";
import { state } from "../../state";
import { canvas } from "../index";
import { sidebar } from "../../sidebar";
import { history } from "../../history";
import { tools } from "../../tools";
import {
  layerTextNodes,
  isEditing,
  stageToImg,
  getEditingLayerId,
} from "./shared";

// Manual double-click detection. selectLayer() full-renders, which destroys
// the node mid-gesture and breaks Konva's native dblclick — a timestamp
// check in the click handler is immune to that.
const _lastClickAt: Record<string, number> = {};
import { makeNode } from "./nodeFactory";
import {
  syncTransformerSelection,
  onNodeTransformEnd,
  resetTransformer,
  getTransformer,
} from "./transformer";
import { getEditor } from "./shared";
import { startEdit, syncEditorBox, refreshEditingState } from "./editor";

/** Rebuild all layer text nodes on the stage. One Konva.Text per layer —
 * both the visual rendering and the interaction target. */
export function renderLayerTextNodes(): void {
  const konvaLayer = canvas.getLayer();
  const page = state.getActivePage();
  layerTextNodes.forEach(function (n) {
    n.destroy();
  });
  layerTextNodes.length = 0;
  resetTransformer();
  if (!konvaLayer || !page) return;

  (page.layers || []).forEach(function (lay) {
    if (!lay.visible) return;
    // OCR/translation of dialogue layers only appears after inpainting —
    // before that the canvas shows the untouched original + boxes.
    if (lay.type === "text-dialogue" && page.inpaintMasks.length === 0) return;
    const text = lay.translation || lay.source || "";
    if (!text) return;
    const node = makeNode(lay, text);
    node.on("click tap", function (e) {
      e.cancelBubble = true;
      if (isEditing()) return;
      // Paint tools own the pointer — brush/eraser/bucket/eyedropper must
      // never select text layers underneath.
      const t = state.activeTool;
      if (
        t === "brush" ||
        t === "eraser" ||
        t === "bucket" ||
        t === "eyedropper"
      )
        return;
      const now = Date.now();
      if (now - (_lastClickAt[lay.id] || 0) < 350) {
        // Double-click → edit in place (switching to the text tool first).
        delete _lastClickAt[lay.id];
        if (state.activeTool !== "text") tools.setActive("text");
        startEdit(lay.id);
        return;
      }
      _lastClickAt[lay.id] = now;
      // Click = select (shows transform handles).
      canvas.selectLayer(lay.id);
      syncTransformerSelection();
      canvas.getLayer()?.draw();
    });
    node.on("dragend", function () {
      const img = stageToImg(node.x(), node.y());
      const target = page.layers.find(function (l) {
        return l.id === (node.getAttr("layerId") as string);
      });
      if (target) {
        target.bbox.x = img.x;
        target.bbox.y = img.y;
        history.snapshot();
      }
      sidebar.render();
    });
    node.on("transformend", function () {
      onNodeTransformEnd(node);
      // Box was resized with the transformer while editing — onNodeTransformEnd()
      // full-renders, so re-hide the fresh node's glyphs, keep the handles
      // attached and move the textarea to the new box.
      if (getEditingLayerId() === lay.id) {
        refreshEditingState();
        const ta = getEditor();
        if (ta) {
          ta.focus();
          const len = ta.value.length;
          ta.setSelectionRange(len, len);
        }
      }
    });
    konvaLayer.add(node);
    layerTextNodes.push(node);
  });

  syncTransformerSelection();
  konvaLayer.draw();
  // Full render (zoom/pan) while editing must not show the committed text
  // as a "shadow" under the textarea — re-hide glyphs + re-sync the editor.
  refreshEditingState();
}
