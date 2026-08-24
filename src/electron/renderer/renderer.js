/* ── Lumina Renderer Entry Point ── */
(function () {
  "use strict";
  var L = window.Lumina;

  var landing = document.getElementById("landing");

  // ── Model check on startup──
  async function ensureModel() {
    var toast = L.ui.toast(L.i18n.t("progress.checking"), "running", 0);
    try {
      var res = await window.lumina.checkModel();
      if (res && res.cached) {
        L.ui.dismissToast(toast);
        return;
      }
    } catch (e) {
      /* backend still starting */
    }

    L.ui.dismissToast(toast);

    // Download toast with progress bar (bottom-right notification)
    var dlToast = L.ui.downloadToast(L.i18n.t("progress.downloading"));
    try {
      await window.lumina.downloadModel();
      L.ui.dismissToast(dlToast);
      L.ui.toast(L.i18n.t("progress.downloaded"), "success", 3000);
    } catch (e) {
      L.ui.dismissToast(dlToast);
      L.ui.toast(
        L.i18n.t("progress.downloadFailed", { error: e.message }),
        "error",
        5000,
      );
    }
  }

  // Live progress updates from main process polling
  if (window.lumina.onDownloadProgress) {
    window.lumina.onDownloadProgress(function (p) {
      L.ui.updateDownloadToast(p.progress, p.downloaded, p.total);
    });
  }

  // ── Load single image → create page ──
  function _loadImageAsPage(filePath) {
    return new Promise(function (resolve) {
      var img = new Image();
      img.onload = function () {
        var page = {
          filePath: filePath,
          fileName: filePath.split(/[/\\]/).pop(),
          image: img,
          naturalWidth: img.naturalWidth,
          naturalHeight: img.naturalHeight,
          textDetections: [],
          bubbleDetections: [],
          cleanedImage: null,
          _selectedTextIdx: null,
          _selectedBubbleIdx: null,
        };
        resolve(page);
      };
      img.onerror = function () {
        resolve(null);
      };
      img.src = filePath;
    });
  }

  // ── Import: single or multi ──
  async function importImages() {
    // Try multi-file import first
    var filePaths;
    try {
      filePaths = await window.lumina.importImages();
    } catch (e) {
      // Fallback: single file
      var single = await window.lumina.importImage();
      if (!single) return;
      filePaths = [single];
    }

    if (!filePaths || filePaths.length === 0) return;

    for (var i = 0; i < filePaths.length; i++) {
      var page = await _loadImageAsPage(filePaths[i]);
      if (page) {
        L.state.addPage(page);
      }
    }

    // Set active to first if none selected
    if (L.state.activePageIdx === null && L.state.pages.length > 0) {
      L.state.setActivePage(0);
    }

    landing.style.display = "none";
    document.getElementById("btn-detect").disabled = false;

    L.canvas._clearGroups();
    L.canvas.render();
    L.canvas.renderPageStrip();
    L.ui.updatePageIndicator();
    L.canvas.updateViewToggle();
    L.sidebar.render();
    L.history.reset();
  }

  // ── Init modules ──
  L.i18n.init().then(function () {
    // ── Wire buttons ──
    document
      .getElementById("btn-import-landing")
      .addEventListener("click", importImages);
    document
      .getElementById("btn-import")
      .addEventListener("click", importImages);
    document
      .getElementById("btn-detect")
      .addEventListener("click", function () {
        L.pipeline.runDetection();
      });

    // ── Undo / Redo buttons ──
    document.getElementById("btn-undo").addEventListener("click", function () {
      L.history.undo();
    });
    document.getElementById("btn-redo").addEventListener("click", function () {
      L.history.redo();
    });

    // ── Settings modal ──
    L.shortcuts.init();
    L.shortcuts.bindGlobal();
    L.shortcuts.bindSettingsUI();
    document
      .getElementById("btn-settings")
      .addEventListener("click", function () {
        L.shortcuts.openSettings();
      });
    document
      .getElementById("btn-settings-close")
      .addEventListener("click", function () {
        L.shortcuts.closeSettings();
      });
    document
      .getElementById("btn-settings-done")
      .addEventListener("click", function () {
        L.shortcuts.closeSettings();
      });
    document
      .getElementById("btn-shortcuts-reset-all")
      .addEventListener("click", function () {
        L.shortcuts.resetAll();
        L.shortcuts.openSettings(); // re-render list with defaults
      });
    // Click outside modal closes it
    document
      .getElementById("settings-overlay")
      .addEventListener("click", function (e) {
        if (e.target === this) L.shortcuts.closeSettings();
      });

    // ── Expose for page strip "+" button ──
    L.renderer = { importImages: importImages };

    L.tools.init();
    L.ui.initResize();
    L.canvas.initBindings();
    L.sidebar.render();

    if (window.lucide) lucide.createIcons();

    // ── Load system fonts via IPC ──
    if (window.lumina.getFonts) {
      window.lumina
        .getFonts()
        .then(function (fonts) {
          L.state.fontList = fonts || [];
        })
        .catch(function () {});
    }

    // ── Model check on startup ──
    setTimeout(ensureModel, 1500);
  });

  // ── Language picker (globe + dropdown) ──
  document.getElementById("btn-lang").addEventListener("click", function (e) {
    e.stopPropagation();
    var dd = document.getElementById("lang-dropdown");
    if (dd) dd.classList.toggle("hidden");
  });
  document.querySelectorAll(".lang-opt").forEach(function (opt) {
    opt.addEventListener("click", function () {
      L.i18n.setLang(this.dataset.lang);
      L.sidebar.render();
      L.canvas._updateStatus();
      if (L.shortcuts && L.shortcuts._updateHeaderTitles)
        L.shortcuts._updateHeaderTitles();
    });
  });
  document.addEventListener("click", function () {
    var dd = document.getElementById("lang-dropdown");
    if (dd) dd.classList.add("hidden");
  });
})();
