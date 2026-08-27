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
import type { DownloadProgress, ModelInfo } from "../types";

let _models: ModelInfo[] = [];
let _hasImage = false;
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

/** A kind is usable when at least one of its models is installed. */
function readyFor(kind: string): boolean {
  const list = _models.filter((m) => m.kind === kind);
  return list.some((m) => m.ready);
}

/** True when every kind (detect / ocr / inpaint) has ≥1 installed model. */
function allReady(): boolean {
  const kinds = new Set(_models.map((m) => m.kind));
  return kinds.size > 0 && Array.from(kinds).every((k) => readyFor(k));
}

function setBtn(id: string, enabled: boolean, modelReady: boolean): void {
  const btn = el(id) as HTMLButtonElement | null;
  if (!btn) return;
  btn.disabled = !enabled;
  btn.title = _hasImage && !modelReady ? i18n.t("models.missingHint") : "";
}

/** Gate header buttons: pipeline needs an image AND its model installed. */
function updateButtons(): void {
  setBtn("btn-detect", _hasImage && readyFor("detect"), readyFor("detect"));
  setBtn("btn-ocr", _hasImage && readyFor("ocr"), readyFor("ocr"));
  setBtn("btn-inpaint", _hasImage && readyFor("inpaint"), readyFor("inpaint"));
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

  /** True when every model of the given kind is installed. */
  ready(kind: string): boolean {
    return readyFor(kind);
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

  /** Active model id for a kind (e.g. "inpaint" → "lama_manga"). */
  selectedModel(kind: string): string {
    const sel = loadSelected();
    const list = _models.filter((m) => m.kind === kind);
    if (!list.length) return "";
    const picked = list.find((m) => m.id === sel[kind]);
    if (picked && picked.ready) return picked.id;
    // Saved pick not installed → prefer any installed model of this kind.
    const installed = list.find((m) => m.ready);
    return installed ? installed.id : (list[0]?.id ?? "");
  },

  setSelectedModel(kind: string, id: string): void {
    const sel = loadSelected();
    sel[kind] = id;
    saveSelected(sel);
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
};

// Forward backend progress events to all subscribers once.
window.lumina.onDownloadProgress((p) => {
  for (const cb of _progressCbs) cb(p);
});
