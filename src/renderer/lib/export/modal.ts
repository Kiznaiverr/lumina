/* ── Export modal window: build, wire up, close, and export. ── */

import { createIcons } from "../icons";
import * as i18n from "../i18n";
import { ui } from "../ui";
import {
  applyRect,
  bindDrag,
  bindResize,
  clampRect,
  centerRect,
  currentRect,
  type ModalRect,
} from "../modalWindow";
import type { ExportPayload, ExportResult } from "../../../shared/bridge";
import { st, WINDOW_KEY, ZOOM_STEP } from "./state";
import { ensureMaskImages, renderPage } from "./render";
import { fitPreview, positionCanvas, resetZoom, zoomAt } from "./preview";
import {
  buildAddMenu,
  onDocClick,
  renderInfo,
  renderList,
  select,
} from "./list";

function loadExportRect(): ModalRect | null {
  try {
    const raw = localStorage.getItem(WINDOW_KEY);
    if (!raw) return null;
    const r = JSON.parse(raw) as ModalRect;
    if (
      typeof r.x === "number" &&
      typeof r.y === "number" &&
      typeof r.w === "number" &&
      typeof r.h === "number"
    ) {
      return r;
    }
    return null;
  } catch {
    return null;
  }
}

function saveExportRect(): void {
  const modal = document.getElementById("export-modal");
  if (!modal) return;
  try {
    localStorage.setItem(WINDOW_KEY, JSON.stringify(currentRect(modal)));
  } catch {
    /* storage unavailable — ignore */
  }
}

function onWindowResize(): void {
  const modal = document.getElementById("export-modal");
  if (modal) applyRect(modal, clampRect(currentRect(modal)));
}

