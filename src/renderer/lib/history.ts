/* ── Lumina History — Undo/Redo (snapshot-based, per page) ──
 * Each imported image keeps its OWN undo/redo stack, keyed by the Page
 * object. Undo/redo acts on the active page only, so switching pages never
 * bleeds edits across images. Removing a page drops its stack.
 */
import { state } from "./state";
import { canvas } from "./canvas/index";
import { sidebar } from "./sidebar";
import { markDirty } from "./dirty";
import { hydrateCleanupCanvas } from "./canvas/paintool/shared";
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

/** JSON-safe snapshot of the selection tool's transient state (see
 * ``setSelectionHistoryHandlers``). Undo/redo restores committed rectangle /
 * lasso selections alongside page content. */
export interface SelectionSnapshotState {
  selections: unknown;
  activeId: string | null;
}

type SelectionCapture = () => SelectionSnapshotState | null;
type SelectionRestore = (s: SelectionSnapshotState) => void;

let _captureSelections: SelectionCapture | null = null;
let _restoreSelections: SelectionRestore | null = null;

/** Register the selection tool's serializers so history snapshots include
 * committed selections and undo/redo can bring them back (with the overlay
 * redrawn). Pass nulls to unregister. */
export function setSelectionHistoryHandlers(
  capture: SelectionCapture | null,
  restore: SelectionRestore | null,
): void {
  _captureSelections = capture;
  _restoreSelections = restore;
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
    cleanupMask: p.cleanupMask
      ? {
          id: p.cleanupMask.id,
          visible: p.cleanupMask.visible,
          opacity: p.cleanupMask.opacity,
          imagePath: p.cleanupMask.imagePath,
        }
      : null,
    backgroundVisible: p.backgroundVisible,
    selections: _captureSelections ? _captureSelections() : null,
  });
}

interface PageSnapshot {
  textDetections: unknown;
  _selectedTextIdx: number | null;
  layers: unknown;
  _selectedLayerId: string | null;
  backgroundVisible?: boolean;
  selections?: SelectionSnapshotState | null;
  inpaintMasks?: Array<{
    id: string;
    bbox: { x: number; y: number; w: number; h: number };
    imagePath: string;
    visible: boolean;
    opacity: number;
  }>;
  cleanupMask?: {
    id: string;
    visible: boolean;
    opacity: number;
    imagePath: string | null;
  } | null;
}

/** Re-hydrate mask PNGs from their imagePath — decoded images are never
 * serialized (undo stack, project files). Each load re-renders the active
 * page so masks appear as soon as they're ready. */
export function hydrateMaskImages(page: Page): void {
  (page.inpaintMasks || []).forEach((m) => {
    if (m.image) return;
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

  /**
   * Push a snapshot for the ACTIVE page after a mutation. Pass
   * ``{ dirty: false }`` for transient UI state that must be undoable but
   * should not mark the project modified (e.g. selection edits).
   */
  snapshot(opts?: { dirty?: boolean }): void {
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
    if (!opts || opts.dirty !== false) markDirty();
    this._updateButtons();
  },

  /**
   * Overwrite the NEWEST snapshot with the current state. Used when an async
   * step completes after the last snapshot (e.g. OCR text landing on boxes
   * added by "convert to detection") so the whole operation stays a single
   * undo step instead of two. No-op when the newest entry is no longer on
   * top of the stack (an undo/redo happened in between) or nothing changed.
   */
  replace(): void {
    if (this._restoring) return;
    const page = state.getActivePage();
    if (!page) return;
    const e = _entry(page);
    if (e.idx !== e.stack.length - 1) return; // only the newest entry
    const data = _serializePage(page);
    if (e.stack[e.idx] === data) return; // no change
    e.stack[e.idx] = data;
    markDirty();
    this._updateButtons();
  },

  undo(): void {
    const e = this._activeEntry();
    const page = state.getActivePage();
    if (!e || !page || e.idx <= 0) return;
    e.idx--;
    this._applyPage(page, e.stack[e.idx]);
    markDirty();
    this._updateButtons();
  },

  redo(): void {
    const e = this._activeEntry();
    const page = state.getActivePage();
    if (!e || !page || e.idx >= e.stack.length - 1) return;
    e.idx++;
    this._applyPage(page, e.stack[e.idx]);
    markDirty();
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
    // Cleanup raster layer: restore fields, drop the runtime canvas, and
    // reload its PNG from the versioned path (same pattern as inpaint masks).
    if (snap.cleanupMask) {
      page.cleanupMask = {
        id: snap.cleanupMask.id,
        visible: snap.cleanupMask.visible,
        opacity: snap.cleanupMask.opacity,
        imagePath: snap.cleanupMask.imagePath,
        cleanupCanvas: undefined,
      };
    } else {
      page.cleanupMask = null;
    }
    // Re-hydrate mask images asynchronously; render again once loaded.
    hydrateMaskImages(page);
    hydrateCleanupCanvas(page);
    // Selections are transient but undoable — bring them back with the
    // page so Ctrl+Z removes the rectangle/lasso that was just drawn.
    if (snap.selections && _restoreSelections)
      _restoreSelections(snap.selections);
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
