/* ── Text Tool — free text layer creation ── */
import { state } from "../../state";
import { canvas } from "../index";
import { sidebar } from "../../sidebar";
import { history } from "../../history";
import { defaultTypography, loadGlobalTypography } from "../../../types";
import type { PageLayer } from "../../../types";
import { t } from "../../i18n";
import { startEdit } from "./editor";

export function createLayer(
  bbox: { x: number; y: number; w: number; h: number },
  text: string,
): PageLayer | null {
  const page = state.getActivePage();
  if (!page) return null;
  // New layers inherit the global type defaults (Photoshop-style);
  // they remain per-layer overridable afterwards.
  const typo = Object.assign(defaultTypography(), loadGlobalTypography());
  const layer: PageLayer = {
    id: "layer-free-" + Date.now(),
    type: "text-free",
    bbox: bbox,
    source: "",
    translation: text,
    typography: typo,
    visible: true,
    opacity: 1,
  };
  page.layers.push(layer);
  page._selectedLayerId = layer.id;
  return layer;
}

/** Create a new empty layer and immediately open the editor on it. The text
 * is seeded with a placeholder so the box is immediately visible — it is
 * selected (ta.select()), so typing replaces it right away. */
export function createAndEdit(bbox: {
  x: number;
  y: number;
  w: number;
  h: number;
}): void {
  const lay = createLayer(bbox, t("text.placeholder"));
  if (!lay) return;
  canvas.render();
  sidebar.render();
  history.snapshot();
  startEdit(lay.id);
}