export function buildModal(): void {
  if (st.overlay) st.overlay.remove();

  const overlay = document.createElement("div");
  overlay.id = "export-overlay";
  overlay.className = "overlay";
  overlay.innerHTML = `
    <div class="card card-raised settings-modal export-modal flex flex-col overflow-hidden" id="export-modal">
      <div class="settings-titlebar flex items-center justify-between px-4 py-3 border-b border-surface-3" id="export-titlebar">
        <h3 class="text-text-primary text-xs font-semibold" data-i18n="export.title">Export</h3>
        <button class="btn p-1" id="btn-export-close"><i data-lucide="x" class="w-3.5 h-3.5"></i></button>
      </div>
      <div class="export-body">
        <div class="export-sidebar">
          <div class="export-list" id="export-list"></div>
          <div class="export-add-wrap">
            <button class="btn export-add-btn" id="btn-export-add">
              <i data-lucide="plus" class="w-3 h-3"></i>
              <span data-i18n="export.add">Add page</span>
            </button>
            <div class="export-add-menu hidden" id="export-add-menu"></div>
          </div>
        </div>
        <div class="export-main">
          <div class="export-preview-bar">
            <span id="export-preview-label"></span>
            <div class="export-preview-right">
              <span class="export-preview-busy hidden" id="export-preview-busy" data-i18n="export.previewBusy">Rendering preview...</span>
              <div class="export-zoom">
                <button class="btn export-zoom-btn" id="btn-export-zoom-out" data-i18n-title="export.zoomOut" title="Zoom out"><i data-lucide="zoom-out" class="w-3 h-3"></i></button>
                <span class="export-zoom-val" id="export-zoom-val" data-i18n-title="export.zoomReset" title="Reset zoom">100%</span>
                <button class="btn export-zoom-btn" id="btn-export-zoom-in" data-i18n-title="export.zoomIn" title="Zoom in"><i data-lucide="zoom-in" class="w-3 h-3"></i></button>
              </div>
            </div>
          </div>
          <div class="export-preview-host" id="export-preview-host">
            <canvas id="export-preview-canvas"></canvas>
            <div class="export-empty hidden" id="export-empty">
              <i data-lucide="image-off" class="w-6 h-6"></i>
              <span data-i18n="export.empty">No pages selected</span>
            </div>
          </div>
        </div>
        <div class="export-info" id="export-info"></div>
      </div>
      <div class="flex items-center justify-between px-4 py-3 border-t border-surface-3">
        <div class="export-controls">
          <div class="export-format" id="export-format">
            <button class="btn export-opt active" data-fmt="png" data-i18n="export.png">PNG</button>
            <button class="btn export-opt" data-fmt="jpg" data-i18n="export.jpg">JPG</button>
          </div>
          <div class="export-quality hidden" id="export-quality">
            <span data-i18n="export.quality">Quality</span>
            <input type="range" id="export-quality-slider" min="10" max="100" step="1" value="92">
            <span class="export-quality-val" id="export-quality-val">92</span>
          </div>
        </div>
        <div class="flex justify-end gap-2">
          <button class="btn" id="btn-export-cancel" data-i18n="export.cancel">Cancel</button>
          <button class="btn primary" id="btn-export-go">
            <span data-i18n="export.export">Export</span><span id="export-go-count"></span>
          </button>
        </div>
      </div>
      <div class="settings-resize-grip" id="export-resize-grip" title="Resize">
        <i data-lucide="grip" class="w-3 h-3"></i>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  st.overlay = overlay;
  // Runtime-built modal — apply translations now (i18n only re-renders on
  // init/language change, which this overlay missed).
  overlay.querySelectorAll("[data-i18n]").forEach(function (el) {
    el.textContent = i18n.t(el.getAttribute("data-i18n") as string);
  });
  overlay
    .querySelectorAll<HTMLElement>("[data-i18n-title]")
    .forEach(function (el) {
      el.title = i18n.t(el.getAttribute("data-i18n-title") as string);
    });
  st.list = document.getElementById("export-list");
  st.previewHost = document.getElementById("export-preview-host");
  st.previewCanvas = document.getElementById(
    "export-preview-canvas",
  ) as HTMLCanvasElement | null;
  st.previewCtx = st.previewCanvas ? st.previewCanvas.getContext("2d") : null;

  // Floating window: restore last size/position, drag via titlebar,
  // resize via corner grip.
  const modal = overlay.querySelector("#export-modal") as HTMLElement;
  const titlebar = overlay.querySelector("#export-titlebar") as HTMLElement;
  const grip = overlay.querySelector("#export-resize-grip") as HTMLElement;
  applyRect(modal, clampRect(loadExportRect() ?? centerRect(940, 620)));
  bindDrag(modal, titlebar, saveExportRect);
  bindResize(modal, grip, saveExportRect);
  window.addEventListener("resize", onWindowResize);

  const host = st.previewHost;
  if (host) {
    host.addEventListener(
      "wheel",
      function (e) {
        e.preventDefault();
        zoomAt(e.clientX, e.clientY, e.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP);
      },
      { passive: false },
    );
    host.addEventListener("dblclick", resetZoom);
    host.addEventListener("pointerdown", function (e) {
      if ((e.target as HTMLElement).closest("button")) return;
      if (!st.previewImg || !st.previewCanvas) return;
      const startX = e.clientX;
      const startY = e.clientY;
      const baseX = st.panX;
      const baseY = st.panY;
      host.setPointerCapture(e.pointerId);
      const onMove = (ev: PointerEvent) => {
        st.panX = baseX + (ev.clientX - startX);
        st.panY = baseY + (ev.clientY - startY);
        positionCanvas();
      };
      const onUp = (ev: PointerEvent) => {
        host.releasePointerCapture(ev.pointerId);
        host.removeEventListener("pointermove", onMove);
        host.removeEventListener("pointerup", onUp);
        host.removeEventListener("pointercancel", onUp);
      };
      host.addEventListener("pointermove", onMove);
      host.addEventListener("pointerup", onUp);
      host.addEventListener("pointercancel", onUp);
    });
  }
  overlay
    .querySelector("#btn-export-zoom-in")
    ?.addEventListener("click", function () {
      if (!st.previewHost) return;
      const r = st.previewHost.getBoundingClientRect();
      zoomAt(r.left + r.width / 2, r.top + r.height / 2, ZOOM_STEP);
    });
  overlay
    .querySelector("#btn-export-zoom-out")
    ?.addEventListener("click", function () {
      if (!st.previewHost) return;
      const r = st.previewHost.getBoundingClientRect();
      zoomAt(r.left + r.width / 2, r.top + r.height / 2, 1 / ZOOM_STEP);
    });
  overlay
    .querySelector("#export-zoom-val")
    ?.addEventListener("click", resetZoom);

  const fmtBtns = overlay.querySelectorAll<HTMLButtonElement>(".export-opt");
  fmtBtns.forEach(function (b) {
    b.addEventListener("click", function () {
      st.format = (b.dataset.fmt as "png" | "jpg") || "png";
      fmtBtns.forEach(function (x) {
        x.classList.toggle("active", x === b);
      });
      const q = document.getElementById("export-quality");
      if (q) q.classList.toggle("hidden", st.format !== "jpg");
      renderInfo();
    });
  });
  const slider = document.getElementById(
    "export-quality-slider",
  ) as HTMLInputElement | null;
  const val = document.getElementById("export-quality-val");
  if (slider) {
    slider.addEventListener("input", function () {
      st.quality = Number(slider.value);
      if (val) val.textContent = slider.value;
      renderInfo();
    });
  }

  overlay.querySelector("#btn-export-close")?.addEventListener("click", close);
  overlay.querySelector("#btn-export-cancel")?.addEventListener("click", close);
  overlay
    .querySelector("#btn-export-go")
    ?.addEventListener("click", function () {
      const btn = document.getElementById("btn-export-go") as HTMLButtonElement;
      doExport(btn);
    });
  overlay
    .querySelector("#btn-export-add")
    ?.addEventListener("click", function () {
      const menu = document.getElementById("export-add-menu");
      if (!menu) return;
      buildAddMenu();
      menu.classList.toggle("hidden");
    });
  overlay.addEventListener("click", function (e) {
    if (e.target === overlay) close();
  });
  document.addEventListener("click", onDocClick);

  if (st.previewHost && st.previewCanvas) {
    st.ro = new ResizeObserver(fitPreview);
    st.ro.observe(st.previewHost);
  }

  renderList();
  select(st.selIdx);
  overlay.classList.add("show");
  createIcons();
}

function close(): void {
  st.previewVersion++; // cancel in-flight preview
  if (st.ro) {
    st.ro.disconnect();
    st.ro = null;
  }
  document.removeEventListener("click", onDocClick);
  window.removeEventListener("resize", onWindowResize);
  if (st.overlay) {
    st.overlay.remove();
    st.overlay = null;
  }
  st.list = null;
  st.previewHost = null;
  st.previewCanvas = null;
  st.previewCtx = null;
  st.previewImg = null;
  st.order = [];
  st.selIdx = 0;
  st.dragIdx = null;
  st.zoom = 1;
  st.panX = 0;
  st.panY = 0;
}

async function doExport(goBtn: HTMLButtonElement): Promise<void> {
  goBtn.disabled = true;
  const toast = ui.toast(i18n.t("export.running"), "running", 0);
  try {
    await document.fonts.ready;
    const files: ExportPayload["files"] = [];
    for (const page of st.order) {
      await ensureMaskImages(page);
      const data = await renderPage(page, st.format, st.quality);
      files.push({ fileName: page.fileName, data });
    }
    const res: ExportResult = await window.lumina.exportImages({
      format: st.format,
      quality: st.quality,
      files,
    });
    ui.dismissToast(toast);
    if (!res.canceled) {
      ui.toast(i18n.t("export.done", { count: res.count }), "success");
    }
    close();
  } catch (err) {
    ui.dismissToast(toast);
    const msg = err instanceof Error ? err.message : String(err);
    ui.toast(i18n.t("export.error") + (msg ? ": " + msg : ""), "error");
    goBtn.disabled = st.order.length === 0;
  }
}
