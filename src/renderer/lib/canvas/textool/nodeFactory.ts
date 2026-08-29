/* ── Text Tool — Konva.Text node factory (visual + interactive) ──
 * Auto-fit uses the cypy-style algorithm in fontFit.ts (preset selection,
 * scoring loop, ≤15% overflow tolerance). Results are computed in image
 * space; fontSize is stored back on the layer so it stays stable. */
import Konva from "konva";
import { canvas } from "../index";
import { state } from "../../state";
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
  // is hit-testable. The rect is transparent; its stroke appears while the
  // layer is selected so the box stays visible during transform.
  const page = state.getActivePage();
  const isSel = page?._selectedLayerId === layer.id;

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
      stroke: isSel ? "#e94560" : undefined,
      strokeWidth: 1,
      cornerRadius: 2,
    }),
  );

  group.add(
    new Konva.Text({
      name: "layer-text-glyphs",
      x: 0,
      y: 0,
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
    }),
  );

  return group;
}
