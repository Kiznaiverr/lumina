/* ── Sidebar: LayersPanel (koharu-style) ──
 * Rows from the unified PageLayer model:
 *   [icon] name (preview text, truncated)   [move ↑↓ / delete on hover] [eye]
 *          kind label (Dialogue / Free text)
 *   selected row expands into source/translation editor.
 */
import * as i18n from "../i18n";
import { canvas } from "../canvas/index";
import { state } from "../state";
import { translate } from "../pipeline/translate";
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
  if (!page) return "";

  let html = "";
  page.layers.forEach(function (layer) {
    html += layerRowHTML(page, layer);
  });

  // Virtual rows (NOT part of page.layers — that array maps 1:1 to
  // textDetections): a group Mask row that toggles every inpaint patch at
  // once, and the Background row = the imported page image.
  if (page.inpaintMasks.length > 0) {
    html += virtualRowHTML(
      "mask",
      i18n.t("layers.mask"),
      i18n.t("layers.maskCount", { count: page.inpaintMasks.length }),
      page.inpaintMasks.some((m) => m.visible),
    );
  }
  html += virtualRowHTML(
    "background",
    i18n.t("layers.background"),
    page.fileName,
    page.backgroundVisible !== false,
  );

  if (!html)
    return (
      '<div class="field-readonly">' + i18n.t("sidebar.noDetections") + "</div>"
    );
  return html;
}

/** Virtual rows act on whole groups, not single layers — no select/move/delete. */
function virtualRowHTML(
  kind: "mask" | "background",
  name: string,
  sub: string,
  visible: boolean,
): string {
  return (
    '<div class="layer-row layer-row-virtual" data-virtual="' +
    kind +
    '">' +
    '<div class="layer-row-main">' +
    '<i data-lucide="' +
    (kind === "mask" ? "eraser" : "image") +
    '" class="layer-icon"></i>' +
    '<div class="layer-name-wrap">' +
    '<span class="layer-name">' +
    esc(name) +
    "</span>" +
    '<span class="layer-kind">' +
    esc(sub) +
    "</span>" +
    "</div>" +
    '<button class="layer-eye" data-action="toggle-visible" title="' +
    esc(i18n.t("layers.toggleVisible")) +
    '">' +
    (visible ? '<i data-lucide="eye"></i>' : '<i data-lucide="eye-off"></i>') +
    "</button>" +
    "</div>" +
    "</div>"
  );
}

