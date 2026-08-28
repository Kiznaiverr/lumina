/* ── Text Tool — node lifecycle & event wiring (called from render.ts) ── */
import Konva from "konva";
import { state } from "../../state";
import { canvas } from "../index";
import { sidebar } from "../../sidebar";
import { history } from "../../history";
import { layerTextNodes, isEditing, stageToImg } from "./shared";
import { makeNode } from "./nodeFactory";
import {
  syncTransformerSelection,
  onNodeTransformEnd,
  resetTransformer,
} from "./transformer";
import { startEdit } from "./editor";

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
    // backgroundPatch: white rounded-rect backing drawn behind the text
    if (lay.backgroundPatch) {
      const sr = canvas.getScaleRatio();
      const pad = Math.max(6, (lay.typography.fontSize || 20) / 2) * sr;
      const backing = new Konva.Rect({
        name: "layer-text-backing",
        x: node.x() - pad,
        y: node.y() - pad,
        width: node.width() + pad * 2,
        height: node.height() + pad * 2,
        cornerRadius: Math.max(4, (lay.typography.fontSize || 20) / 2) * sr,
        fill: "#ffffff",
        listening: false,
      });
      konvaLayer.add(backing);
    }
    node.on("click tap", function (e) {
      e.cancelBubble = true;
      if (isEditing()) return;
      // In text tool mode: single-click starts edit immediately (Photoshop).
      // Otherwise: select + show transformer; double-click to edit.
      if (state.activeTool === "text") {
        startEdit(lay.id);
      } else {
        canvas.selectLayer(lay.id);
        syncTransformerSelection();
        canvas.getLayer()?.draw();
      }
    });
    node.on("dblclick dbltap", function (e) {
      e.cancelBubble = true;
      startEdit(lay.id);
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
    });
    konvaLayer.add(node);
    layerTextNodes.push(node);
  });

  syncTransformerSelection();
  konvaLayer.draw();
}
