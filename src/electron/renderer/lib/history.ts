/* ── Lumina History — Undo/Redo (snapshot-based) ── */
import { state } from "./state";
import { canvas } from "./canvas/index";
import { sidebar } from "./sidebar";

/** Convert a Windows path to a loadable file:// URL */
function _fileUrl(p: string): string {
  let norm = p.replace(/\\/g, "/");
  if (!norm.startsWith("/")) norm = "/" + norm;
  return "file://" + encodeURI(norm).replace(/#/g, "%23").replace(/\?/g, "%3F");
}

/**
 * Tracks detection state (bboxes, statuses, selection) per snapshot.
 * Stack-based with moving index: mutations truncate redo tail.
 * Page add/remove is NOT tracked (basic scope).
 */
export const history = {
  _stack: [] as string[],
  _idx: -1,
  _max: 50,
  _restoring: false,

  /** Serialize current pages' full editable state.
   * Includes the unified layer model (bbox/text/typography/visibility), the
   * inpaint mask layers, and both selections. Page images stay in memory
   * (not serialized) — masks are re-hydrated from their PNG paths on apply.
   */
  _serialize(): string {
    return JSON.stringify(
      state.pages.map((p) => ({
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
      })),
    );
  },

  /** Start fresh history with current state as baseline */
  reset(): void {
    this._stack = [this._serialize()];
    this._idx = 0;
    this._updateButtons();
  },

  /** Push snapshot after a mutation */
  snapshot(): void {
    if (this._restoring) return;
    const data = this._serialize();
    if (this._stack[this._idx] === data) return; // no change
    this._stack.length = this._idx + 1; // drop redo tail
    this._stack.push(data);
    if (this._stack.length > this._max) this._stack.shift();
    this._idx = this._stack.length - 1;
    this._updateButtons();
  },

  undo(): void {
    if (this._idx <= 0) return;
    this._idx--;
    this._apply(this._stack[this._idx]);
    this._updateButtons();
  },

  redo(): void {
    if (this._idx >= this._stack.length - 1) return;
    this._idx++;
    this._apply(this._stack[this._idx]);
    this._updateButtons();
  },

  canUndo(): boolean {
    return this._idx > 0;
  },
  canRedo(): boolean {
    return this._idx < this._stack.length - 1;
  },

  /** Restore a serialized snapshot into live state */
  _apply(data: string): void {
    const snap = JSON.parse(data) as Array<{
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
    }>;
    this._restoring = true;
    state.pages.forEach((page, i) => {
      if (!snap[i]) return;
      page.textDetections = snap[i].textDetections as never;
      page._selectedTextIdx = snap[i]._selectedTextIdx;
      page.layers = snap[i].layers as never;
      page._selectedLayerId = snap[i]._selectedLayerId;
      if (typeof snap[i].backgroundVisible === "boolean")
        page.backgroundVisible = snap[i].backgroundVisible;
      const masks = (snap[i].inpaintMasks || []).map((m) => ({
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
