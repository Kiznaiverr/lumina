/* ── Settings: Models tab — model management ──
 * A segmented tab bar (Text Detection | OCR | Inpainting) switches between
 * category panels. Each panel is a sidebar + workspace layout: the model
 * list is a full-height nav column on the left (scrolls when long), and the
 * selected model's description fills the remaining space on the right with
 * a footer pinned at the bottom — no wasted vertical space.
 */
import * as i18n from "../i18n";
import { models } from "../models";
import { recommendedFor } from "../models/descriptions";
import type { DeviceInfo, DownloadProgress, ModelInfo } from "../../types";

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
    pane.appendChild(this._gpuCard());
    pane.appendChild(hintEl());

    const sections = SECTIONS.map(([kind, titleKey]) => ({
      kind,
      titleKey,
      items: list.filter((m) => m.kind === kind),
    })).filter((s) => s.items.length > 0);

    if (!sections.length) return;

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
    show(_activeKind!);
  },

  /** One category panel: model list (left) + description (right). */
  _panel(kind: string, items: ModelInfo[]): HTMLElement {
    const panel = document.createElement("div");
    panel.className = "model-panel hidden";
    panel.dataset.kind = kind;
    panel.dataset.panel = kind;

    const grid = document.createElement("div");
    grid.className = "model-grid";
    grid.appendChild(this._list(kind, items, panel));
    grid.appendChild(this._desc(kind, items));
    panel.appendChild(grid);

    this._updateAll(panel, kind, items);
    return panel;
  },

  /** Selectable model rows — name, size, status. Clicking selects. */
  _list(kind: string, items: ModelInfo[], panel: HTMLElement): HTMLElement {
    const list = document.createElement("div");
    list.className = "model-list";

    for (const m of items) {
      const row = document.createElement("div");
      row.className = "model-row";
      row.dataset.model = m.id;

      const name = document.createElement("span");
      name.className = "model-name";
      name.textContent = m.name;
      name.title = m.name;

      const meta = document.createElement("span");
      meta.className = "model-meta";
      const size = document.createElement("span");
      size.className = "model-size";
      size.textContent = fmtSize(m.size);
      const badge = document.createElement("span");
      badge.className = "model-badge " + (m.ready ? "ready" : "missing");
      badge.textContent = i18n.t(m.ready ? "models.ready" : "models.missing");
      meta.append(size, badge);

      row.append(name, meta);
      row.addEventListener("click", () => {
        models.setSelectedModel(kind, m.id);
        models.refreshButtons();
        this._updateAll(panel, kind, items);
      });
      list.appendChild(row);
    }
    return list;
  },

  /** Description panel for the selected model — title, description, footer. */
  _desc(kind: string, items: ModelInfo[]): HTMLElement {
    const card = document.createElement("div");
    card.className = "model-desc";
    card.dataset.kind = kind;

    const head = document.createElement("div");
    head.className = "model-desc-head";
    const title = document.createElement("div");
    title.className = "model-desc-title";
    const name = document.createElement("div");
    name.className = "model-desc-name";
    const devBadge = document.createElement("span");
    devBadge.className = "model-badge model-dev";
    devBadge.textContent = i18n.t("models.dev");
    devBadge.hidden = true;
    const rec = document.createElement("span");
    rec.className = "model-badge model-rec";
    rec.textContent = i18n.t("models.recommended");
    rec.hidden = true;
    const badge = document.createElement("span");
    badge.className = "model-badge model-selected";
    badge.textContent = i18n.t("models.selected");
    badge.hidden = true;
    title.append(name, devBadge, rec);
    head.append(title, badge);

    const text = document.createElement("p");
    text.className = "model-desc-text";

    const gpu = document.createElement("div");
    gpu.className = "model-desc-gpu";
    gpu.hidden = true;
    const gpuLabel = document.createElement("span");
    gpuLabel.className = "model-desc-gpu-label";
    gpuLabel.textContent = i18n.t("models.gpuAccel");
    const gpuValue = document.createElement("span");
    gpuValue.className = "model-desc-gpu-value";
    gpu.append(gpuLabel, gpuValue);

    const foot = document.createElement("div");
    foot.className = "model-desc-foot";
    const meta = document.createElement("span");
    meta.className = "model-desc-meta";
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn model-dl";
    btn.dataset.model = "";
    btn.addEventListener("click", () =>
      this._download(btn, btn.dataset.model || ""),
    );
    foot.append(meta, btn);

    card.append(head, text, gpu, foot);
    return card;
  },

  /** GPU acceleration card: device name + EP + on/off toggle. */
  _gpuCard(): HTMLElement {
    const card = document.createElement("div");
    card.className = "model-gpu";

    const info = document.createElement("div");
    info.className = "model-gpu-info";
    const name = document.createElement("div");
    name.className = "model-gpu-name";
    const ep = document.createElement("div");
    ep.className = "model-gpu-ep";
    info.append(name, ep);

    const toggle = document.createElement("label");
    toggle.className = "toggle";
    toggle.title = i18n.t("settings.gpuToggleTitle");
    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = models.useGpu();
    input.addEventListener("change", () => {
      input.disabled = true;
      models.setUseGpu(input.checked).then(() => {
        input.disabled = false;
      });
    });
    const track = document.createElement("span");
    track.className = "track";
    toggle.append(input, track);

    card.append(info, toggle);
    this._renderGpuCard(card, models.device());
    // Keep the card live when device info changes elsewhere (startup fetch,
    // toggle from another path, backend restart).
    models.onDeviceChange((d) => this._renderGpuCard(card, d));
    return card;
  },

  _renderGpuCard(card: HTMLElement, dev: DeviceInfo | null): void {
    const name = card.querySelector<HTMLElement>(".model-gpu-name")!;
    const ep = card.querySelector<HTMLElement>(".model-gpu-ep")!;
    const input = card.querySelector<HTMLInputElement>("input[type=checkbox]")!;
    const accel = !!dev?.accelerated;

    name.textContent =
      dev?.gpuName || i18n.t(dev ? "settings.gpuNone" : "settings.gpuUnknown");
    ep.textContent = dev
      ? `${dev.ep} · onnxruntime ${dev.onnxRuntime ?? "?"}`
      : "";

    let badge = card.querySelector<HTMLElement>(".model-gpu-badge");
    if (!badge) {
      badge = document.createElement("span");
      badge.className = "model-gpu-badge";
      card.appendChild(badge);
    }
    badge.textContent = accel
      ? i18n.t("settings.gpuActive")
      : i18n.t("settings.gpuCpu");
    badge.classList.toggle("on", accel);

    input.checked = models.useGpu();

    let hint = card.querySelector<HTMLElement>(".model-gpu-hint");
    const showHint = models.useGpu() && !accel;
    if (showHint) {
      if (!hint) {
        hint = document.createElement("p");
        hint.className = "model-gpu-hint";
        card.appendChild(hint);
      }
      hint.textContent = i18n.t("settings.gpuUnsupported");
    } else if (hint) {
      hint.remove();
    }
  },

  /** Start a model download and disable the triggering button. */
  _download(btn: HTMLButtonElement, modelId: string): void {
    if (!modelId) return;
    btn.disabled = true;
    btn.textContent = i18n.t("models.downloading");
    models.download([modelId]).catch(() => {
      btn.disabled = false;
      btn.textContent = i18n.t("models.download");
    });
  },

  /** Re-sync list highlight + description panel to the active model. */
  _updateAll(panel: HTMLElement, kind: string, items: ModelInfo[]): void {
    // UI follows the saved pick (even if not installed). The header pipeline
    // buttons disable when the picked model is missing — no silent fallback.
    const picked = models.pickedModel(kind);
    const sel = picked || models.selectedModel(kind);

    panel
      .querySelectorAll<HTMLElement>(".model-row")
      .forEach((r) => r.classList.toggle("active", r.dataset.model === sel));

    const card = panel.querySelector<HTMLElement>(".model-desc");
    if (!card) return;
    const m = items.find((x) => x.id === sel) ?? items[0];
    if (!m) return;

    card.dataset.model = m.id;
    card.querySelector<HTMLElement>(".model-desc-name")!.textContent = m.name;
    card.querySelector<HTMLElement>(".model-dev")!.hidden = m.status !== "dev";
    card.querySelector<HTMLElement>(".model-rec")!.hidden =
      m.id !== recommendedFor(kind);
    const badge = card.querySelector<HTMLElement>(".model-selected")!;
    badge.hidden = m.id !== sel;
    badge.textContent = i18n.t("models.selected");
    const text = card.querySelector<HTMLElement>(".model-desc-text")!;
    text.textContent = m.description || i18n.t("models.noDescription");
    const gpuEl = card.querySelector<HTMLElement>(".model-desc-gpu")!;
    gpuEl.hidden = !m.gpu;
    gpuEl.querySelector<HTMLElement>(".model-desc-gpu-value")!.textContent =
      m.gpu || "";
    card.querySelector<HTMLElement>(".model-desc-meta")!.textContent = fmtSize(
      m.size,
    );
    const btn = card.querySelector<HTMLButtonElement>(".model-dl")!;
    btn.dataset.model = m.id;
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
    // Any download button for this category (row + description panel)
    const btns = panel.querySelectorAll<HTMLButtonElement>(".model-dl");

    if (p.running) {
      // Real progress bar lives in the global download toast (lib/ui.ts).
      btns.forEach((b) => {
        b.disabled = true;
        b.textContent = i18n.t("models.downloading");
      });
    } else if (p.done || p.error) {
      // Re-check + re-render once the batch finishes
      this.refresh();
    }
  },
};
