/* ── Session project state: dirty flag + active save path ──
 * history.ts marks dirty on every snapshot (the single chokepoint all
 * mutations flow through); project.ts clears it after save/open. A single
 * listener (wired in renderer.ts) updates the status bar + window title.
 */
let _dirty = false;
let _savePath: string | null = null;
let _listener: (() => void) | null = null;

export function setDirtyListener(cb: (() => void) | null): void {
  _listener = cb;
}

export function markDirty(): void {
  if (_dirty) return;
  _dirty = true;
  _listener?.();
}

export function clearDirty(): void {
  if (!_dirty) return;
  _dirty = false;
  _listener?.();
}

export function isDirty(): boolean {
  return _dirty;
}

export function setSavePath(p: string | null): void {
  _savePath = p;
  _listener?.();
}

export function getSavePath(): string | null {
  return _savePath;
}

/** Notify the UI without changing state (e.g. after page count changes) */
export function notifyDirtyUI(): void {
  _listener?.();
}
