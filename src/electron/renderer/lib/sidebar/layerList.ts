/* ── Sidebar: LayersPanel (koharu-style) ──
 * Rows from the unified PageLayer model:
 *   [icon] name (preview text, truncated)   [move ↑↓ / delete on hover] [eye]
 *          kind label (Dialogue / Free text)
 *   selected row expands into source/translation editor.
 */
import * as i18n from "../i18n";
import { canvas } from "../canvas/index";
import { state } from "../state";
import type { Page, PageLayer } from "../../types";
import { esc } from "./_esc";

const KIND_KEYS: Record<PageLayer["type"], string> = {
  "text-dialogue": "layers.kindDialogue",
  "text-free": "layers.kindFree",
  cleanup: "layers.kindCleanup",
  image: "layers.kindImage",
};

function layerName(layer: PageLayer): string {
  const text = layer.translation || layer.source || "";
  const trimmed = text.trim();
  if (!trimmed) return i18n.t("layers.untitled");
  return trimmed.length > 30 ? trimmed.slice(0, 30) + "…" : trimmed;
}

export function layerListHTML(page: Page | null): string {
  if (!page || !page.layers.length)
    return (
      '<div class="field-readonly">' + i18n.t("sidebar.noDetections") + "</div>"
    );

  let html = "";
  page.layers.forEach(function (layer) {
    html += layerRowHTML(page, layer);
  });
  return html;
}

function layerRowHTML(page: Page, layer: PageLayer): string {
  const selected = page._selectedLayerId === layer.id;
  const idx = page.layers.indexOf(layer);
  const kindLabel = i18n.t(KIND_KEYS[layer.type]);
  const name = esc(layerName(layer));

  let html =
    '<div class="layer-row' +
    (selected ? " selected" : "") +
    '" data-layer-id="' +
    esc(layer.id) +
    '">' +
    '<div class="layer-row-main">' +
    '<i data-lucide="type" class="layer-icon"></i>' +
    '<div class="layer-name-wrap">' +
    '<span class="layer-name">' +
    name +
    "</span>" +
    '<span class="layer-kind">' +
    esc(kindLabel) +
    "</span>" +
    "</div>" +
    '<div class="detection-actions">' +
    '<button class="det-btn" data-action="move-up" title="' +
    esc(i18n.t("sidebar.moveUp")) +
    '"' +
    (idx === 0 ? " disabled" : "") +
    ">↑</button>" +
    '<button class="det-btn" data-action="move-down" title="' +
    esc(i18n.t("sidebar.moveDown")) +
    '"' +
    (idx === page.layers.length - 1 ? " disabled" : "") +
    ">↓</button>" +
    '<button class="det-btn det-btn-danger" data-action="delete" title="' +
    esc(i18n.t("sidebar.delete")) +
    '">✕</button>' +
    "</div>" +
    '<button class="layer-eye" data-action="toggle-visible" title="' +
    esc(i18n.t("layers.toggleVisible")) +
    '">' +
    (layer.visible
      ? '<i data-lucide="eye"></i>'
      : '<i data-lucide="eye-off"></i>') +
    "</button>" +
    "</div>";

  // Expanded editor for the selected text layer
  if (
    selected &&
    (layer.type === "text-dialogue" || layer.type === "text-free")
  ) {
    html +=
      '<div class="layer-editor">' +
      '<div class="layer-editor-field">' +
      '<div class="layer-editor-label">' +
      esc(i18n.t("layers.source")) +
      "</div>" +
      '<textarea class="layer-editor-textarea" data-field="source" rows="2" placeholder="' +
      esc(i18n.t("layers.sourcePlaceholder")) +
      '"></textarea>' +
      "</div>" +
      '<div class="layer-editor-field">' +
      '<div class="layer-editor-label layer-editor-label-translation">' +
      esc(i18n.t("layers.translation")) +
      "</div>" +
      '<textarea class="layer-editor-textarea layer-editor-translation" data-field="translation" rows="3" placeholder="' +
      esc(i18n.t("layers.translationPlaceholder")) +
      '"></textarea>' +
      "</div>" +
      "</div>";
  }

  html += "</div>";
  return html;
}

export function wireEvents(): void {
  const items = document.querySelectorAll<HTMLElement>(
    ".layer-row[data-layer-id]",
  );
  items.forEach(function (el) {
    el.addEventListener("click", function (e) {
      const target = e.target as HTMLElement;
      if (target.closest(".layer-editor")) return;

      const id = el.getAttribute("data-layer-id") as string;
      const btn = target.closest(".det-btn") as HTMLButtonElement | null;
      const eye = target.closest(".layer-eye") as HTMLButtonElement | null;

      if (eye) {
        e.stopPropagation();
        canvas.toggleLayerVisible(id);
        return;
      }

      if (btn && !btn.disabled) {
        e.stopPropagation();
        const action = btn.getAttribute("data-action");
        if (action === "delete") canvas.deleteLayer(id);
        else if (action === "move-up") canvas.moveLayer(id, -1);
        else if (action === "move-down") canvas.moveLayer(id, 1);
        return;
      }

      // Click row: select; click again: collapse
      if (el.classList.contains("selected")) {
        canvas.selectLayer(null);
      } else {
        canvas.selectLayer(id);
      }
    });
  });

  // Inline editors: set initial value + commit on blur
  document
    .querySelectorAll<HTMLTextAreaElement>(".layer-editor-textarea")
    .forEach(function (ta) {
      // Restore current value (kept out of innerHTML to avoid esc issues)
      const row = ta.closest(".layer-row") as HTMLElement | null;
      if (row) {
        const id = row.getAttribute("data-layer-id") as string;
        const field = ta.getAttribute("data-field") as "source" | "translation";
        const page = state.getActivePage();
        const layer = page?.layers.find(function (l) {
          return l.id === id;
        });
        if (layer)
          ta.value =
            field === "source" ? layer.source || "" : layer.translation || "";
      }
      ta.addEventListener("click", function (e) {
        e.stopPropagation();
      });
      ta.addEventListener("blur", function () {
        const r = ta.closest(".layer-row") as HTMLElement | null;
        if (!r) return;
        const id = r.getAttribute("data-layer-id") as string;
        const field = ta.getAttribute("data-field") as "source" | "translation";
        canvas.setLayerText(id, field, ta.value);
      });
      ta.addEventListener("keydown", function (e) {
        if (e.key === "Escape") ta.blur();
      });
    });
}
