/* ── Text Tool — Konva.Text node factory (visual + interactive) ──
 * Auto-fit uses the cypy-style algorithm in fontFit.ts (preset selection,
 * scoring loop, ≤15% overflow tolerance). Results are computed in image
 * space; fontSize is stored back on the layer so it stays stable. */
import Konva from "konva";
import { canvas } from "../index";
import type { PageLayer, Typography } from "../../../types";
import { imgToStage } from "./shared";
import { fitTextToBox } from "./fontFit";

export function makeNode(layer: PageLayer, text: string): Konva.Group {
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

  // Group + Rect + Text — mirrors the detection-group pattern so the
  // Transformer tracks the BOX (not the measured text) and the whole box
  // is hit-testable. The rect stays invisible — selection is shown by the
  // transformer's own border, so no duplicate outline appears.
  const group = new Konva.Group({
    name: "layer-text",
    layerId: layer.id,
    x: p.x,
    y: p.y,
  });

  group.add(
    new Konva.Rect({
      name: "layer-text-box",
      width: lw,
      height: lh,
      fill: "transparent",
      cornerRadius: 2,
    }),
  );

  group.add(
    new Konva.Text({
      name: "layer-text-glyphs",
      // Center the text in the box so rotation spins around the box
      // center (Konva rotates around (x,y) − offset).
      x: lw / 2,
      y: lh / 2,
      width: lw,
      height: lh,
      offsetX: lw / 2,
      offsetY: lh / 2,
      rotation: typo.rotation || 0,
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
    }),
  );

  return group;
}
