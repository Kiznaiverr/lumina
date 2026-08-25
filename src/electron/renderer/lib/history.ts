/* ── Lumina History — Undo/Redo (snapshot-based) ── */
import { state } from "./state";
import { canvas } from "./canvas/index";
import { sidebar } from "./sidebar";

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

  /** Serialize current pages' detection state */
  _serialize(): string {
    return JSON.stringify(
      state.pages.map((p) => ({
        textDetections: p.textDetections,
        _selectedTextIdx: p._selectedTextIdx,
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
    }>;
    this._restoring = true;
    state.pages.forEach((page, i) => {
      if (!snap[i]) return;
      page.textDetections = snap[i].textDetections as never;
      page._selectedTextIdx = snap[i]._selectedTextIdx;
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
