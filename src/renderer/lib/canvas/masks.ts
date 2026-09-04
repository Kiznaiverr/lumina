/* ── Lumina Canvas — Inpaint mask layer operations ──
 * Photoshop-style mask layers: each inpaint patch is an independent layer
 * that can be hidden, deleted (= revert that region to the original image),
 * or have its opacity adjusted.
 */
import { state } from "../state";
import { canvas } from "./index";
import { sidebar } from "../sidebar";
import { history } from "../history";
import {
  ensureCleanupMask,
  ensureCleanupCanvas,
  clearCleanupCanvas,
} from "./paintool/shared";
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
  if (page._selectedMaskId === id) page._selectedMaskId = null;
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
};

// ── Cleanup raster layer (paint tool) — Photoshop-style layer ops ──

canvas.addCleanupMask = function (): void {
  const page = state.getActivePage();
  if (!page || page.cleanupMask) return;
  const mask = ensureCleanupMask(page);
  page._selectedMaskId = mask.id;
  sidebar.render();
  history.snapshot();
};

canvas.toggleCleanupVisible = function (): void {
  const page = state.getActivePage();
  if (!page?.cleanupMask) return;
  page.cleanupMask.visible = !page.cleanupMask.visible;
  canvas.render();
  sidebar.render();
  history.snapshot();
};

canvas.deleteCleanupMask = function (): void {
  const page = state.getActivePage();
  if (!page?.cleanupMask) return;
  page.cleanupMask = null;
  if (page._selectedMaskId?.startsWith("cleanup-")) page._selectedMaskId = null;
  canvas.render();
  sidebar.render();
  history.snapshot();
};

canvas.setCleanupOpacity = function (opacity: number): void {
  const page = state.getActivePage();
  if (!page?.cleanupMask) return;
  page.cleanupMask.opacity = opacity;
  canvas.render();
};

canvas.clearCleanupMask = function (): void {
  const page = state.getActivePage();
  if (!page?.cleanupMask) return;
  clearCleanupCanvas(page);
  page.cleanupMask.imagePath = null;
  page.cleanupMask._hydrated = true; // empty — nothing to reload
  canvas.render();
  sidebar.render();
  history.snapshot();
};
