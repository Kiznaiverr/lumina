/* ── Lumina — bubble-assigned fit box ──
 * Detection emits a tight text box around the glyphs PLUS, for balloon
 * text, the surrounding bubble shell. OCR/inpaint keep using the tight text
 * box (their crops must hug the glyphs), but the typesetting auto-fit gets
 * a larger area: the interior of the bubble that contains the text, so the
 * translation renders at a natural, readable size instead of shrinking into
 * the glyph-tight rectangle.
 *
 * Association is purely geometric (text bbox center inside the bubble bbox,
 * innermost bubble wins) so it works for both RT-DETR (which also labels
 * balloon text "text_bubble") and RF-DETR (which emits every text as class
 * "text"). A balloon hosting more than one text detection (the detector
 * split a dialogue into separate lines) is left untouched — fitting two
 * layers into the same bubble would stack them on top of each other.
 */
import type { BBox } from "../types";

function centerIn(bubble: BBox, t: BBox): boolean {
  const cx = t.x + t.w / 2;
  const cy = t.y + t.h / 2;
  return (
    cx >= bubble.x &&
    cx <= bubble.x + bubble.w &&
    cy >= bubble.y &&
    cy <= bubble.y + bubble.h
  );
}

/** Inset a bubble box so fitted text clears the balloon outline. */
function inset(b: BBox): BBox | null {
  const padX = Math.max(3, Math.round(b.w * 0.06));
  const padY = Math.max(3, Math.round(b.h * 0.06));
  const x = b.x + padX;
  const y = b.y + padY;
  const w = b.w - padX * 2;
  const h = b.h - padY * 2;
  if (w < 8 || h < 8) return null;
  return { x: x, y: y, w: w, h: h };
}

/** Assign each text box a fit box from its containing bubble.
 * Returns one entry per input text; null = keep the tight text box. */
export function assignBubbleFitBoxes(
  texts: Array<{ bbox: BBox }>,
  bubbles: Array<{ bbox: BBox }>,
): (BBox | null)[] {
  const chosen: number[] = texts.map(function (t) {
    let best = -1;
    let bestArea = Infinity;
    bubbles.forEach(function (b, i) {
      if (!centerIn(b.bbox, t.bbox)) return;
      const area = b.bbox.w * b.bbox.h;
      if (area < bestArea) {
        bestArea = area;
        best = i;
      }
    });
    return best;
  });

  const counts: number[] = new Array(bubbles.length).fill(0);
  chosen.forEach(function (i) {
    if (i >= 0) counts[i] += 1;
  });

  return chosen.map(function (i) {
    if (i < 0 || counts[i] > 1) return null;
    return inset(bubbles[i].bbox);
  });
}
