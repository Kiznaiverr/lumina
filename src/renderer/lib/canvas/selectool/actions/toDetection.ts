/* ── Select Tool — action: selection(s) → text detection + OCR ──
 * Converts every committed selection into a text detection (axis-aligned
 * bbox, status "adjusted") plus its mirrored dialogue layer, then OCRs just
 * the new boxes — the end state matches pressing the OCR button for that
 * region: box visible with Japanese source text filled in.
 */
import { state } from "../../../state";
import { history } from "../../../history";
import { canvas } from "../../index";
import { sidebar } from "../../../sidebar";
import { ocr } from "../../../pipeline/ocr";
import { defaultTypography, loadGlobalTypography } from "../../../../types";
import type { PageLayer, TextDetection } from "../../../../types";
import { selections, shapeAABB, isHoleShape } from "../shared";

export function toDetection(): void {
  const page = state.getActivePage();
  if (!page) return;
  const selList = selections.slice();
  if (!selList.length) return;

  const dialogueCount = page.layers.filter(function (l) {
    return l.type === "text-dialogue";
  }).length;

  const newIndices: number[] = [];
  selList.forEach(function (s) {
    // Merged (Shift) or carved (Alt) selections hold several pieces —
    // convert each piece to its own detection so one box lands per bubble.
    s.shapes.forEach(function (shape) {
      // Hole loops (a carved-out region fully inside another piece) render
      // as an inner outline but must NOT become their own detection.
      if (isHoleShape(s.shapes, shape)) return;
      const bbox = shapeAABB(shape);
      const x = Math.max(0, Math.round(bbox.x));
      const y = Math.max(0, Math.round(bbox.y));
      const x2 = Math.min(page.naturalWidth, Math.round(bbox.x + bbox.w));
      const y2 = Math.min(page.naturalHeight, Math.round(bbox.y + bbox.h));
      if (x2 - x < 6 || y2 - y < 6) return; // too small to be useful

      const idx = page.textDetections.length;
      const det: TextDetection = {
        id: "text-manual-" + Date.now() + "-" + idx,
        bbox: { x: x, y: y, w: x2 - x, h: y2 - y },
        confidence: 0,
        status: "adjusted",
        type: "text_free",
      };
      page.textDetections.push(det);

      // Insert the mirrored dialogue layer right after the existing dialogue
      // block (before free-text layers), keeping layers[i] === detections[i]
      // for all i — the invariant ocr.ts relies on.
      const insertAt = dialogueCount + newIndices.length;
      const layer: PageLayer = {
        id: "layer-dialogue-" + Date.now() + "-" + idx,
        type: "text-dialogue",
        bbox: { x: x, y: y, w: x2 - x, h: y2 - y },
        source: "",
        translation: "",
        typography: Object.assign(defaultTypography(), loadGlobalTypography()),
        visible: true,
        opacity: 1,
      };
      page.layers.splice(insertAt, 0, layer);

      newIndices.push(idx);
    });
  });

  if (!newIndices.length) return;

  page._selectedTextIdx = newIndices[0];
  page._selectedLayerId = page.layers[newIndices[0]]?.id ?? null;
  state.showDetBoxes = true; // fresh boxes must be visible
  canvas.render();
  sidebar.render();
  history.snapshot();

  // OCR the new boxes only — same endpoint/mapping as the OCR button.
  ocr.runBoxes(newIndices);
}
