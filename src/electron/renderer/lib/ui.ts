/* ── Lumina UI Helpers ── */
import { state } from "./state";
import * as i18n from "./i18n";
import { canvas } from "./canvas/index";
import { createIcons } from "./icons";

type ToastType = "info" | "warn" | "error" | "success" | "running";

interface ToastEl extends HTMLDivElement {
  _timer?: ReturnType<typeof setTimeout> | null;
}

/** Format bytes as human-readable size */
function _fmtSize(bytes: number): string {
  if (!bytes || bytes <= 0) return "";
  if (bytes >= 1024 * 1024 * 1024)
    return (bytes / (1024 * 1024 * 1024)).toFixed(1) + " GB";
  if (bytes >= 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  return Math.round(bytes / 1024) + " KB";
}

export const ui = {
  showProgress(show: boolean): void {
    const el = document.getElementById("progress-overlay");
    if (el) el.classList.toggle("show", show);
  },
  setActive(id: string): void {
    const el = document.getElementById(id);
    if (el) el.className = "step active";
  },
  setDone(id: string): void {
    const el = document.getElementById(id);
    if (el) el.className = "step done";
  },

  /** Show detection step in progress overlay */
  showStep(id: string): void {
    ui.showProgress(true);
    ui.setActive(id);
  },

  /** Show toast notification — returns element for manual dismiss */
  toast(msg: string, type?: ToastType, duration?: number): ToastEl {
    type = type || "info"; // info | warn | error | success | running
    if (duration == null) duration = type === "error" ? 10000 : 4000;
    let container = document.getElementById("toast-container");
    if (!container) {
      container = document.createElement("div");
      container.id = "toast-container";
      container.style.cssText =
        "position:fixed;top:48px;left:50%;transform:translateX(-50%);z-index:200;display:flex;flex-direction:column;gap:6px;pointer-events:none;";
      document.body.appendChild(container);
    }
    const colors: Record<
      ToastType,
      { bg: string; border: string; text: string; icon: string }
    > = {
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
    const c = colors[type] || colors.info;
    const iconNames: Record<ToastType, string> = {
      info: "info",
      warn: "alert-triangle",
      error: "circle-x",
      success: "circle-check",
      running: "loader-2",
    };
    const spinCSS =
      type === "running" ? "animation:spin 1s linear infinite;" : "";
    const toast = document.createElement("div") as ToastEl;
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
      const copyBtn = document.createElement("button");
      copyBtn.innerHTML =
        '<i data-lucide="copy" style="width:14px;height:14px;"></i>';
      copyBtn.title = "Copy pesan error";
      copyBtn.style.cssText =
        "flex-shrink:0;background:transparent;border:none;color:" +
        c.text +
        ";cursor:pointer;padding:2px;display:flex;align-items:center;opacity:0.7;";
      copyBtn.addEventListener("mouseenter", () => {
        copyBtn.style.opacity = "1";
      });
      copyBtn.addEventListener("mouseleave", () => {
        copyBtn.style.opacity = "0.7";
      });
      copyBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        const text = toast.querySelector("span")?.textContent || msg;
        if (navigator.clipboard) {
          navigator.clipboard.writeText(text).then(() => {
            copyBtn.innerHTML =
              '<i data-lucide="check" style="width:14px;height:14px;color:#4ec9b0;"></i>';
            createIcons({ nameAttr: "data-lucide", attrs: {}, root: copyBtn });
            setTimeout(() => {
              copyBtn.innerHTML =
                '<i data-lucide="copy" style="width:14px;height:14px;"></i>';
              createIcons({
                nameAttr: "data-lucide",
                attrs: {},
                root: copyBtn,
              });
            }, 1500);
          });
        }
      });
      toast.appendChild(copyBtn);
    }
    container.appendChild(toast);
    createIcons({ nameAttr: "data-lucide", attrs: {}, root: toast });
    requestAnimationFrame(() => {
      toast.style.opacity = "1";
      toast.style.transform = "translateY(0)";
    });
    let timer: ReturnType<typeof setTimeout> | null = null;
    if (duration > 0) {
      timer = setTimeout(() => {
        toast.style.opacity = "0";
        toast.style.transform = "translateY(-8px)";
        setTimeout(() => {
          toast.remove();
        }, 200);
      }, duration);
    }
    toast._timer = timer;
    return toast;
  },

  /** Dismiss a specific toast */
  dismissToast(toast: ToastEl | null): void {
    if (!toast) return;
    if (toast._timer) clearTimeout(toast._timer);
    toast.style.opacity = "0";
    toast.style.transform = "translateY(-8px)";
    setTimeout(() => {
      if (toast.parentNode) toast.remove();
    }, 200);
  },

  /** Bottom-right download notification with progress bar.
   *  Returns element; update via updateDownloadToast(). */
  downloadToast(msg: string): HTMLElement {
    // Remove stale download toast if any
    const old = document.getElementById("dl-toast");
    if (old) old.remove();

    let container = document.getElementById("toast-container-br");
    if (!container) {
      container = document.createElement("div");
      container.id = "toast-container-br";
      container.style.cssText =
        "position:fixed;bottom:16px;right:16px;z-index:200;display:flex;flex-direction:column;gap:6px;pointer-events:none;";
      document.body.appendChild(container);
    }

    const el = document.createElement("div");
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
    createIcons({ nameAttr: "data-lucide", attrs: {}, root: el });
    requestAnimationFrame(() => {
      el.style.opacity = "1";
      el.style.transform = "translateY(0)";
    });
    return el;
  },

  /** Update the active download toast progress */
  updateDownloadToast(
    progress: number,
    downloaded: number,
    total: number,
  ): void {
    const el = document.getElementById("dl-toast");
    if (!el) return;
    const pctEl = document.getElementById("dl-pct");
    const barEl = document.getElementById("dl-bar");
    const sizeEl = document.getElementById("dl-size");
    if (pctEl) pctEl.textContent = Math.round(progress || 0) + "%";
    if (barEl) barEl.style.width = Math.min(100, progress || 0) + "%";
    if (sizeEl && total > 0) {
      sizeEl.textContent = _fmtSize(downloaded) + " / " + _fmtSize(total);
    }
  },

  /** Show error in status bar */
  showError(msg: string): void {
    const el = document.getElementById("status-detections");
    if (el) {
      const orig = el.textContent;
      el.textContent = i18n.t("error.prefix", { message: msg });
      el.classList.add("text-red-500");
      setTimeout(() => {
        el.textContent = orig;
        el.classList.remove("text-red-500");
      }, 4000);
    }
  },

  /** Re-render canvas on window resize */
  initResize(): void {
    window.addEventListener("resize", () => {
      if (canvas.getStage()) {
        if (state._resizeTimer) clearTimeout(state._resizeTimer);
        state._resizeTimer = setTimeout(() => {
          canvas.render();
        }, 150);
      }
    });
  },

  /** Update zoom display (status bar + overlay control).
   *  Zoom 1 = "fit", so show actual % relative to 100% = natural size. */
  updateZoom(): void {
    const fitRatio = canvas.getBaseScaleRatio();
    const pct = Math.round((state._zoomLevel || 1) * fitRatio * 100) + "%";
    const el = document.getElementById("status-zoom");
    if (el) el.textContent = pct;
    const val = document.getElementById("zoom-value");
    if (val) val.textContent = pct;
  },

  /** Update page indicator */
  updatePageIndicator(): void {
    const el = document.getElementById("page-indicator");
    const page = state.getActivePage();
    if (!page) {
      if (el) el.classList.add("hidden");
      return;
    }
    const total = state.pages.length;
    const idx = (state.activePageIdx as number) + 1;
    if (el) {
      el.textContent = idx + " / " + total;
      el.classList.toggle("hidden", total <= 1);
    }
    // Zoom controls visible when a page is loaded
    const zoomCtl = document.getElementById("zoom-controls");
    if (zoomCtl) zoomCtl.classList.remove("hidden");
    // Update status page
    const statusPage = document.getElementById("status-page");
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
