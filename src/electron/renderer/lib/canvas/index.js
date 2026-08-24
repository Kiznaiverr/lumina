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
  L.canvas.render =
    L.canvas.render ||
    function () {
      L.canvas._clearGroups();
      // render.js rebuilds everything
    };

  /** Zoom constants — zoom level is relative to "fit" (1 = fit) */
  var ZOOM_MAX = 64;
  var ZOOM_MIN = 0.1;
  var ZOOM_STEP = 1.2;

  /** Clamp pan so the image can never be dragged fully out of view */
  function _clampPan() {
    var container = document.getElementById("canvas-container");
    var page = L.state.getActivePage();
    if (!container || !page) {
      L.state._panX = 0;
      L.state._panY = 0;
      return;
    }
    var sr = (L.canvas.getBaseScaleRatio || L.canvas.getScaleRatio)();
    var imgW = page.naturalWidth * sr * (L.state._zoomLevel || 1);
    var imgH = page.naturalHeight * sr * (L.state._zoomLevel || 1);
    var cw = container.clientWidth;
    var ch = container.clientHeight;

    // Allow panning until image edge reaches the opposite edge of the viewport
    var marginX = Math.max(0, (imgW - cw) / 2 + Math.min(cw, imgW) / 2);
    var marginY = Math.max(0, (imgH - ch) / 2 + Math.min(ch, imgH) / 2);
    // Simpler & robust: keep at least 50% of the image visible
    marginX = Math.max(imgW, cw) / 2;
    marginY = Math.max(imgH, ch) / 2;

    L.state._panX = Math.max(-marginX, Math.min(marginX, L.state._panX || 0));
    L.state._panY = Math.max(-marginY, Math.min(marginY, L.state._panY || 0));
  }

  /** Set zoom level (1 = fit). anchor: optional {x,y} screen point to zoom around */
  L.canvas.setZoom = function (level, anchor) {
    var old = L.state._zoomLevel || 1;
    // Min zoom = fit — you can never zoom out past the fitted size
    var next = Math.max(1, Math.min(ZOOM_MAX, level));
    if (next === old) return;

    // Keep the point under the anchor stationary while zooming IN
    if (anchor && next > old && L.canvas.getScaleRatio) {
      var container = document.getElementById("canvas-container");
      if (container) {
        var rect = container.getBoundingClientRect();
        // Cursor relative to container center, minus current pan
        var cx =
          anchor.x -
          rect.left -
          container.clientWidth / 2 -
          (L.state._panX || 0);
        var cy =
          anchor.y -
          rect.top -
          container.clientHeight / 2 -
          (L.state._panY || 0);
        var ratio = next / old;
        L.state._panX = (L.state._panX || 0) + cx * (1 - ratio);
        L.state._panY = (L.state._panY || 0) + cy * (1 - ratio);
      }
    } else {
      // Zoom OUT (Photoshop-style): shrink toward the viewport center.
      // Scaling pan by the zoom ratio pulls the image smoothly back to
      // center — at fit (zoom 1) pan lands exactly on 0, no snap.
      var ratio = next / old;
      L.state._panX = (L.state._panX || 0) * ratio;
      L.state._panY = (L.state._panY || 0) * ratio;
    }

    L.state._zoomLevel = next;
    _clampPan();
    L.ui.updateZoom();
    L.canvas.render();
  };

  L.canvas.zoomIn = function () {
    L.canvas.setZoom((L.state._zoomLevel || 1) * ZOOM_STEP);
  };

  L.canvas.zoomOut = function () {
    L.canvas.setZoom((L.state._zoomLevel || 1) / ZOOM_STEP);
  };

  /** Reset zoom to fit AND re-center pan */
  L.canvas.zoomReset = function () {
    L.state._zoomLevel = 1;
    L.state._panX = 0;
    L.state._panY = 0;
    L.ui.updateZoom();
    L.canvas.render();
  };

  /** Wheel: ctrl+wheel or plain wheel = zoom at cursor */
  L.canvas._initWheelZoom = function () {
    var container = document.getElementById("canvas-container");
    if (!container) return;
    container.addEventListener(
      "wheel",
      function (e) {
        var page = L.state.getActivePage();
        if (!page) return;
        e.preventDefault();
        if (e.deltaY < 0) {
          // Zoom in — anchored at cursor
          L.canvas.setZoom((L.state._zoomLevel || 1) * ZOOM_STEP, {
            x: e.clientX,
            y: e.clientY,
          });
        } else {
          // Zoom out — Photoshop-style, shrinks toward viewport center
          L.canvas.setZoom((L.state._zoomLevel || 1) / ZOOM_STEP);
        }
      },
      { passive: false },
    );
  };

  /** Pan via select-tool background drag or middle-mouse drag */
  L.canvas._initPanDrag = function () {
    var stage = function () {
      return L.canvas.getStage();
    };
    var panning = false;
    var last = null;

    function bind(s) {
      if (!s || s._panBound) return;
      s._panBound = true;

      s.on("mousedown touchstart", function (e) {
        var middleBtn = e.evt && e.evt.button === 1;
        // Pan on: middle-mouse, or ANY tool dragging the empty canvas
        // background. Background = stage itself, backdrop rect, or the
        // page image (all named "bg"). Detection groups/badges never pan.
        var onBackground =
          e.target === s || (e.target.name && e.target.name() === "bg");
        if (!middleBtn && !onBackground) return;
        panning = true;
        last = { x: e.evt.clientX, y: e.evt.clientY };
        var container = document.getElementById("canvas-container");
        if (container) container.style.cursor = "grabbing";
        e.evt.preventDefault();
      });

      window.addEventListener("mousemove", function (e) {
        if (!panning) return;
        L.state._panX = (L.state._panX || 0) + (e.clientX - last.x);
        L.state._panY = (L.state._panY || 0) + (e.clientY - last.y);
        last = { x: e.clientX, y: e.clientY };
        _clampPan();
        L.canvas.render();
      });

      window.addEventListener("mouseup", function () {
        if (!panning) return;
        panning = false;
        var container = document.getElementById("canvas-container");
        if (container)
          container.style.cursor =
            L.state.activeTool === "lasso" ? "crosshair" : "default";
      });
    }

    // Bind now and after any future stage recreation
    bind(stage());
    var origRender = L.canvas.render;
    L.canvas.render = function () {
      bind(L.canvas.getStage());
      origRender.apply(this, arguments);
    };
  };

  /** Wire zoom control buttons in the overlay */
  L.canvas._initZoomControls = function () {
    var btnIn = document.getElementById("btn-zoom-in");
    var btnOut = document.getElementById("btn-zoom-out");
    var btnFit = document.getElementById("btn-zoom-fit");
    if (btnIn)
      btnIn.addEventListener("click", function () {
        L.canvas.zoomIn();
      });
    if (btnOut)
      btnOut.addEventListener("click", function () {
        L.canvas.zoomOut();
      });
    if (btnFit)
      btnFit.addEventListener("click", function () {
        L.canvas.zoomReset();
      });
  };

  /** Toggle before/after view */
  L.canvas.setViewMode = function (mode) {
    L.state._viewMode = mode;
    var btnOriginal = document.getElementById("btn-view-original");
    var btnCleaned = document.getElementById("btn-view-cleaned");
    if (btnOriginal)
      btnOriginal.classList.toggle("active", mode === "original");
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
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA")
        return;
      if (e.key === " " || e.code === "Space") {
        e.preventDefault();
        var page = L.state.getActivePage();
        if (page && page.cleanedImage) {
          L.canvas.setViewMode(
            L.state._viewMode === "original" ? "cleaned" : "original",
          );
        }
      }
    });
  };

  /** Wire view toggle buttons */
  L.canvas._initViewToggle = function () {
    var btnOriginal = document.getElementById("btn-view-original");
    var btnCleaned = document.getElementById("btn-view-cleaned");
    if (btnOriginal) {
      btnOriginal.addEventListener("click", function () {
        L.canvas.setViewMode("original");
      });
    }
    if (btnCleaned) {
      btnCleaned.addEventListener("click", function () {
        L.canvas.setViewMode("cleaned");
      });
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
    L.canvas._initWheelZoom();
    L.canvas._initPanDrag();
    L.canvas._initZoomControls();
  };
})();
