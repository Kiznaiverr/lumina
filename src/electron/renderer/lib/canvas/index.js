/* ── Lumina Canvas — Public API ── */
var L = window.Lumina;

/**
 * Canvas modules loaded in order:
 *   render.js   — stage, render(), getScaleRatio(), getOffset()
 *   detections.js — group factories, selection, refresh, onToolChange
 *   pages.js    — page strip, switchPage, removePage
 *
 * This file wires them together under L.canvas.
 */
(function () {
  L.canvas = L.canvas || {};

  /** Full re-render of current page */
  L.canvas.render = L.canvas.render || function () {
    L.canvas._clearGroups();
    // render.js rebuilds everything
  };

  /** Zoom in/out */
  L.canvas.zoomIn = function () {
    L.state._zoomLevel = Math.min(5, L.state._zoomLevel * 1.2);
    L.ui.updateZoom();
    L.canvas.render();
  };

  L.canvas.zoomOut = function () {
    L.state._zoomLevel = Math.max(0.1, L.state._zoomLevel / 1.2);
    L.ui.updateZoom();
    L.canvas.render();
  };

  L.canvas.zoomReset = function () {
    L.state._zoomLevel = 1;
    L.ui.updateZoom();
    L.canvas.render();
  };

  /** Toggle before/after view */
  L.canvas.setViewMode = function (mode) {
    L.state._viewMode = mode;
    var btnOriginal = document.getElementById("btn-view-original");
    var btnCleaned = document.getElementById("btn-view-cleaned");
    if (btnOriginal) btnOriginal.classList.toggle("active", mode === "original");
    if (btnCleaned) btnCleaned.classList.toggle("active", mode === "cleaned");
    L.canvas.render();
  };

  /** Toggle view buttons visibility */
  L.canvas.updateViewToggle = function () {
    var toggle = document.getElementById("view-toggle");
    if (!toggle) return;
    var page = L.state.getActivePage();
    if (page && page.cleanedImage) {
      toggle.classList.remove("hidden");
    } else {
      toggle.classList.add("hidden");
    }
  };

  /** Keyboard shortcuts for canvas */
  L.canvas._initKeyboard = function () {
    document.addEventListener("keydown", function (e) {
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
      if (e.key === " " || e.code === "Space") {
        e.preventDefault();
        var page = L.state.getActivePage();
        if (page && page.cleanedImage) {
          L.canvas.setViewMode(L.state._viewMode === "original" ? "cleaned" : "original");
        }
      }
    });
  };

  /** Wire view toggle buttons */
  L.canvas._initViewToggle = function () {
    var btnOriginal = document.getElementById("btn-view-original");
    var btnCleaned = document.getElementById("btn-view-cleaned");
    if (btnOriginal) {
      btnOriginal.addEventListener("click", function () { L.canvas.setViewMode("original"); });
    }
    if (btnCleaned) {
      btnCleaned.addEventListener("click", function () { L.canvas.setViewMode("cleaned"); });
    }
  };

  /** Wire deselect-on-empty-click once */
  L.canvas._initDeselectClick = function () {
    // Deferred: called after first stage creation
    if (L.canvas._clickBound) return;
    var stage = L.canvas.getStage();
    if (!stage) return;
    L.canvas._clickBound = true;
    stage.on("click tap", function (e) {
      if (e.target === stage || e.target.getParent() === L.canvas.getLayer()) {
        L.canvas.selectTextDetection(null);
        L.canvas.selectBubbleDetection(null);
      }
    });
  };

  /** Sidebar resize */
  L.canvas._initSidebarResize = function () {
    var sidebar = document.getElementById("sidebar");
    var resizeHandle = document.getElementById("sidebar-resize");
    if (!sidebar || !resizeHandle) return;

    var dragging = false;
    resizeHandle.addEventListener("mousedown", function (e) {
      dragging = true;
      e.preventDefault();
    });
    document.addEventListener("mousemove", function (e) {
      if (!dragging) return;
      var newWidth = window.innerWidth - e.clientX;
      newWidth = Math.max(180, Math.min(400, newWidth));
      sidebar.style.width = newWidth + "px";
      L.state.sidebarWidth = newWidth;
    });
    document.addEventListener("mouseup", function () {
      if (dragging) {
        dragging = false;
        // Canvas stage size depends on container width — re-fit after resize
        if (L.canvas.render) L.canvas.render();
      }
    });
  };

  /** Init all canvas-related keyboard/UI bindings */
  L.canvas.initBindings = function () {
    L.canvas._initKeyboard();
    L.canvas._initViewToggle();
    L.canvas._initSidebarResize();
  };
})();