function layerRowHTML(page: Page, layer: PageLayer): string {
  const selected = page._selectedLayerId === layer.id;
  const kindLabel = i18n.t(KIND_KEYS[layer.type]);
  const name = esc(layerName(layer));
  const isText = layer.type === "text-dialogue" || layer.type === "text-free";
  const canRetranslate = isText && (layer.source || "").trim().length > 0;

  let html =
    '<div class="layer-row' +
    (selected ? " selected" : "") +
    '" data-layer-id="' +
    esc(layer.id) +
    '" draggable="true">' +
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
    (canRetranslate
      ? '<button class="det-btn" data-action="retranslate" draggable="false" title="' +
        esc(i18n.t("layers.retranslate")) +
        '"><i data-lucide="languages"></i></button>'
      : "") +
    '<button class="det-btn det-btn-danger" data-action="delete" draggable="false" title="' +
    esc(i18n.t("sidebar.delete")) +
    '">✕</button>' +
    "</div>" +
    '<button class="layer-eye" data-action="toggle-visible" draggable="false" title="' +
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
      '<textarea class="layer-editor-textarea" data-field="source" rows="2" draggable="false" placeholder="' +
      esc(i18n.t("layers.sourcePlaceholder")) +
      '"></textarea>' +
      "</div>" +
      '<div class="layer-editor-field">' +
      '<div class="layer-editor-label layer-editor-label-translation">' +
      esc(i18n.t("layers.translation")) +
      "</div>" +
      '<textarea class="layer-editor-textarea layer-editor-translation" data-field="translation" rows="3" draggable="false" placeholder="' +
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
        else if (action === "retranslate") void translate.retranslateLayer(id);
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

  // Drag & drop reorder (replaces the old ↑/↓ buttons).
  // Rows only accept drops from layers of the SAME type — the dialogue
  // block must stay ahead of free-text layers (parallel detection index).
  let dragId: string | null = null;
  let dragType: string | null = null;
  function dropIndicator(): NodeListOf<HTMLElement> {
    return document.querySelectorAll<HTMLElement>(
      ".layer-row.drop-before, .layer-row.drop-after",
    );
  }
  function clearDropIndicators(): void {
    dropIndicator().forEach(function (r) {
      r.classList.remove("drop-before", "drop-after");
    });
  }

  document
    .querySelectorAll<HTMLElement>(".layer-row[data-layer-id]")
    .forEach(function (el) {
      el.addEventListener("dragstart", function (e) {
        const t = e.target as HTMLElement;
        // Never start a drag from a button or the inline editor
        if (t.closest("button, textarea, input")) {
          e.preventDefault();
          return;
        }
        dragId = el.getAttribute("data-layer-id");
        const page = state.getActivePage();
        const layer = page?.layers.find(function (l) {
          return l.id === dragId;
        });
        dragType = layer ? layer.type : null;
        el.classList.add("dragging");
        if (e.dataTransfer) {
          e.dataTransfer.effectAllowed = "move";
          e.dataTransfer.setData("text/plain", dragId || "");
        }
      });

      el.addEventListener("dragend", function () {
        el.classList.remove("dragging");
        clearDropIndicators();
        dragId = null;
        dragType = null;
      });

      el.addEventListener("dragover", function (e) {
        const targetId = el.getAttribute("data-layer-id");
        if (!dragId || dragId === targetId) return;
        const page = state.getActivePage();
        if (!page) return;
        const layer = page.layers.find(function (l) {
          return l.id === dragId;
        });
        const target = page.layers.find(function (l) {
          return l.id === targetId;
        });
        if (!layer || !target || dragType !== target.type) return;
        e.preventDefault();
        if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
        const rect = el.getBoundingClientRect();
        const before = e.clientY < rect.top + rect.height / 2;
        el.classList.toggle("drop-before", before);
        el.classList.toggle("drop-after", !before);
      });

      el.addEventListener("dragleave", function () {
        el.classList.remove("drop-before", "drop-after");
      });

      el.addEventListener("drop", function (e) {
        e.preventDefault();
        const targetId = el.getAttribute("data-layer-id");
        if (!dragId || dragId === targetId) return;
        const page = state.getActivePage();
        if (!page) return;
        const layer = page.layers.find(function (l) {
          return l.id === dragId;
        });
        const target = page.layers.find(function (l) {
          return l.id === targetId;
        });
        if (!layer || !target || dragType !== target.type) return;
        const rows = Array.from(
          document.querySelectorAll<HTMLElement>(".layer-row[data-layer-id]"),
        );
        const idx = rows.indexOf(el);
        const rect = el.getBoundingClientRect();
        const before = e.clientY < rect.top + rect.height / 2;
        canvas.moveLayerTo(dragId, before ? idx : idx + 1);
        clearDropIndicators();
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

  // Virtual rows (mask group / background image) — eye toggles the whole
  // group, clicking the row body deselects the text layer.
  document
    .querySelectorAll<HTMLElement>(".layer-row[data-virtual]")
    .forEach(function (el) {
      el.addEventListener("click", function (e) {
        const target = e.target as HTMLElement;
        const eye = target.closest(".layer-eye") as HTMLButtonElement | null;
        if (eye) {
          e.stopPropagation();
          if (el.getAttribute("data-virtual") === "mask")
            canvas.toggleAllMasks();
          else canvas.toggleBackgroundVisible();
          return;
        }
        if (state.getActivePage()?._selectedLayerId) canvas.selectLayer(null);
      });
    });
}
