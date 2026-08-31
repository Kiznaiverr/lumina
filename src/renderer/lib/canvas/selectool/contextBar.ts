/* ── Select Tool — floating action bar near the active selection ──
 * Photoshop-style context window: a small toolbar anchored above the active
 * selection with the convert action(s). Also wraps canvas.render so the
 * ants and the bar track zoom/pan/page changes.
 */
import { canvas } from "../index";
import { state } from "../../state";
import * as i18n from "../../i18n";
import {
  selections,
  activeSelection,
  selectionAABB,
  imgToStage,
  clearSelections,
} from "./shared";
import { refreshOverlay } from "./render";
import { toDetection } from "./actions/toDetection";

let _bar: HTMLDivElement | null = null;

function _getBar(): HTMLDivElement {
  if (_bar) return _bar;
  const container = document.getElementById("canvas-container");
  if (!container) throw new Error("canvas-container not found");
  _bar = document.createElement("div");
  _bar.id = "selectool-bar";
  _bar.className = "selectool-bar";
  container.appendChild(_bar);
  return _bar;
}

function _mkBtn(
  label: string,
  cls: string,
  onClick: () => void,
): HTMLButtonElement {
  const b = document.createElement("button");
  b.className = cls;
  b.textContent = label;
  b.addEventListener("click", onClick);
  return b;
}

export function showContextBar(): void {
  const bar = _getBar();
  const sel = activeSelection();
  if (!sel) {
    hideContextBar();
    return;
  }
  const count = selections.length;
  bar.innerHTML = "";

  const title = document.createElement("span");
  title.className = "selectool-bar-title";
  title.textContent = i18n.t("selectool.title");
  bar.appendChild(title);

  if (count > 1) {
    const badge = document.createElement("span");
    badge.className = "selectool-bar-count";
    badge.textContent = String(count);
    bar.appendChild(badge);
  }

  bar.appendChild(
    _mkBtn(
      count > 1 ? i18n.t("selectool.convertAll") : i18n.t("selectool.convert"),
      "selectool-bar-action",
      function () {
        toDetection();
      },
    ),
  );

  bar.appendChild(
    _mkBtn(i18n.t("selectool.clear"), "selectool-bar-clear", function () {
      clearSelections();
      refreshOverlay();
      hideContextBar();
    }),
  );

  bar.style.display = "flex";
  positionBar();
}

export function syncContextBar(): void {
  if (selections.length === 0) hideContextBar();
  else showContextBar();
}

export function hideContextBar(): void {
  if (_bar) _bar.style.display = "none";
}

function positionBar(): void {
  const sel = activeSelection();
  const bar = _getBar();
  const container = document.getElementById("canvas-container");
  if (!sel || !container) return;
  const bbox = selectionAABB(sel);
  const a = imgToStage(bbox.x, bbox.y);
  const b = imgToStage(bbox.x + bbox.w, bbox.y + bbox.h);
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  const w = Math.abs(b.x - a.x);
  const h = Math.abs(b.y - a.y);

  let top = y - 8;
  bar.style.transform = "translate(-50%, -100%)";
  if (top < 8) {
    top = y + h + 8;
    bar.style.transform = "translate(-50%, 0)";
  }
  const left = Math.max(70, Math.min(container.clientWidth - 70, x + w / 2));
  bar.style.left = left + "px";
  bar.style.top = top + "px";
}

// ── Track the main render loop: ants + bar follow zoom/pan/page switch ──
const _origRender = canvas.render;
canvas.render = function (): void {
  _origRender();
  if (!state.getActivePage()) {
    clearSelections();
    refreshOverlay();
    hideContextBar();
    return;
  }
  refreshOverlay();
  if (selections.length > 0 && activeSelection()) positionBar();
  else hideContextBar();
};
