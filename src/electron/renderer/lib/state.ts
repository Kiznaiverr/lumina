/* ── Lumina State & Constants ── */
import type { Page, ToolId } from "../types";

export const CONST = {
  DEFAULT_FONT_SIZE: 18,
  MIN_FONT_SIZE: 8,
  FONT_STEP: 1,
  FONT_FAMILY: "Arial, sans-serif",
  BUBBLE_PADDING: 0.85,
} as const;

export interface AppState {
  // ── Multi-page ──
  pages: Page[];
  activePageIdx: number | null;

  // ── Detection state ──
  isRunning: boolean;
  _modelLoaded: boolean;
  _inpaintLoaded: boolean;

  // ── Canvas state ──
  _resizeTimer: ReturnType<typeof setTimeout> | null;

  // ── Tools ──
  activeTool: ToolId;
  /** System fonts: family + file + style metadata (for FontFace registry) */
  fontList: Array<{
    family: string;
    path: string;
    weight: number;
    italic: boolean;
  }>;
  sidebarCollapsed: boolean;
  sidebarWidth: number;
  /** Detection box overlays — auto-hidden after OCR; user can re-show */
  showDetBoxes: boolean;

  // ── Per-page viewport accessors ──
  _zoomLevel: number;
  _panX: number;
  _panY: number;

  getActivePage(): Page | null;
  addPage(pageObj: Page): number;
  removePage(idx: number): void;
  setActivePage(idx: number): Page | null;
}

export const state: AppState = new (class implements AppState {
  pages: Page[] = [];
  activePageIdx: number | null = null;

  isRunning = false;
  _modelLoaded = false;
  _inpaintLoaded = false;

  _resizeTimer: ReturnType<typeof setTimeout> | null = null;

  activeTool: ToolId = "select";
  fontList: Array<{
    family: string;
    path: string;
    weight: number;
    italic: boolean;
  }> = [];
  sidebarCollapsed = false;
  sidebarWidth = 260;
  showDetBoxes = true;

  _zoomLevel = 1;
  _panX = 0;
  _panY = 0;

  getActivePage(): Page | null {
    if (this.activePageIdx === null || !this.pages[this.activePageIdx])
      return null;
    return this.pages[this.activePageIdx];
  }

  addPage(pageObj: Page): number {
    this.pages.push(pageObj);
    return this.pages.length - 1;
  }

  removePage(idx: number): void {
    if (idx < 0 || idx >= this.pages.length) return;
    this.pages.splice(idx, 1);
    if (this.activePageIdx !== null) {
      if (this.activePageIdx >= this.pages.length) {
        this.activePageIdx =
          this.pages.length > 0 ? this.pages.length - 1 : null;
      }
    }
  }

  setActivePage(idx: number): Page | null {
    if (idx < 0 || idx >= this.pages.length) return null;
    this.activePageIdx = idx;
    return this.pages[idx];
  }
})();

// ── Per-page viewport accessors ──
// Zoom/pan live on each page object so switching pages restores that page's
// own viewport. Reads/writes delegate to the active page.
Object.defineProperties(state, {
  _zoomLevel: {
    get(this: AppState) {
      const p = this.getActivePage();
      return p && p._zoomLevel !== undefined ? p._zoomLevel : 1;
    },
    set(this: AppState, v: number) {
      const p = this.getActivePage();
      if (p) p._zoomLevel = v;
    },
  },
  _panX: {
    get(this: AppState) {
      const p = this.getActivePage();
      return p && p._panX !== undefined ? p._panX : 0;
    },
    set(this: AppState, v: number) {
      const p = this.getActivePage();
      if (p) p._panX = v;
    },
  },
  _panY: {
    get(this: AppState) {
      const p = this.getActivePage();
      return p && p._panY !== undefined ? p._panY : 0;
    },
    set(this: AppState, v: number) {
      const p = this.getActivePage();
      if (p) p._panY = v;
    },
  },
});
