/* ── Text Tool — Konva.Text node factory (visual + interactive) ──
 * Auto-fit uses the cypy-style algorithm in fontFit.ts (preset selection,
 * scoring loop, ≤15% overflow tolerance). Results are computed in image
 * space; fontSize is stored back on the layer so it stays stable. */
import Konva from "konva";
import { canvas } from "../index";
import type { PageLayer, Typography } from "../../../types";
import { imgToStage } from "./shared";
import { fitTextToBox } from "./fontFit";

export function makeNode(layer: PageLayer, text: string): Konva.Text {
  const sr = canvas.getScaleRatio();
  const p = imgToStage(layer.bbox.x, layer.bbox.y);
  const lw = Math.max(4, layer.bbox.w * sr);
  const lh = Math.max(4, layer.bbox.h * sr);
  const typo: Typography = layer.typography;

  // Fit in IMAGE space (zoom-independent), then scale to stage
  let imgFontSize = typo.fontSize;
  if (imgFontSize === null) {
    const fit = fitTextToBox(text, layer.bbox.w, layer.bbox.h, typo);
    imgFontSize = fit.fontSize;
    layer.typography.fontSize = fit.fontSize; // persist fitted size
    layer.fitStatus = fit.fitStatus; // drives sidebar review badge
  }

  const node = new Konva.Text({
    name: "layer-text",
    layerId: layer.id,
    x: p.x,
    y: p.y,
    width: lw,
    height: lh,
    text: text,
    fontSize: imgFontSize * sr,
    fontFamily: typo.fontFamily || "Arial, sans-serif",
    fontStyle: typo.fontStyle,
    fontVariant: typo.fontWeight >= 700 ? "bold" : "normal",
    align: typo.align,
    verticalAlign: "middle",
    fill: typo.color,
    stroke: typo.strokeColor || undefined,
    strokeWidth: typo.strokeWidth * sr || 0,
    fillAfterStrokeEnabled: true,
    opacity: layer.opacity,
    listening: true,
  });

  // backgroundPatch flag consumed by nodes.ts — backing rect added there
  return node;
}
