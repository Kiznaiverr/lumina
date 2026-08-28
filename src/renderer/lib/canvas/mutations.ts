/* ── Lumina Canvas — Detection mutations (delete / reorder / set text) ──
 * Deletion splices the array and re-renders: badge numbers (T1, B2, ...) are
 * derived from array index, so they renumber automatically.
 */
import { state } from "../state";
import { canvas } from "./index";
import { sidebar } from "../sidebar";
import { history } from "../history";

// Deletion splices the array and re-renders: badge numbers (T1, B2, ...) are
// derived from array index, so they renumber automatically.

canvas.deleteTextDetection = function (idx: number): void {
  const page = state.getActivePage();
  if (!page || idx < 0 || idx >= page.textDetections.length) return;
  page.textDetections.splice(idx, 1);
  // Mirror deletion into the unified layer model (dialogue layers live at
  // the same index — layers = [...dialogue, ...free]).
  const layer = page.layers[idx];
  if (layer && layer.type === "text-dialogue") {
    page.layers.splice(idx, 1);
    if (page._selectedLayerId === layer.id) page._selectedLayerId = null;
  }
  if (
    page._selectedTextIdx !== null &&
    page._selectedTextIdx >= page.textDetections.length
  )
    page._selectedTextIdx = null;
  canvas.render();
  sidebar.render();
  history.snapshot();
};

/** dir: -1 moves up in reading order, +1 moves down */
canvas.moveTextDetection = function (idx: number, dir: number): void {
  const page = state.getActivePage();
  if (!page) return;
  const arr = page.textDetections;
  const next = idx + dir;
  if (idx < 0 || idx >= arr.length || next < 0 || next >= arr.length) return;
  const tmp = arr[idx];
  arr[idx] = arr[next];
  arr[next] = tmp;
  // Mirror reorder into the unified layer model — only when both slots are
  // dialogue layers (free-text layers live after the dialogue block).
  const layers = page.layers;
  const la = layers[idx];
  const lb = layers[next];
  if (la && la.type === "text-dialogue" && lb && lb.type === "text-dialogue") {
    layers[idx] = lb;
    layers[next] = la;
  }
  if (page._selectedTextIdx === idx) page._selectedTextIdx = next;
  else if (page._selectedTextIdx === next) page._selectedTextIdx = idx;
  canvas.render();
  sidebar.render();
  history.snapshot();
};

/** Set OCR/source text on a text detection (from sidebar inline editor) */
canvas.setTextDetectionText = function (idx: number, text: string): void {
  const page = state.getActivePage();
  if (!page || idx < 0 || idx >= page.textDetections.length) return;
  const det = page.textDetections[idx];
  if (det.text === text) return;
  det.text = text;
  if (det.status === "auto") det.status = "adjusted";
  // Mirror into the unified layer model
  const layer = page.layers[idx];
  if (layer && layer.type === "text-dialogue") layer.source = text;
  canvas._refreshTextGroup(idx);
  history.snapshot();
};
