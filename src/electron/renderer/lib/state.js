/* ── Lumina State & Constants ── */
window.Lumina = window.Lumina || {};
var L = window.Lumina;

L.CONST = {
  DEFAULT_FONT_SIZE: 18,
  MIN_FONT_SIZE: 8,
  FONT_STEP: 1,
  FONT_FAMILY: "Arial, sans-serif",
  BUBBLE_PADDING: 0.85,
};

/**
 * Page object shape:
 * {
 *   filePath: string,
 *   fileName: string,
 *   image: HTMLImageElement,
 *   naturalWidth: number,
 *   naturalHeight: number,
 *   textDetections: Array<{id, bbox:{x,y,w,h}, type, confidence, status}>,
 *   bubbleDetections: Array<{id, bbox:{x,y,w,h}, confidence, status}>,
 *   cleanedImage: HTMLImageElement|null,
 * }
 */

L.state = {
  // ── Multi-page ──
  pages: [],
  activePageIdx: null,

  // ── Detection state (kept for convenience) ──
  isRunning: false,
  _modelLoaded: false,

  // ── Canvas state ──
  _zoomLevel: 1,
  _panX: 0,
  _panY: 0,
  _resizeTimer: null,
  _viewMode: "original", // "original" | "cleaned"

  // ── Tools ──
  activeTool: "select",
  fontList: [],
  sidebarCollapsed: false,
  sidebarWidth: 260,
};

/** Get the active page object or null */
L.state.getActivePage = function () {
  if (this.activePageIdx === null || !this.pages[this.activePageIdx]) return null;
  return this.pages[this.activePageIdx];
};

/** Add a page and return its index */
L.state.addPage = function (pageObj) {
  this.pages.push(pageObj);
  return this.pages.length - 1;
};

/** Remove a page by index */
L.state.removePage = function (idx) {
  if (idx < 0 || idx >= this.pages.length) return;
  this.pages.splice(idx, 1);
  if (this.activePageIdx !== null) {
    if (this.activePageIdx >= this.pages.length) {
      this.activePageIdx = this.pages.length > 0 ? this.pages.length - 1 : null;
    }
  }
};

/** Set active page, returns the page or null */
L.state.setActivePage = function (idx) {
  if (idx < 0 || idx >= this.pages.length) return null;
  this.activePageIdx = idx;
  this._viewMode = "original";
  return this.pages[idx];
};
