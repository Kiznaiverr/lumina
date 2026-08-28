/* ── Text Tool — Transformer (move / resize / scale font) ── */
import Konva from "konva";
import { state } from "../../state";
import { canvas } from "../index";
import { sidebar } from "../../sidebar";
import { history } from "../../history";
import { layerTextNodes } from "./shared";

let transformer: Konva.Transformer | null = null;

export function getTransformer(): Konva.Transformer | null {
  return transformer;
}

export function resetTransformer(): void {
  transformer = null;
}

function ensureTransformer(): void {
  const konvaLayer = canvas.getLayer();
  if (!konvaLayer) return;
  if (!transformer) {
    transformer = new Konva.Transformer({
      rotateEnabled: false,
      enabledAnchors: [
        "top-left",
        "top-center",
        "top-right",
        "middle-left",
        "middle-right",
        "bottom-left",
        "bottom-center",
        "bottom-right",
      ],
      anchorStroke: "#e94560",
      anchorFill: "#fff",
      anchorSize: 8,
      borderStroke: "#e94560",
      borderStrokeWidth: 1,
      padding: 2,
    });
    konvaLayer.add(transformer);
  }
}

/** Attach the transformer to the selected layer's node (if any) */
export function syncTransformerSelection(): void {
  const page = state.getActivePage();
  ensureTransformer();
  if (!transformer) return;
  const selId = page ? page._selectedLayerId : null;
  const node = selId
    ? layerTextNodes.find(function (n) {
        return n.getAttr("layerId") === selId;
      })
    : null;
  if (node) {
    transformer.nodes([node]);
    node.draggable(true);
  } else {
    transformer.nodes([]);
  }
}

/** Commit a transform back to the layer model */
export function onNodeTransformEnd(node: Konva.Text): void {
  const page = state.getActivePage();
  if (!page) return;
  const id = node.getAttr("layerId") as string;
  const lay = page.layers.find(function (l) {
    return l.id === id;
  });
  if (!lay) return;

  const sx = node.scaleX();
  const sy = node.scaleY();
  node.scaleX(1);
  node.scaleY(1);

  const sr = canvas.getScaleRatio();

  // Corner handles scale everything proportionally (incl. explicit font size)
  if (Math.abs(sx - 1) > 0.001 && Math.abs(sy - 1) > 0.001) {
    const ratio = (sx + sy) / 2;
    lay.bbox.w = Math.max(8, Math.round(lay.bbox.w * ratio));
    lay.bbox.h = Math.max(8, Math.round(lay.bbox.h * ratio));
    if (lay.typography.fontSize !== null) {
      lay.typography.fontSize = Math.max(
        4,
        Math.round(lay.typography.fontSize * ratio),
      );
    }
  } else {
    // Side handles resize the box only; explicit size falls back to auto-fit
    const nw = Math.max(8, Math.round(node.width()));
    const nh = Math.max(8, Math.round(node.height()));
    lay.bbox.w = Math.round(nw / sr);
    lay.bbox.h = Math.round(nh / sr);
    lay.typography.fontSize = null;
  }

  canvas.render();
  sidebar.render();
  history.snapshot();
}
