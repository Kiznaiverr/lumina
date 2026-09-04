/* ── Paint tool guard helpers ──
 * isPaintTool: which tools the paint pipeline handles.
 * requireCleanup: paint tools need the cleanup raster layer to exist —
 * if missing, toast + jump to the Masks tab.
 */
import { state } from "../../state";
import { ui } from "../../ui";
import { sidebar } from "../../sidebar";
import * as i18n from "../../i18n";
import type { Page } from "../../../types";

export function isPaintTool(): boolean {
  const t = state.activeTool;
  return (
    t === "brush" || t === "eraser" || t === "bucket" || t === "eyedropper"
  );
}

export function requireCleanup(page: Page | null): boolean {
  if (page && page.cleanupMask) return true;
  ui.toast(i18n.t("toast.paintNeedMask"), "warn");
  sidebar.setActiveTab("masks");
  return false;
}
