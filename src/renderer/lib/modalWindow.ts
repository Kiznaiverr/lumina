/* ── Reusable floating-window behavior: drag via titlebar, resize via corner grip ──
 * Used by the settings and export modals so both behave like a real window.
 */

export const MODAL_EDGE = 8;

export interface ModalRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Keep the rect inside the viewport and above minimum size. */
export function clampRect(r: ModalRect, minW = 560, minH = 400): ModalRect {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const w = Math.min(Math.max(r.w, minW), vw - MODAL_EDGE * 2);
  const h = Math.min(Math.max(r.h, minH), vh - MODAL_EDGE * 2);
  const x = Math.min(Math.max(r.x, MODAL_EDGE), vw - w - MODAL_EDGE);
  const y = Math.min(Math.max(r.y, MODAL_EDGE), vh - h - MODAL_EDGE);
  return { x, y, w, h };
}

/** A centered rect of the given size, clamped to the viewport. */
export function centerRect(w: number, h: number): ModalRect {
  return {
    x: Math.max(MODAL_EDGE, (window.innerWidth - w) / 2),
    y: Math.max(MODAL_EDGE, (window.innerHeight - h) / 2),
    w: Math.min(w, window.innerWidth - MODAL_EDGE * 2),
    h: Math.min(h, window.innerHeight - MODAL_EDGE * 2),
  };
}

export function applyRect(modal: HTMLElement, r: ModalRect): void {
  modal.style.left = r.x + "px";
  modal.style.top = r.y + "px";
  modal.style.width = r.w + "px";
  modal.style.height = r.h + "px";
}

export function currentRect(modal: HTMLElement): ModalRect {
  return {
    x: parseFloat(modal.style.left) || 0,
    y: parseFloat(modal.style.top) || 0,
    w: parseFloat(modal.style.width) || modal.offsetWidth,
    h: parseFloat(modal.style.height) || modal.offsetHeight,
  };
}

/** Pointer-capture based drag from a titlebar. Buttons inside it are excluded. */
export function bindDrag(
  modal: HTMLElement,
  titlebar: HTMLElement,
  onCommit?: (r: ModalRect) => void,
): void {
  titlebar.addEventListener("pointerdown", (e) => {
    if ((e.target as HTMLElement).closest("button")) return;
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    const rect = currentRect(modal);
    titlebar.setPointerCapture(e.pointerId);
    document.body.classList.add("dragging-settings");

    const onMove = (ev: PointerEvent) => {
      applyRect(
        modal,
        clampRect({
          x: rect.x + (ev.clientX - startX),
          y: rect.y + (ev.clientY - startY),
          w: rect.w,
          h: rect.h,
        }),
      );
    };
    const onUp = (ev: PointerEvent) => {
      titlebar.releasePointerCapture(ev.pointerId);
      titlebar.removeEventListener("pointermove", onMove);
      titlebar.removeEventListener("pointerup", onUp);
      titlebar.removeEventListener("pointercancel", onUp);
      document.body.classList.remove("dragging-settings");
      onCommit?.(currentRect(modal));
    };
    titlebar.addEventListener("pointermove", onMove);
    titlebar.addEventListener("pointerup", onUp);
    titlebar.addEventListener("pointercancel", onUp);
  });
}

/** Pointer-capture based resize from a bottom-right corner grip. */
export function bindResize(
  modal: HTMLElement,
  grip: HTMLElement,
  onCommit?: (r: ModalRect) => void,
): void {
  grip.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startY = e.clientY;
    const rect = currentRect(modal);
    grip.setPointerCapture(e.pointerId);
    document.body.classList.add("resizing-settings");

    const onMove = (ev: PointerEvent) => {
      applyRect(
        modal,
        clampRect({
          x: rect.x,
          y: rect.y,
          w: rect.w + (ev.clientX - startX),
          h: rect.h + (ev.clientY - startY),
        }),
      );
    };
    const onUp = (ev: PointerEvent) => {
      grip.releasePointerCapture(ev.pointerId);
      grip.removeEventListener("pointermove", onMove);
      grip.removeEventListener("pointerup", onUp);
      grip.removeEventListener("pointercancel", onUp);
      document.body.classList.remove("resizing-settings");
      onCommit?.(currentRect(modal));
    };
    grip.addEventListener("pointermove", onMove);
    grip.addEventListener("pointerup", onUp);
    grip.addEventListener("pointercancel", onUp);
  });
}
