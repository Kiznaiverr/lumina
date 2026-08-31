/* ── Select Tool — public entry point ──
 * Photoshop-style selection tools (lasso + rectangle):
 *   - Drag        : single selection (existing ones clear when you start)
 *   - Shift+Drag  : add — overlapping shapes merge into one selection
 *   - Alt+Drag    : subtract — carve the shape out of selections
 *   - Click       : activate the selection under the cursor
 *   - Alt+Click   : remove that selection
 *   - Click empty : clear all selections
 *   - Context bar : floating toolbar anchored to the active selection with
 *                    "Convert to detection" (adds the box + runs OCR)
 *
 * Module layout:
 *   shared.ts       — selection types, state, coordinate helpers
 *   interactions.ts — stage drag bindings (lasso polyline / rect marquee)
 *   render.ts       — overlay: marching ants + live preview
 *   contextBar.ts   — floating action bar (also tracks the render loop)
 *   actions/        — one file per convert action (toDetection, …)
 */
import { canvas } from "../index";
import { history, setSelectionHistoryHandlers } from "../../history";
import {
  clearSelections,
  selections,
  activeId,
  setActiveId,
  type Selection,
} from "./shared";
import { refreshOverlay } from "./render";
import { hideContextBar, syncContextBar } from "./contextBar";
import { bindStageInteractions } from "./interactions";

let _bound = false;

// Selections are transient but undoable: history captures them in every
// snapshot and restores them (plus the ants overlay) on undo/redo.
setSelectionHistoryHandlers(
  function () {
    return {
      selections: JSON.parse(JSON.stringify(selections)),
      activeId: activeId,
    };
  },
  function (s) {
    selections.length = 0;
    (s.selections as Selection[]).forEach(function (sel) {
      selections.push(sel);
    });
    setActiveId(s.activeId);
    refreshOverlay();
    if (selections.length) syncContextBar();
    else hideContextBar();
  },
);

export function bindSelectTool(): void {
  if (_bound) return;
  _bound = true;
  bindStageInteractions();

  // Escape clears committed selections (Photoshop behavior).
  window.addEventListener("keydown", function (e) {
    if (e.key !== "Escape") return;
    if (!selections.length) return;
    clearSelections();
    refreshOverlay();
    hideContextBar();
    // Escape deselect is undoable — Ctrl+Z brings the selections back.
    history.snapshot({ dirty: false });
  });
}

// ── Tool change: hide the bar outside lasso/rect, re-show on return ──
// Selections themselves persist across tool switches (Photoshop-style);
// only the floating bar follows the tool.
const _origOnToolChange = canvas.onToolChange;
canvas.onToolChange = function (tool: string): void {
  _origOnToolChange(tool);
  if (tool === "lasso" || tool === "rect") syncContextBar();
  else hideContextBar();
};

// ── Page switch: selections are transient, clear them ──
const _origSwitchPage = canvas.switchPage;
canvas.switchPage = function (idx: number): void {
  _origSwitchPage(idx);
  clearSelections();
  refreshOverlay();
  hideContextBar();
};

const _origRemovePage = canvas.removePage;
canvas.removePage = function (idx: number): void {
  _origRemovePage(idx);
  clearSelections();
  refreshOverlay();
  hideContextBar();
};
