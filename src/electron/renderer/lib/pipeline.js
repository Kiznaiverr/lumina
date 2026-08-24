/* ── Lumina Pipeline — Detection Only ── */
var L = window.Lumina;

L.pipeline = {
  /** Run detection on active page */
  runDetection: async function () {
    var page = L.state.getActivePage();
    if (L.state.isRunning || !page) return;
    L.state.isRunning = true;

    var btn = document.getElementById("btn-detect");
    if (btn) { btn.disabled = true; }

    var isFirstRun = !L.state._modelLoaded;
    var loadingToast = null;
    if (isFirstRun) {
      loadingToast = L.ui.toast(L.i18n.t("toast.detectFirstRun"), "running", 0);
    } else {
      loadingToast = L.ui.toast(L.i18n.t("toast.detectRunning"), "running", 0);
    }

    try {
      var result = await window.lumina.apiPost("/detect", {
        imagePath: page.filePath,
      });
      if (!result || result.error)
        throw new Error(result?.detail || "Detection failed");

      page.textDetections = (result.textDetections || []).map(function (d, i) {
        return {
          id: "text-" + i,
          bbox: Object.assign({}, d.bbox),
          type: d.type,
          confidence: d.confidence || 0,
          status: "auto",
        };
      });

      page.bubbleDetections = (result.bubbleDetections || []).map(function (d, i) {
        return {
          id: "bubble-" + i,
          bbox: Object.assign({}, d.bbox),
          confidence: d.confidence || 0,
          status: "auto",
        };
      });

      page._selectedTextIdx = null;
      page._selectedBubbleIdx = null;

      L.canvas._clearGroups();
      L.canvas.render();
      L.sidebar.render();

      L.state._modelLoaded = true;
      L.history.snapshot();
      L.ui.dismissToast(loadingToast);
      L.ui.toast(L.i18n.t("toast.detectDone", { texts: page.textDetections.length, bubbles: page.bubbleDetections.length }), "success", 3000);
    } catch (err) {
      console.error("Detection error:", err);
      L.ui.dismissToast(loadingToast);
      L.ui.toast(err.message || L.i18n.t("toast.detectFailed"), "error", 4000);
    } finally {
      L.state.isRunning = false;
      var btn = document.getElementById("btn-detect");
      if (btn) btn.disabled = false;
    }
  },

  /** Run detection on ALL pages */
  runDetectionAll: async function () {
    if (L.state.isRunning || L.state.pages.length === 0) return;
    L.state.isRunning = true;

    for (var i = 0; i < L.state.pages.length; i++) {
      var page = L.state.pages[i];
      if (!page.filePath) continue;
      try {
        var result = await window.lumina.apiPost("/detect", {
          imagePath: page.filePath,
        });
        if (!result || result.error) continue;

        page.textDetections = (result.textDetections || []).map(function (d, j) {
          return {
            id: "text-" + j,
            bbox: Object.assign({}, d.bbox),
            type: d.type,
            confidence: d.confidence || 0,
            status: "auto",
          };
        });
        page.bubbleDetections = (result.bubbleDetections || []).map(function (d, j) {
          return {
            id: "bubble-" + j,
            bbox: Object.assign({}, d.bbox),
            confidence: d.confidence || 0,
            status: "auto",
          };
        });
      } catch (err) {
        console.error("Detection error page " + (i + 1) + ":", err);
      }
    }

    L.state.isRunning = false;
    L.canvas._clearGroups();
    L.canvas.render();
    L.canvas.renderPageStrip();
    L.sidebar.render();
  },
};

