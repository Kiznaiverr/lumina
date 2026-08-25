/* ── Sidebar: image info group ── */
import * as i18n from "../i18n";
import type { Page } from "../../types";
import { esc } from "./_esc";

export function imageHTML(page: Page | null): string {
  if (!page)
    return (
      '<div class="field-readonly">' +
      i18n.t("sidebar.image.noImage") +
      "</div>"
    );
  return (
    '<div class="field-row">' +
    '<div class="field"><div class="field-label">' +
    i18n.t("sidebar.image.width") +
    "</div><div>" +
    page.naturalWidth +
    "px</div></div>" +
    '<div class="field"><div class="field-label">' +
    i18n.t("sidebar.image.height") +
    "</div><div>" +
    page.naturalHeight +
    "px</div></div>" +
    "</div>" +
    '<div class="field"><div class="field-label">' +
    i18n.t("sidebar.image.file") +
    '</div><div class="text-[0.65rem] text-text-muted break-all">' +
    esc(page.fileName) +
    "</div></div>"
  );
}
