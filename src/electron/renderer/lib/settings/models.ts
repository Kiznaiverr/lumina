/* ── Settings: Models tab — model management ──
 * A segmented tab bar (Text Detection | OCR | Inpainting) switches between
 * category panels. Each panel holds a custom model picker (dropdown) and
 * the selected model's description card (install status, size, download).
 */
import * as i18n from "../i18n";
import { createIcons } from "../icons";
import { models } from "../models";
import type { DownloadProgress, ModelInfo } from "../../types";

const SECTIONS: Array<[string, string]> = [
  ["detect", "models.sectionDetect"],
  ["ocr", "models.sectionOcr"],
  ["inpaint", "models.sectionInpaint"],
];

/** Kind of the currently visible panel — preserved across refresh(). */
let _activeKind: string | null = null;

function fmtSize(n: number | null | undefined): string {
  if (!n) return "—";
  const mb = n / (1024 * 1024);
  return mb >= 100 ? Math.round(mb) + " MB" : mb.toFixed(1) + " MB";
}

function hintEl(): HTMLElement {
  const p = document.createElement("p");
  p.className = "text-[0.68rem] text-text-muted leading-relaxed";
  p.dataset.i18n = "settings.modelsHint";
  p.textContent = i18n.t("settings.modelsHint");
  return p;
}

