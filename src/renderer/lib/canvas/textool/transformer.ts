/* ── Text Tool — Transformer (move / resize / scale font) ── */
import Konva from "konva";
import { state } from "../../state";
import { canvas } from "../index";
import { sidebar } from "../../sidebar";
import { history } from "../../history";
import { layerTextNodes, stageToImg } from "./shared";

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
    // Same visual language as the detection transformer (white square
    // anchors, colored border) — but all 8 anchors so the text box can be
    // resized in width, height, or both. padding keeps the handles outside
    // the editor textarea while typing.
    transformer = new Konva.Transformer({
      rotateEnabled: true,
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
      padding: 6,
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
    // Paint tools own the pointer — never let a text node drag over a
    // brush stroke (the brush needs the mousedown).
    const paint =
      state.activeTool === "brush" ||
      state.activeTool === "eraser" ||
      state.activeTool === "bucket" ||
      state.activeTool === "eyedropper";
    if (paint) {
      transformer.nodes([]);
      node.draggable(false);
    } else {
      transformer.nodes([node]);
      node.draggable(true);
    }
  } else {
    transformer.nodes([]);
  }
}

/** Wrap an angle to (-180, 180] */
function normalizeRotation(deg: number): number {
  let r = ((deg % 360) + 360) % 360;
  if (r > 180) r -= 360;
  return Math.round(r);
}

/** Commit a transform back to the layer model */
export function onNodeTransformEnd(node: Konva.Group): void {
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

  // Rotation: the Transformer rotates the group around the box center
  // (each gesture starts at group rotation 0), so the applied delta stacks
  // on top of the text's own typo.rotation. Commit the total and reset.
  const deltaRot = node.rotation();
  node.rotation(0);
  if (deltaRot !== 0) {
    lay.typography.rotation = normalizeRotation(
      (lay.typography.rotation || 0) + deltaRot,
    );
  }

  const sr = canvas.getScaleRatio();
  const p = stageToImg(node.x(), node.y());
  const rect = node.findOne<Konva.Rect>(".layer-text-box");
  const baseW = rect ? rect.width() : 0;
  const baseH = rect ? rect.height() : 0;

  // Commit the actual rendered box — position AND size. The Transformer only
  // writes x/y/scaleX/scaleY (never width/height), so reading them here
  // (before the reset) captures the real dragged size.
  lay.bbox.x = p.x;
  lay.bbox.y = p.y;
  lay.bbox.w = Math.max(8, Math.round((baseW * sx) / sr));
  lay.bbox.h = Math.max(8, Math.round((baseH * sy) / sr));

  if (state.activeTool === "select") {
    // Free transform (Move tool): box AND font scale together.
    if (lay.typography.fontSize !== null) {
      const ratio = Math.sqrt(Math.abs(sx * sy));
      lay.typography.fontSize = Math.max(
        4,
        Math.round(lay.typography.fontSize * ratio),
      );
    }
  }
  // Text tool: box-only resize (Photoshop text box) — explicit font size
  // stays fixed and the text re-wraps; auto-fit (fontSize null) re-fits on
  // the next render.

  canvas.render();
  sidebar.render();
  history.snapshot();
}
