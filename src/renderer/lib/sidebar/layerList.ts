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

// Active editor tab per selected layer id ("source" | "translation"), kept
// across sidebar re-renders while the row stays selected. Collapsed rows are
// pruned in wireEvents. Without this the default (content-derived) would
// re-apply after every blur commit and yank the user between tabs while
// typing.
const _editorTabs: Record<string, "source" | "translation"> = {};

function editorTabFor(layer: PageLayer): "source" | "translation" {
  return (
    _editorTabs[layer.id] ||
    ((layer.translation || "").trim() ? "translation" : "source")
  );
}

function editorTabButton(
  which: "source" | "translation",
  active: "source" | "translation",
  hasContent: boolean,
): string {
  return (
    '<button type="button" class="layer-editor-tab' +
    (active === which ? " active" : "") +
    '" data-tab="' +
    which +
    '">' +
    "<span>" +
    esc(i18n.t(which === "source" ? "layers.source" : "layers.translation")) +
    "</span>" +
    (hasContent ? '<span class="le-tab-dot"></span>' : "") +
    "</button>"
  );
}

// Content dots sit on INACTIVE tabs that hold text — a silent cue that the
// hidden field is filled (the active tab's content is already visible).
function syncEditorTabs(
  row: HTMLElement,
  active: "source" | "translation",
  layer: PageLayer,
): void {
  row
    .querySelectorAll<HTMLButtonElement>(".layer-editor-tab")
    .forEach(function (b) {
      const which = b.getAttribute("data-tab") as "source" | "translation";
      b.classList.toggle("active", which === active);
      const filled =
        which === "source"
          ? !!(layer.source || "").trim()
          : !!(layer.translation || "").trim();
      const show = filled && which !== active;
      const dot = b.querySelector(".le-tab-dot");
      if (show && !dot) {
        const d = document.createElement("span");
        d.className = "le-tab-dot";
        b.appendChild(d);
      } else if (!show && dot) {
        dot.remove();
      }
    });
}

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

  // Expanded editor for the selected text layer — one textarea at a time,
  // switched through the Original | Translation tabs (the other field keeps
  // its content; a dot on the inactive tab shows it's filled).
  if (selected && isText) {
    const tab = editorTabFor(layer);
    const hasSrc = (layer.source || "").trim().length > 0;
    const hasTr = (layer.translation || "").trim().length > 0;
    html +=
      '<div class="layer-editor">' +
      '<div class="layer-editor-tabs">' +
      editorTabButton("source", tab, hasSrc && tab !== "source") +
      editorTabButton("translation", tab, hasTr && tab !== "translation") +
      "</div>" +
      '<textarea class="layer-editor-textarea' +
      (tab === "translation" ? " layer-editor-translation" : "") +
      '" data-field="' +
      tab +
      '" rows="4" draggable="false" placeholder="' +
      esc(
        i18n.t(
          tab === "source"
            ? "layers.sourcePlaceholder"
            : "layers.translationPlaceholder",
        ),
      ) +
      '"></textarea>' +
      "</div>";
  }

  html += "</div>";
  return html;
}

export function wireEvents(): void {
  const items = document.querySelectorAll<HTMLElement>(
    ".layer-row[data-layer-id]",
  );
  // Editor tabs are per-selection state: drop the stored tab as soon as the
  // row collapses so a positional id reused elsewhere starts fresh.
  items.forEach(function (el) {
    if (!el.classList.contains("selected")) {
      const id = el.getAttribute("data-layer-id");
      if (id) delete _editorTabs[id];
    }
  });
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

  // Editor tab switching — the textarea loses focus on mousedown, so the
  // existing blur handler commits pending edits BEFORE this click fires.
  document
    .querySelectorAll<HTMLButtonElement>(".layer-editor-tab")
    .forEach(function (btn) {
      btn.addEventListener("click", function (e) {
        e.stopPropagation();
        const row = btn.closest(".layer-row") as HTMLElement | null;
        if (!row) return;
        const id = row.getAttribute("data-layer-id") as string;
        const tab = btn.getAttribute("data-tab") as "source" | "translation";
        const page = state.getActivePage();
        const layer = page?.layers.find(function (l) {
          return l.id === id;
        });
        if (!layer) return;
        _editorTabs[id] = tab;
        syncEditorTabs(row, tab, layer);
        const ta = row.querySelector<HTMLTextAreaElement>(
          ".layer-editor-textarea",
        );
        if (ta) {
          ta.setAttribute("data-field", tab);
          ta.classList.toggle(
            "layer-editor-translation",
            tab === "translation",
          );
          ta.placeholder = i18n.t(
            tab === "source"
              ? "layers.sourcePlaceholder"
              : "layers.translationPlaceholder",
          );
          ta.value =
            tab === "source" ? layer.source || "" : layer.translation || "";
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
