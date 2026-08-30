/* ── Lumina History — Undo/Redo (snapshot-based, per page) ──
 * Each imported image keeps its OWN undo/redo stack, keyed by the Page
 * object. Undo/redo acts on the active page only, so switching pages never
 * bleeds edits across images. Removing a page drops its stack.
 */
import { state } from "./state";
import { canvas } from "./canvas/index";
import { sidebar } from "./sidebar";
import type { Page } from "../types";

/** Convert a Windows path to a loadable file:// URL */
function _fileUrl(p: string): string {
  let norm = p.replace(/\\/g, "/");
  if (!norm.startsWith("/")) norm = "/" + norm;
  return "file://" + encodeURI(norm).replace(/#/g, "%23").replace(/\?/g, "%3F");
}

const MAX_STACK = 50;

interface HistoryEntry {
  stack: string[];
  idx: number;
}

const _entries = new Map<Page, HistoryEntry>();

function _entry(page: Page): HistoryEntry {
  let e = _entries.get(page);
  if (!e) {
    e = { stack: [], idx: -1 };
    _entries.set(page, e);
  }
  return e;
}

/** Serialize ONE page's full editable state.
 * Page images stay in memory (not serialized) — masks are re-hydrated from
 * their PNG paths on apply. */
function _serializePage(p: Page): string {
  return JSON.stringify({
    textDetections: p.textDetections,
    _selectedTextIdx: p._selectedTextIdx,
    layers: p.layers,
    _selectedLayerId: p._selectedLayerId,
    inpaintMasks: p.inpaintMasks.map((m) => ({
      id: m.id,
      bbox: m.bbox,
      imagePath: m.imagePath,
      visible: m.visible,
      opacity: m.opacity,
    })),
    backgroundVisible: p.backgroundVisible,
  });
}

interface PageSnapshot {
  textDetections: unknown;
  _selectedTextIdx: number | null;
  layers: unknown;
  _selectedLayerId: string | null;
  backgroundVisible?: boolean;
  inpaintMasks?: Array<{
    id: string;
    bbox: { x: number; y: number; w: number; h: number };
    imagePath: string;
    visible: boolean;
    opacity: number;
  }>;
}

export const history = {
  _restoring: false,

  _activeEntry(): HistoryEntry | null {
    const page = state.getActivePage();
    return page ? _entry(page) : null;
  },

  /**
   * Ensure every current page has a baseline snapshot. Only NEW pages get a
   * fresh baseline — pages imported earlier keep their own undo history, so
   * "import more" never wipes existing edits.
   */
  reset(): void {
    state.pages.forEach(function (p) {
      const e = _entry(p);
      if (e.stack.length === 0) {
        e.stack = [_serializePage(p)];
        e.idx = 0;
      }
    });
    this._updateButtons();
  },

  /** Push a snapshot for the ACTIVE page after a mutation */
  snapshot(): void {
    if (this._restoring) return;
    const page = state.getActivePage();
    if (!page) return;
    const e = _entry(page);
    const data = _serializePage(page);
    if (e.stack[e.idx] === data) return; // no change
    e.stack.length = e.idx + 1; // drop redo tail
    e.stack.push(data);
    if (e.stack.length > MAX_STACK) e.stack.shift();
    e.idx = e.stack.length - 1;
    this._updateButtons();
  },

  undo(): void {
    const e = this._activeEntry();
    const page = state.getActivePage();
    if (!e || !page || e.idx <= 0) return;
    e.idx--;
    this._applyPage(page, e.stack[e.idx]);
    this._updateButtons();
  },

  redo(): void {
    const e = this._activeEntry();
    const page = state.getActivePage();
    if (!e || !page || e.idx >= e.stack.length - 1) return;
    e.idx++;
    this._applyPage(page, e.stack[e.idx]);
    this._updateButtons();
  },

  canUndo(): boolean {
    const e = this._activeEntry();
    return !!e && e.idx > 0;
  },

  canRedo(): boolean {
    const e = this._activeEntry();
    return !!e && e.idx < e.stack.length - 1;
  },

  /** Drop a page's history when the page is removed */
  forgetPage(page: Page): void {
    _entries.delete(page);
    this._updateButtons();
  },

  /** Restore a serialized snapshot into live state for one page */
  _applyPage(page: Page, data: string): void {
    const snap = JSON.parse(data) as PageSnapshot;
    this._restoring = true;
    page.textDetections = snap.textDetections as never;
    page._selectedTextIdx = snap._selectedTextIdx;
    page.layers = snap.layers as never;
    page._selectedLayerId = snap._selectedLayerId;
    if (typeof snap.backgroundVisible === "boolean")
      page.backgroundVisible = snap.backgroundVisible;
    const masks = (snap.inpaintMasks || []).map((m) => ({
      ...m,
      image: undefined,
    }));
    page.inpaintMasks = masks as never;
    // Re-hydrate mask images asynchronously; render again once loaded.
    masks.forEach((m) => {
      const img = new Image();
      img.onload = function () {
        const live = page.inpaintMasks.find((lm) => lm.id === m.id);
        if (live) live.image = img;
        if (state.getActivePage() === page) canvas.render();
      };
      img.onerror = function () {
        /* patch file missing — mask stays hidden */
      };
      img.src = _fileUrl(m.imagePath);
    });
    canvas._clearGroups();
    canvas.render();
    if (sidebar && sidebar.render) sidebar.render();
    this._restoring = false;
  },

  _updateButtons(): void {
    const u = document.getElementById("btn-undo") as HTMLButtonElement | null;
    const r = document.getElementById("btn-redo") as HTMLButtonElement | null;
    if (u) u.disabled = !this.canUndo();
    if (r) r.disabled = !this.canRedo();
  },
};
