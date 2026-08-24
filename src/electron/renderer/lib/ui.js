/* ── Lumina UI Helpers ── */
var L = window.Lumina;

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
    duration = duration != null ? duration : 4000;
    var container = document.getElementById("toast-container");
    if (!container) {
      container = document.createElement("div");
      container.id = "toast-container";
      container.style.cssText = "position:fixed;top:48px;left:50%;transform:translateX(-50%);z-index:200;display:flex;flex-direction:column;gap:6px;pointer-events:none;";
      document.body.appendChild(container);
    }
    var colors = {
      info:    { bg: "#1a2332", border: "#264f78", text: "#d4d4d4", icon: "#569cd6" },
      warn:    { bg: "#3d2e00", border: "#a07b00", text: "#f0d060", icon: "#dcdcaa" },
      error:   { bg: "#3d1414", border: "#a03030", text: "#f07070", icon: "#f44747" },
      success: { bg: "#1a2e1a", border: "#3a7a3a", text: "#d4d4d4", icon: "#4ec9b0" },
      running: { bg: "#1a2332", border: "#264f78", text: "#d4d4d4", icon: "#569cd6" },
    };
    var c = colors[type] || colors.info;
    var iconNames = {
      info: "info",
      warn: "alert-triangle",
      error: "circle-x",
      success: "circle-check",
      running: "loader-2",
    };
    var spinCSS = type === "running" ? "animation:spin 1s linear infinite;" : "";
    var toast = document.createElement("div");
    toast.style.cssText = "pointer-events:auto;background:" + c.bg + ";border:1px solid " + c.border + ";color:" + c.text + ";padding:8px 16px;border-radius:6px;font-size:0.78rem;display:flex;align-items:center;gap:8px;box-shadow:0 4px 12px rgba(0,0,0,0.4);opacity:0;transform:translateY(-8px);transition:opacity 0.2s,transform 0.2s;white-space:nowrap;max-width:480px;";
    toast.innerHTML = '<i data-lucide="' + iconNames[type] + '" style="width:16px;height:16px;color:' + c.icon + ';flex-shrink:0;' + spinCSS + '"></i><span>' + msg + '</span>';
    container.appendChild(toast);
    if (window.lucide) lucide.createIcons({ nodes: [toast] });
    requestAnimationFrame(function () { toast.style.opacity = "1"; toast.style.transform = "translateY(0)"; });
    var timer = null;
    if (duration > 0) {
      timer = setTimeout(function () {
        toast.style.opacity = "0";
        toast.style.transform = "translateY(-8px)";
        setTimeout(function () { toast.remove(); }, 200);
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
    setTimeout(function () { if (toast.parentNode) toast.remove(); }, 200);
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

  /** Update zoom display */
  updateZoom: function () {
    var el = document.getElementById("status-zoom");
    if (el) el.textContent = Math.round(L.state._zoomLevel * 100) + "%";
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
    // Update status page
    var statusPage = document.getElementById("status-page");
    if (statusPage) {
      statusPage.textContent = page.fileName + " (" + page.naturalWidth + "×" + page.naturalHeight + ")";
    }
  },
};
