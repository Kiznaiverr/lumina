/* ── Lumina Model Manager ──
 * Owns model check/download state and gates the header pipeline buttons.
 *
 * Startup only CHECKS — downloads are manual, from Settings → Models.
 * - check():        fetch registry, refresh button states
 * - download(ids):  download the given model ids ("" = all), re-check after
 * - setHasImage():  track whether a page is loaded (pipeline needs both)
 * - selectedModel(): active model id per kind (persisted in localStorage)
 */
import * as i18n from "./i18n";
import { ui } from "./ui";
import { describe, recommendedFor } from "./models/descriptions";
import type { DownloadProgress, ModelInfo } from "../types";

let _models: ModelInfo[] = [];
let _hasImage = false;
let _downloading = false;
const _progressCbs: Array<(p: DownloadProgress) => void> = [];

const SELECTED_KEY = "lumina:selectedModels";

function loadSelected(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(SELECTED_KEY) || "{}");
  } catch {
    return {};
  }
}

function saveSelected(sel: Record<string, string>): void {
  localStorage.setItem(SELECTED_KEY, JSON.stringify(sel));
}

function el(id: string): HTMLElement | null {
  return document.getElementById(id);
}

/** Effective model id for a kind: the saved pick wins (even if not installed),
 *  else the recommended model, else the first installed, else first registered. */
function resolveSelected(kind: string): string {
  const sel = loadSelected();
  const list = _models.filter((m) => m.kind === kind);
  if (!list.length) return "";
  const picked = list.find((m) => m.id === sel[kind]);
  if (picked) return picked.id;
  const rec = recommendedFor(kind);
  const recommended = list.find((m) => m.id === rec);
  if (recommended) return recommended.id;
  const installed = list.find((m) => m.ready);
  return installed ? installed.id : (list[0]?.id ?? "");
}

/** True when the selected model for a kind is installed. */
function selectedReady(kind: string): boolean {
  const id = resolveSelected(kind);
  const m = _models.find((x) => x.kind === kind && x.id === id);
  return !!m && m.ready;
}

/** True when every kind (detect / ocr / inpaint) has its selected model installed. */
function allReady(): boolean {
  const kinds = new Set(_models.map((m) => m.kind));
  return kinds.size > 0 && Array.from(kinds).every((k) => selectedReady(k));
}

function setBtn(id: string, enabled: boolean, modelReady: boolean): void {
  const btn = el(id) as HTMLButtonElement | null;
  if (!btn) return;
  btn.disabled = !enabled;
  btn.title = _hasImage && !modelReady ? i18n.t("models.missingHint") : "";
}

/** Gate header buttons: pipeline needs an image AND the selected model installed. */
function updateButtons(): void {
  setBtn(
    "btn-detect",
    _hasImage && selectedReady("detect"),
    selectedReady("detect"),
  );
  setBtn("btn-ocr", _hasImage && selectedReady("ocr"), selectedReady("ocr"));
  setBtn(
    "btn-inpaint",
    _hasImage && selectedReady("inpaint"),
    selectedReady("inpaint"),
  );
  // Translate is API-based — only needs a page loaded.
  const tr = el("btn-translate") as HTMLButtonElement | null;
  if (tr) tr.disabled = !_hasImage;

  const warn = el("btn-models") as HTMLButtonElement | null;
  if (warn) warn.hidden = allReady();
}

export const models = {
  /** Fetch model registry and refresh header button states. */
  async check(): Promise<ModelInfo[]> {
    try {
      const res = await window.lumina.checkModel();
      _models = res.models || [];
      // Descriptions live in the renderer registry (bilingual), not backend.
      const lang = i18n.lang();
      _models.forEach((m) => {
        const desc = describe(m.id, lang);
        if (desc) m.description = desc;
      });
      updateButtons();
    } catch {
      /* backend not ready yet — keep last state */
    }
    return _models;
  },

  /** True when every registered model is installed. */
  allReady(): boolean {
    return allReady();
  },

  /** True when the selected model of the given kind is installed. */
  ready(kind: string): boolean {
    return selectedReady(kind);
  },

  list(): ModelInfo[] {
    return _models;
  },

  /** Page import state — pipeline buttons also depend on this. */
  setHasImage(v: boolean): void {
    _hasImage = v;
    updateButtons();
  },

  /** Download the given model ids; empty array = all missing. */
  async download(ids: string[]): Promise<void> {
    await window.lumina.downloadModel(ids);
    await this.check();
  },

  /** Active model id for a kind (e.g. "inpaint" → "lama_manga").
   *  The saved pick is returned even when not installed — the header buttons
   *  (not this method) are what disable the pipeline in that case. */
  selectedModel(kind: string): string {
    return resolveSelected(kind);
  },

  setSelectedModel(kind: string, id: string): void {
    const sel = loadSelected();
    sel[kind] = id;
    saveSelected(sel);
  },

  /** Re-evaluate header buttons + warn badge from the current selection. */
  refreshButtons(): void {
    updateButtons();
  },

  /** Raw persisted pick for a kind (even if not installed yet) — for UI display. */
  pickedModel(kind: string): string {
    const sel = loadSelected();
    const list = _models.filter((m) => m.kind === kind);
    if (!list.length) return "";
    return list.some((m) => m.id === sel[kind]) ? sel[kind] : "";
  },

  /** Subscribe to live download progress. Returns an unsubscribe fn. */
  onProgress(cb: (p: DownloadProgress) => void): () => void {
    _progressCbs.push(cb);
    return function () {
      const i = _progressCbs.indexOf(cb);
      if (i >= 0) _progressCbs.splice(i, 1);
    };
  },

  /** True while a model download is in flight (auto-save skips). */
  isDownloading(): boolean {
    return _downloading;
  },
};

// Forward backend progress events to all subscribers once, and drive the
// global download toast (bottom-right: bar, size, speed) for visual feedback.
window.lumina.onDownloadProgress((p) => {
  _downloading = p.running;
  for (const cb of _progressCbs) cb(p);
  if (p.running) {
    if (!document.getElementById("dl-toast")) {
      const kindLabel = p.model
        ? i18n.t("models.section" + p.model[0].toUpperCase() + p.model.slice(1))
        : "";
      ui.downloadToast(i18n.t("toast.modelDownloading", { model: kindLabel }));
    }
    ui.updateDownloadToast(p.progress || 0, p.downloaded || 0, p.total || 0);
  } else if (p.done || p.error) {
    const el = document.getElementById("dl-toast");
    if (el) el.remove();
    if (p.done) ui.toast(i18n.t("toast.modelDownloaded"), "success", 3000);
  }
});