export const modelsTab = {
  build(pane: HTMLElement): void {
    pane.dataset.modelsTab = "1";
    // Clicking anywhere outside an open picker closes it.
    document.addEventListener("click", (e) => {
      if ((e.target as HTMLElement).closest(".model-picker")) return;
      pane
        .querySelectorAll<HTMLElement>(".model-picker.open")
        .forEach((p) => p.classList.remove("open"));
    });
    // Live progress → update the matching category panel
    models.onProgress((p) => this._onProgress(pane, p));
  },

  /** Called on every close path (Done, X, overlay click) — keep buttons fresh. */
  commit(): void {
    models.refreshButtons();
  },

  refresh(): void {
    const pane = document.getElementById("tab-models");
    if (!pane) return;
    models.check().then((list) => this._render(pane, list));
  },

  _render(pane: HTMLElement, list: ModelInfo[]): void {
    pane.innerHTML = "";
    pane.appendChild(hintEl());

    const sections = SECTIONS.map(([kind, titleKey]) => ({
      kind,
      titleKey,
      items: list.filter((m) => m.kind === kind),
    })).filter((s) => s.items.length > 0);

    if (!sections.length) {
      createIcons();
      return;
    }

    // Preserve the previously active panel, else default to the first.
    if (!sections.some((s) => s.kind === _activeKind)) {
      _activeKind = sections[0].kind;
    }

    const tabs = document.createElement("div");
    tabs.className = "model-tabs";
    pane.appendChild(tabs);

    const show = (kind: string) => {
      _activeKind = kind;
      tabs
        .querySelectorAll<HTMLElement>(".model-tab")
        .forEach((t) => t.classList.toggle("active", t.dataset.tab === kind));
      pane
        .querySelectorAll<HTMLElement>(".model-panel")
        .forEach((p) => p.classList.toggle("hidden", p.dataset.panel !== kind));
    };

    for (const { kind, titleKey, items } of sections) {
      const tab = document.createElement("button");
      tab.type = "button";
      tab.className = "model-tab";
      tab.dataset.tab = kind;
      tab.textContent = i18n.t(titleKey);
      tab.addEventListener("click", () => show(kind));
      tabs.appendChild(tab);

      pane.appendChild(this._panel(kind, items));
    }
    createIcons();
    show(_activeKind!);
  },

  /** One category panel: model picker on top, description card below. */
  _panel(kind: string, items: ModelInfo[]): HTMLElement {
    const panel = document.createElement("div");
    panel.className = "model-panel hidden";
    panel.dataset.kind = kind;
    panel.dataset.panel = kind;

    panel.appendChild(this._picker(kind, items, panel));
    panel.appendChild(this._descCard(kind, items));

    return panel;
  },

  /** Custom dropdown — pick the active model for this task. */
  _picker(kind: string, items: ModelInfo[], panel: HTMLElement): HTMLElement {
    const wrap = document.createElement("div");
    wrap.className = "model-picker";

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "model-picker-btn";
    const label = document.createElement("span");
    const chev = document.createElement("i");
    chev.dataset.lucide = "chevron-down";
    btn.appendChild(label);
    btn.appendChild(chev);

    const menu = document.createElement("div");
    menu.className = "model-picker-menu hidden";
    for (const m of items) {
      const opt = document.createElement("button");
      opt.type = "button";
      opt.className = "model-picker-opt";
      opt.dataset.model = m.id;
      const optLabel = document.createElement("span");
      optLabel.textContent = m.name;
      const check = document.createElement("i");
      check.dataset.lucide = "check";
      opt.appendChild(optLabel);
      opt.appendChild(check);
      opt.addEventListener("click", () => {
        models.setSelectedModel(kind, m.id);
        models.refreshButtons();
        wrap.classList.remove("open");
        menu.classList.add("hidden");
        this._updatePicker(wrap, kind, items);
        this._updateDesc(panel, items);
      });
      menu.appendChild(opt);
    }
    wrap.appendChild(btn);
    wrap.appendChild(menu);

    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const willOpen = menu.classList.contains("hidden");
      document
        .querySelectorAll<HTMLElement>(".model-picker.open")
        .forEach((p) => p.classList.remove("open"));
      wrap.classList.toggle("open", willOpen);
      menu.classList.toggle("hidden", !willOpen);
    });

    this._updatePicker(wrap, kind, items);
    return wrap;
  },

  /** Sync the picker's button label + menu highlight to the active model. */
  _updatePicker(wrap: HTMLElement, kind: string, items: ModelInfo[]): void {
    // UI follows the saved pick (even if not installed). The header pipeline
    // buttons disable when the picked model is missing — no silent fallback.
    const picked = models.pickedModel(kind);
    const sel = picked || models.selectedModel(kind);
    const cur = items.find((m) => m.id === sel) ?? items[0];
    if (!cur) return;
    const label = wrap.querySelector<HTMLElement>(".model-picker-btn span");
    if (label) label.textContent = cur.name;
    wrap
      .querySelectorAll<HTMLElement>(".model-picker-opt")
      .forEach((o) => o.classList.toggle("active", o.dataset.model === sel));
  },

  /** Card describing the selected model + install controls. */
  _descCard(kind: string, items: ModelInfo[]): HTMLElement {
    const card = document.createElement("div");
    card.className = "model-desc";
    card.dataset.kind = kind; // needed before attach — _updateDesc reads it

    const head = document.createElement("div");
    head.className = "model-desc-head";
    const name = document.createElement("div");
    name.className = "model-desc-name";
    const meta = document.createElement("div");
    meta.className = "model-desc-meta";
    const badge = document.createElement("span");
    badge.className = "model-badge";
    meta.appendChild(document.createElement("span")); // size
    meta.appendChild(badge);
    head.appendChild(name);
    head.appendChild(meta);

    const text = document.createElement("p");
    text.className = "model-desc-text";

    const btn = document.createElement("button");
    btn.className = "btn model-dl";
    btn.dataset.action = "download";
    btn.addEventListener("click", () => {
      btn.disabled = true;
      btn.textContent = i18n.t("models.downloading");
      models.download([card.dataset.model || ""]).catch(() => {
        btn.disabled = false;
        btn.textContent = i18n.t("models.download");
      });
    });

    card.append(head, text, btn);
    this._updateDesc(card, items);
    return card;
  },

  /** Re-sync the description card + picker to the active model. */
  _updateDesc(host: HTMLElement, items: ModelInfo[]): void {
    const card = host.classList.contains("model-desc")
      ? host
      : host.querySelector<HTMLElement>(".model-desc");
    const kind = host.dataset.kind || card?.dataset.kind;
    if (!card || !kind) return;

    const picked = models.pickedModel(kind);
    const sel = picked || models.selectedModel(kind);
    const m = items.find((x) => x.id === sel) ?? items[0];
    if (!m) return;

    card.dataset.model = m.id;
    card.querySelector<HTMLElement>(".model-desc-name")!.textContent = m.name;
    card.querySelector<HTMLElement>(".model-desc-meta span")!.textContent =
      fmtSize(m.size);
    const badge = card.querySelector<HTMLElement>(".model-badge")!;
    badge.className = "model-badge " + (m.ready ? "ready" : "missing");
    badge.textContent = i18n.t(m.ready ? "models.ready" : "models.missing");
    const text = card.querySelector<HTMLElement>(".model-desc-text")!;
    text.textContent = m.description || "";
    text.hidden = !m.description;

    const btn = card.querySelector<HTMLButtonElement>(".model-dl")!;
    if (m.ready) {
      btn.disabled = true;
      btn.textContent = i18n.t("models.ready");
    } else {
      btn.disabled = false;
      btn.textContent = i18n.t("models.download");
    }
  },

  _onProgress(pane: HTMLElement, p: DownloadProgress): void {
    const kind = p.model || "";
    const panel = pane.querySelector<HTMLElement>(
      '[data-panel="' + kind + '"]',
    );
    if (!panel) return;
    const btn = panel.querySelector<HTMLButtonElement>(".model-dl");

    if (p.running) {
      // Real progress bar lives in the global download toast (lib/ui.ts).
      if (btn) {
        btn.disabled = true;
        btn.textContent = i18n.t("models.downloading");
      }
    } else if (p.done || p.error) {
      // Re-check + re-render once the batch finishes
      this.refresh();
    }
  },
};
