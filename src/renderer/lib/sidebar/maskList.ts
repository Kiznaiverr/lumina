/* ── Sidebar: Masks panel (Photoshop-style) ──
 * One row per inpaint patch:
 *   [thumbnail] name (Mask N) + opacity%    [delete] [eye]
 *   opacity slider
 * Hiding a mask reveals the original pixels below it; deleting removes the
 * mask layer entirely (= revert that region to original); opacity blends it.
 */
import * as i18n from "../i18n";
import { canvas } from "../canvas/index";
import { history } from "../history";
import { state } from "../state";
import { sidebar } from "../sidebar";
import type { Page, InpaintMask } from "../../types";
import { esc } from "./_esc";

/** Convert a Windows path to a loadable file:// URL */
function fileUrl(p: string): string {
  let norm = p.replace(/\\/g, "/");
  if (!norm.startsWith("/")) norm = "/" + norm;
  return "file://" + encodeURI(norm).replace(/#/g, "%23").replace(/\?/g, "%3F");
}

export function maskListHTML(page: Page | null): string {
  if (!page || !page.inpaintMasks.length)
    return (
      '<div class="field-readonly">' + i18n.t("sidebar.noMasks") + "</div>"
    );

  let html = "";
  page.inpaintMasks.forEach(function (m, i) {
    html += maskRowHTML(page, m, i);
  });
  return html;
}

function maskRowHTML(page: Page, mask: InpaintMask, idx: number): string {
  const pct = Math.round(mask.opacity * 100);
  const selected = page._selectedMaskId === mask.id;
  return (
    '<div class="layer-row' +
    (selected ? " selected" : "") +
    '" data-mask-id="' +
    esc(mask.id) +
    '">' +
    '<div class="layer-row-main">' +
    '<img class="mask-thumb" src="' +
    esc(fileUrl(mask.imagePath)) +
    '" alt="">' +
    '<div class="layer-name-wrap">' +
    '<span class="layer-name">' +
    esc(i18n.t("masks.name", { index: idx + 1 })) +
    "</span>" +
    (selected
      ? '<div class="mask-opacity-line">' +
        '<span class="mask-opacity-label">' +
        esc(i18n.t("masks.opacity")) +
        "</span>" +
        '<input type="range" class="mask-opacity" min="0" max="100" value="' +
        pct +
        '">' +
        '<span class="mask-opacity-value">' +
        pct +
        "%</span>" +
        "</div>"
      : "") +
    "</div>" +
    '<div class="detection-actions">' +
    '<button class="det-btn det-btn-danger" data-action="delete" title="' +
    esc(i18n.t("masks.delete")) +
    '"><i data-lucide="trash-2"></i></button>' +
    "</div>" +
    '<button class="layer-eye" data-action="toggle-visible" title="' +
    esc(i18n.t("layers.toggleVisible")) +
    '">' +
    (mask.visible
      ? '<i data-lucide="eye"></i>'
      : '<i data-lucide="eye-off"></i>') +
    "</button>" +
    "</div>" +
    "</div>"
  );
}

export function wireMaskEvents(): void {
  const page = state.getActivePage();
  const items = document.querySelectorAll<HTMLElement>(
    ".layer-row[data-mask-id]",
  );
  items.forEach(function (el) {
    el.addEventListener("click", function (e) {
      const target = e.target as HTMLElement;
      const id = el.getAttribute("data-mask-id") as string;
      const btn = target.closest(".det-btn") as HTMLButtonElement | null;
      const eye = target.closest(".layer-eye") as HTMLButtonElement | null;

      if (eye) {
        e.stopPropagation();
        canvas.toggleMaskVisible(id);
        return;
      }
      if (btn) {
        e.stopPropagation();
        canvas.deleteMask(id);
        return;
      }
      // Click on the row toggles the expanded options (opacity + delete)
      if (target.closest(".mask-opacity")) return; // slider handles itself
      if (page) {
        page._selectedMaskId = page._selectedMaskId === id ? null : id;
        sidebar.render();
      }
    });
  });

  // Opacity slider: live preview on input, history snapshot on release
  document
    .querySelectorAll<HTMLInputElement>(".mask-opacity")
    .forEach(function (r) {
      const sync = function (): void {
        const row = r.closest(".layer-row") as HTMLElement | null;
        if (!row) return;
        const id = row.getAttribute("data-mask-id") as string;
        canvas.setMaskOpacity(id, parseInt(r.value, 10) / 100);
        const val = row.querySelector<HTMLElement>(".mask-opacity-value");
        if (val) val.textContent = r.value + "%";
      };
      r.addEventListener("input", sync);
      r.addEventListener("change", function () {
        sync();
        history.snapshot();
      });
    });
}
