/* ── Settings modal: floating window (drag via titlebar, resize via corner grip) ──
 * Position/size persisted in localStorage so the window reopens where it was left.
 */
const STORE_KEY = "lumina:settingsWindow";

const MIN_W = 560;
const MIN_H = 400;
const EDGE = 8;

interface WindowRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

function loadRect(): WindowRect | null {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return null;
    const r = JSON.parse(raw) as WindowRect;
    if (
      typeof r.x !== "number" ||
      typeof r.y !== "number" ||
      typeof r.w !== "number" ||
      typeof r.h !== "number"
    ) {
      return null;
    }
    return r;
  } catch {
    return null;
  }
}

function saveRect(r: WindowRect): void {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(r));
  } catch {
    /* storage unavailable — ignore */
  }
}

function clamp(r: WindowRect): WindowRect {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const w = Math.min(Math.max(r.w, MIN_W), vw - EDGE * 2);
  const h = Math.min(Math.max(r.h, MIN_H), vh - EDGE * 2);
  const x = Math.min(Math.max(r.x, EDGE), vw - w - EDGE);
  const y = Math.min(Math.max(r.y, EDGE), vh - h - EDGE);
  return { x, y, w, h };
}

function currentRect(modal: HTMLElement): WindowRect {
  return {
    x: parseFloat(modal.style.left) || 0,
    y: parseFloat(modal.style.top) || 0,
    w: parseFloat(modal.style.width) || modal.offsetWidth,
    h: parseFloat(modal.style.height) || modal.offsetHeight,
  };
}

function apply(modal: HTMLElement, r: WindowRect): void {
  modal.style.left = r.x + "px";
  modal.style.top = r.y + "px";
  modal.style.width = r.w + "px";
  modal.style.height = r.h + "px";
}

function bindDrag(modal: HTMLElement, titlebar: HTMLElement): void {
  titlebar.addEventListener("pointerdown", (e) => {
    if ((e.target as HTMLElement).closest("button")) return;
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    const rect = currentRect(modal);
    titlebar.setPointerCapture(e.pointerId);
    document.body.classList.add("dragging-settings");

    const onMove = (ev: PointerEvent) => {
      const r = clamp({
        x: rect.x + (ev.clientX - startX),
        y: rect.y + (ev.clientY - startY),
        w: rect.w,
        h: rect.h,
      });
      apply(modal, r);
    };
    const onUp = (ev: PointerEvent) => {
      titlebar.releasePointerCapture(ev.pointerId);
      titlebar.removeEventListener("pointermove", onMove);
      titlebar.removeEventListener("pointerup", onUp);
      titlebar.removeEventListener("pointercancel", onUp);
      document.body.classList.remove("dragging-settings");
      saveRect(currentRect(modal));
    };
    titlebar.addEventListener("pointermove", onMove);
    titlebar.addEventListener("pointerup", onUp);
    titlebar.addEventListener("pointercancel", onUp);
  });
}

function bindResize(modal: HTMLElement, grip: HTMLElement): void {
  grip.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startY = e.clientY;
    const rect = currentRect(modal);
    grip.setPointerCapture(e.pointerId);
    document.body.classList.add("resizing-settings");

    const onMove = (ev: PointerEvent) => {
      const r = clamp({
        x: rect.x,
        y: rect.y,
        w: rect.w + (ev.clientX - startX),
        h: rect.h + (ev.clientY - startY),
      });
      apply(modal, r);
    };
    const onUp = (ev: PointerEvent) => {
      grip.releasePointerCapture(ev.pointerId);
      grip.removeEventListener("pointermove", onMove);
      grip.removeEventListener("pointerup", onUp);
      grip.removeEventListener("pointercancel", onUp);
      document.body.classList.remove("resizing-settings");
      saveRect(currentRect(modal));
    };
    grip.addEventListener("pointermove", onMove);
    grip.addEventListener("pointerup", onUp);
    grip.addEventListener("pointercancel", onUp);
  });
}

/** Call once after the modal exists. Applies saved rect or centers the window. */
export function initSettingsWindow(): void {
  const modal = document.getElementById("settings-modal");
  const titlebar = document.getElementById("settings-titlebar");
  const grip = document.getElementById("settings-resize-grip");
  if (!modal || !titlebar || !grip) return;

  const saved = loadRect();
  if (saved) {
    apply(modal, clamp(saved));
  } else {
    const w = Math.min(860, window.innerWidth - EDGE * 2);
    const h = Math.min(640, window.innerHeight - EDGE * 2);
    apply(modal, {
      x: (window.innerWidth - w) / 2,
      y: (window.innerHeight - h) / 2,
      w,
      h,
    });
  }

  window.addEventListener("resize", () =>
    apply(modal, clamp(currentRect(modal))),
  );
  bindDrag(modal, titlebar);
  bindResize(modal, grip);
}

/** Re-clamp on open — the app window may have shrunk while settings were closed. */
export function applySettingsWindow(): void {
  const modal = document.getElementById("settings-modal");
  if (!modal) return;
  apply(modal, clamp(currentRect(modal)));
}
