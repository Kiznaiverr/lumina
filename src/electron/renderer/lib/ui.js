/* ── Lumina UI Helpers ── */
var L = window.Lumina;

/** Format bytes as human-readable size */
function _fmtSize(bytes) {
  if (!bytes || bytes <= 0) return "";
  if (bytes >= 1024 * 1024 * 1024)
    return (bytes / (1024 * 1024 * 1024)).toFixed(1) + " GB";
  if (bytes >= 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  return Math.round(bytes / 1024) + " KB";
}

L.ui = {
  showProgress: function (show) {
    var el = document.getElementById("progress-overlay");
    if (el) el.classList.toggle("show", show);
  },
  setActive: function (id) {
    var el = document.getElementById(id);
    if (el) el.className = "step active";
  },
  setDone: function (id) {
    var el = document.getElementById(id);
    if (el) el.className = "step done";
  },

  /** Show detection step in progress overlay */
  showStep: function (id) {
    L.ui.showProgress(true);
    L.ui.setActive(id);
  },

  /** Show toast notification — returns element for manual dismiss */
  toast: function (msg, type, duration) {
    type = type || "info"; // info | warn | error | success | running
    if (duration == null) duration = type === "error" ? 10000 : 4000;
    var container = document.getElementById("toast-container");
    if (!container) {
      container = document.createElement("div");
      container.id = "toast-container";
      container.style.cssText =
        "position:fixed;top:48px;left:50%;transform:translateX(-50%);z-index:200;display:flex;flex-direction:column;gap:6px;pointer-events:none;";
      document.body.appendChild(container);
    }
    var colors = {
      info: {
        bg: "#1a2332",
        border: "#264f78",
        text: "#d4d4d4",
        icon: "#569cd6",
      },
      warn: {
        bg: "#3d2e00",
        border: "#a07b00",
        text: "#f0d060",
        icon: "#dcdcaa",
      },
      error: {
        bg: "#3d1414",
        border: "#a03030",
        text: "#f07070",
        icon: "#f44747",
      },
      success: {
        bg: "#1a2e1a",
        border: "#3a7a3a",
        text: "#d4d4d4",
        icon: "#4ec9b0",
      },
      running: {
        bg: "#1a2332",
        border: "#264f78",
        text: "#d4d4d4",
        icon: "#569cd6",
      },
    };
    var c = colors[type] || colors.info;
    var iconNames = {
      info: "info",
      warn: "alert-triangle",
      error: "circle-x",
      success: "circle-check",
      running: "loader-2",
    };
    var spinCSS =
      type === "running" ? "animation:spin 1s linear infinite;" : "";
    var toast = document.createElement("div");
    toast.style.cssText =
      "pointer-events:auto;background:" +
      c.bg +
      ";border:1px solid " +
      c.border +
      ";color:" +
      c.text +
      ";padding:8px 16px;border-radius:6px;font-size:0.78rem;display:flex;align-items:center;gap:8px;box-shadow:0 4px 12px rgba(0,0,0,0.4);opacity:0;transform:translateY(-8px);transition:opacity 0.2s,transform 0.2s;white-space:normal;word-break:break-word;max-width:480px;user-select:text;cursor:" +
      (type === "error" ? "pointer" : "default") +
      ";";
    toast.innerHTML =
      '<i data-lucide="' +
      iconNames[type] +
      '" style="width:16px;height:16px;color:' +
      c.icon +
      ";flex-shrink:0;" +
      spinCSS +
      '"></i><span>' +
      msg +
      "</span>";
    // Error toast: explicit copy button
    if (type === "error") {
      var copyBtn = document.createElement("button");
      copyBtn.innerHTML =
        '<i data-lucide="copy" style="width:14px;height:14px;"></i>';
      copyBtn.title = "Copy pesan error";
      copyBtn.style.cssText =
        "flex-shrink:0;background:transparent;border:none;color:" +
        c.text +
        ";cursor:pointer;padding:2px;display:flex;align-items:center;opacity:0.7;";
      copyBtn.addEventListener("mouseenter", function () {
        copyBtn.style.opacity = "1";
      });
      copyBtn.addEventListener("mouseleave", function () {
        copyBtn.style.opacity = "0.7";
      });
      copyBtn.addEventListener("click", function (e) {
        e.stopPropagation();
        var text = toast.querySelector("span")?.textContent || msg;
        if (navigator.clipboard) {
          navigator.clipboard.writeText(text).then(function () {
            copyBtn.innerHTML =
              '<i data-lucide="check" style="width:14px;height:14px;color:#4ec9b0;"></i>';
            if (window.lucide) lucide.createIcons({ nodes: [copyBtn] });
            setTimeout(function () {
              copyBtn.innerHTML =
                '<i data-lucide="copy" style="width:14px;height:14px;"></i>';
              if (window.lucide) lucide.createIcons({ nodes: [copyBtn] });
            }, 1500);
          });
        }
      });
      toast.appendChild(copyBtn);
    }
    container.appendChild(toast);
    if (window.lucide) lucide.createIcons({ nodes: [toast] });
    requestAnimationFrame(function () {
      toast.style.opacity = "1";
      toast.style.transform = "translateY(0)";
    });
    var timer = null;
    if (duration > 0) {
      timer = setTimeout(function () {
        toast.style.opacity = "0";
        toast.style.transform = "translateY(-8px)";
        setTimeout(function () {
          toast.remove();
        }, 200);
      }, duration);
    }
    toast._timer = timer;
    return toast;
  },

  /** Dismiss a specific toast */
  dismissToast: function (toast) {
    if (!toast) return;
    if (toast._timer) clearTimeout(toast._timer);
    toast.style.opacity = "0";
    toast.style.transform = "translateY(-8px)";
    setTimeout(function () {
      if (toast.parentNode) toast.remove();
    }, 200);
  },

  /** Bottom-right download notification with progress bar.
   *  Returns element; update via updateDownloadToast(). */
  downloadToast: function (msg) {
    // Remove stale download toast if any
    var old = document.getElementById("dl-toast");
    if (old) old.remove();

    var container = document.getElementById("toast-container-br");
    if (!container) {
      container = document.createElement("div");
      container.id = "toast-container-br";
      container.style.cssText =
        "position:fixed;bottom:16px;right:16px;z-index:200;display:flex;flex-direction:column;gap:6px;pointer-events:none;";
      document.body.appendChild(container);
    }

    var el = document.createElement("div");
    el.id = "dl-toast";
    el.style.cssText =
      "pointer-events:auto;background:#1a2332;border:1px solid #264f78;color:#d4d4d4;" +
      "padding:10px 14px;border-radius:8px;font-size:0.78rem;width:280px;" +
      "box-shadow:0 4px 12px rgba(0,0,0,0.4);opacity:0;transform:translateY(8px);" +
      "transition:opacity 0.2s,transform 0.2s;";
    el.innerHTML =
      '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">' +
      '<i data-lucide="loader-2" style="width:15px;height:15px;color:#569cd6;flex-shrink:0;animation:spin 1s linear infinite;"></i>' +
      '<span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' +
      msg +
      "</span>" +
      '<span id="dl-pct" style="color:#569cd6;font-variant-numeric:tabular-nums;">0%</span>' +
      "</div>" +
      '<div style="height:5px;background:rgba(255,255,255,0.08);border-radius:3px;overflow:hidden;">' +
      '<div id="dl-bar" style="height:100%;width:0%;background:#569cd6;border-radius:3px;transition:width 0.3s ease;"></div>' +
      "</div>" +
      '<div id="dl-size" style="margin-top:5px;font-size:0.68rem;color:#888;"></div>';
    container.appendChild(el);
    if (window.lucide) lucide.createIcons({ nodes: [el] });
    requestAnimationFrame(function () {
      el.style.opacity = "1";
      el.style.transform = "translateY(0)";
    });
    return el;
  },

  /** Update the active download toast progress */
  updateDownloadToast: function (progress, downloaded, total) {
    var el = document.getElementById("dl-toast");
    if (!el) return;
    var pctEl = document.getElementById("dl-pct");
    var barEl = document.getElementById("dl-bar");
    var sizeEl = document.getElementById("dl-size");
    if (pctEl) pctEl.textContent = Math.round(progress || 0) + "%";
    if (barEl) barEl.style.width = Math.min(100, progress || 0) + "%";
    if (sizeEl && total > 0) {
      sizeEl.textContent = _fmtSize(downloaded) + " / " + _fmtSize(total);
    }
  },

  /** Show error in status bar */
  showError: function (msg) {
    var el = document.getElementById("status-detections");
    if (el) {
      var orig = el.textContent;
      el.textContent = L.i18n.t("error.prefix", { message: msg });
      el.classList.add("text-red-500");
      setTimeout(function () {
        el.textContent = orig;
        el.classList.remove("text-red-500");
      }, 4000);
    }
  },

  /** Re-render canvas on window resize */
  initResize: function () {
    window.addEventListener("resize", function () {
      if (L.canvas && L.canvas.getStage()) {
        clearTimeout(L.state._resizeTimer);
        L.state._resizeTimer = setTimeout(function () {
          L.canvas.render();
        }, 150);
      }
    });
  },

  /** Update zoom display (status bar + overlay control).
   *  Zoom 1 = "fit", so show actual % relative to 100% = natural size. */
  updateZoom: function () {
    var fitRatio =
      (L.canvas.getBaseScaleRatio && L.canvas.getBaseScaleRatio()) || 1;
    var pct = Math.round((L.state._zoomLevel || 1) * fitRatio * 100) + "%";
    var el = document.getElementById("status-zoom");
    if (el) el.textContent = pct;
    var val = document.getElementById("zoom-value");
    if (val) val.textContent = pct;
  },

  /** Update page indicator */
  updatePageIndicator: function () {
    var el = document.getElementById("page-indicator");
    var page = L.state.getActivePage();
    if (!page) {
      if (el) el.classList.add("hidden");
      return;
    }
    var total = L.state.pages.length;
    var idx = L.state.activePageIdx + 1;
    if (el) {
      el.textContent = idx + " / " + total;
      el.classList.toggle("hidden", total <= 1);
    }
    // Zoom controls visible when a page is loaded
    var zoomCtl = document.getElementById("zoom-controls");
    if (zoomCtl) zoomCtl.classList.remove("hidden");
    // Update status page
    var statusPage = document.getElementById("status-page");
    if (statusPage) {
      statusPage.textContent =
        page.fileName +
        " (" +
        page.naturalWidth +
        "×" +
        page.naturalHeight +
        ")";
    }
  },
};
