/* ── Lumina Canvas — Inpaint mask layer operations ──
 * Photoshop-style mask layers: each inpaint patch is an independent layer
 * that can be hidden, deleted (= revert that region to the original image),
 * or have its opacity adjusted.
 */
import { state } from "../state";
import { canvas } from "./index";
import { sidebar } from "../sidebar";
import { history } from "../history";
import type { InpaintMask } from "../../types";

function _findMaskIndex(
  masks: InpaintMask[] | undefined,
  id: string | null,
): number {
  if (!id || !masks) return -1;
  return masks.findIndex((m) => m.id === id);
}

canvas.toggleMaskVisible = function (id: string): void {
  const page = state.getActivePage();
  const i = _findMaskIndex(page?.inpaintMasks, id);
  if (!page || i < 0) return;
  page.inpaintMasks[i].visible = !page.inpaintMasks[i].visible;
  canvas.render();
  sidebar.render();
  history.snapshot();
};

canvas.deleteMask = function (id: string): void {
  const page = state.getActivePage();
  const i = _findMaskIndex(page?.inpaintMasks, id);
  if (!page || i < 0) return;
  page.inpaintMasks.splice(i, 1);
  canvas.render();
  sidebar.render();
  history.snapshot();
};

canvas.setMaskOpacity = function (id: string, opacity: number): void {
  const page = state.getActivePage();
  const i = _findMaskIndex(page?.inpaintMasks, id);
  if (!page || i < 0) return;
  page.inpaintMasks[i].opacity = opacity;
  canvas.render();
  sidebar.render();
};
