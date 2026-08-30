/* ── Lumina Export — modal window + offscreen 1:1 page rendering ──
 * Three-pane layout: thumbnail sidebar (add/remove/reorder), accurate
 * preview, and page info. Reordering pages here changes only the export
 * order, never state.pages. open() starts with the active page only;
 * openAll() starts with every page.
 */
import Konva from "konva";
import { state } from "./state";
import { canvas } from "./canvas/index";
import { makeNode } from "./canvas/textool/nodeFactory";
import { createIcons } from "./icons";
import { esc } from "./sidebar/_esc";
import * as i18n from "./i18n";
import { ui } from "./ui";
import type { Page } from "../types";
import type { ExportPayload, ExportResult } from "../../shared/bridge";

/* ── helpers ── */

function fileUrl(p: string): string {
  let norm = p.replace(/\\/g, "/");
  if (!norm.startsWith("/")) norm = "/" + norm;
  return "file://" + encodeURI(norm).replace(/#/g, "%23").replace(/\?/g, "%3F");
}

function loadImage(p: string): Promise<HTMLImageElement> {
  return new Promise(function (resolve, reject) {
    const img = new Image();
    img.onload = function () {
      resolve(img);
    };
    img.onerror = function () {
      reject(new Error("Failed to load image: " + p));
    };
    img.src = fileUrl(p);
  });
}

/** Saved projects don't carry the decoded mask images — reload them. */
async function ensureMaskImages(page: Page): Promise<void> {
  for (const m of page.inpaintMasks) {
    if (m.image) continue;
    try {
      m.image = await loadImage(m.imagePath);
    } catch {
      m.image = undefined; // skip silently — nothing to composite anyway
    }
  }
}

function dataUrlToBytes(dataUrl: string): Uint8Array {
  const bin = atob(dataUrl.split(",")[1]);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return arr;
}

function fmtBytes(b: number): string {
  if (b >= 1024 * 1024 * 1024)
    return (b / (1024 * 1024 * 1024)).toFixed(2) + " GB";
  if (b >= 1024 * 1024) return (b / (1024 * 1024)).toFixed(1) + " MB";
  return Math.max(1, Math.round(b / 1024)) + " KB";
}

function estSize(page: Page): string {
  const px = page.naturalWidth * page.naturalHeight;
  const bytes =
    _format === "png" ? px * 2 : px * 3 * (0.08 + (_quality / 100) * 0.25);
  return fmtBytes(bytes);
}

/** Composite one page at natural 1:1 into an offscreen canvas.
 * Mirrors canvas render order: background → inpaint masks → text layers. */
async function renderPageToCanvas(page: Page): Promise<HTMLCanvasElement> {
  const host = document.createElement("div");
  host.style.cssText =
    "position:fixed;left:-10000px;top:0;width:1px;height:1px;overflow:hidden;";
  document.body.appendChild(host);
  const stage = new Konva.Stage({
    container: host,
    width: page.naturalWidth,
    height: page.naturalHeight,
  });
  const layer = new Konva.Layer();
  stage.add(layer);

  if (page.backgroundVisible !== false) {
    layer.add(
      new Konva.Image({
        image: page.image,
        x: 0,
        y: 0,
        width: page.naturalWidth,
        height: page.naturalHeight,
      }),
    );
  }

  for (const m of page.inpaintMasks) {
    if (!m.visible || !m.image) continue;
    layer.add(
      new Konva.Image({
        image: m.image,
        x: m.bbox.x,
        y: m.bbox.y,
        width: m.bbox.w,
        height: m.bbox.h,
        opacity: m.opacity,
      }),
    );
  }

  // makeNode()/imgToStage() read the live screen scale/offset — pin them to
  // natural space (sr=1, offset 0) so text lands pixel-identical to the editor.
  const origSr = canvas.getScaleRatio;
  const origOff = canvas.getOffset;
  canvas.getScaleRatio = function () {
    return 1;
  };
  canvas.getOffset = function () {
    return { x: 0, y: 0 };
  };
  try {
    for (const lay of page.layers) {
      if (!lay.visible) continue;
      // Dialogue text only renders after inpainting — same rule as the editor.
      if (lay.type === "text-dialogue" && page.inpaintMasks.length === 0) {
        continue;
      }
      const text = lay.translation || lay.source || "";
      if (!text) continue;
      layer.add(makeNode(lay, text));
    }
  } finally {
    canvas.getScaleRatio = origSr;
    canvas.getOffset = origOff;
  }
  layer.draw();

  const out = stage.toCanvas();
  stage.destroy();
  host.remove();
  return out;
}

/** Encode one rendered page as PNG or JPEG bytes. */
async function renderPage(
  page: Page,
  format: "png" | "jpg",
  quality: number,
): Promise<Uint8Array> {
  const c = await renderPageToCanvas(page);
  if (format === "png") {
    return dataUrlToBytes(c.toDataURL("image/png"));
  }
  // JPEG has no alpha — composite over white like a flattened export.
  const jc = document.createElement("canvas");
  jc.width = page.naturalWidth;
  jc.height = page.naturalHeight;
  const ctx = jc.getContext("2d") as CanvasRenderingContext2D;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, jc.width, jc.height);
  ctx.drawImage(c, 0, 0);
  return dataUrlToBytes(jc.toDataURL("image/jpeg", quality / 100));
}

/* ── modal state ── */

let _order: Page[] = [];
let _format: "png" | "jpg" = "png";
let _quality = 92;
let _overlay: HTMLElement | null = null;
let _list: HTMLElement | null = null;
let _selIdx = 0;
let _dragIdx: number | null = null;
let _previewHost: HTMLElement | null = null;
let _previewCanvas: HTMLCanvasElement | null = null;
let _previewCtx: CanvasRenderingContext2D | null = null;
let _previewImg: HTMLCanvasElement | null = null;
let _previewVersion = 0;
let _ro: ResizeObserver | null = null;

function clearDropIndicators(): void {
  _list
    ?.querySelectorAll(".export-row.drop-before, .export-row.drop-after")
    .forEach(function (r) {
      r.classList.remove("drop-before", "drop-after");
    });
}

function updateFooter(): void {
  const count = document.getElementById("export-go-count");
  if (count)
    count.textContent = _order.length ? " (" + _order.length + ")" : "";
  const go = document.getElementById(
    "btn-export-go",
  ) as HTMLButtonElement | null;
  if (go) go.disabled = _order.length === 0;
}

function updateLabel(): void {
  const label = document.getElementById("export-preview-label");
  if (!label) return;
  const page = _order[_selIdx];
  label.innerHTML = page
    ? "<strong>" +
      esc(
        i18n.t("export.pageOf", {
          index: _selIdx + 1,
          total: _order.length,
        }),
      ) +
      '</strong><span class="export-label-name"> · ' +
      esc(page.fileName) +
      "</span>"
    : "";
}

function renderInfo(): void {
  const info = document.getElementById("export-info");
  if (!info) return;
  const page = _order[_selIdx];
  if (!page) {
    info.innerHTML = "";
    return;
  }
  const maskVis = page.inpaintMasks.filter(function (m) {
    return m.visible;
  }).length;
  const layerVis = page.layers.filter(function (l) {
    return l.visible;
  }).length;
  const fmt = _format === "png" ? "PNG" : "JPG (q" + _quality + ")";
  info.innerHTML =
    '<h4 class="export-info-title">' +
    esc(i18n.t("export.info")) +
    "</h4>" +
    '<div class="export-info-row"><span class="k">' +
    esc(i18n.t("export.fileName")) +
    '</span><span class="v">' +
    esc(page.fileName) +
    "</span></div>" +
    '<div class="export-info-row"><span class="k">' +
    esc(i18n.t("export.dimensions")) +
    '</span><span class="v">' +
    page.naturalWidth.toLocaleString() +
    " × " +
    page.naturalHeight.toLocaleString() +
    "</span></div>" +
    '<div class="export-info-row"><span class="k">' +
    esc(i18n.t("export.format")) +
    '</span><span class="v">' +
    esc(fmt) +
    "</span></div>" +
    '<div class="export-info-row"><span class="k">' +
    esc(i18n.t("export.approxSize")) +
    '</span><span class="v">' +
    esc(estSize(page)) +
    "</span></div>" +
    '<div class="export-info-row"><span class="k">' +
    esc(i18n.t("export.layers")) +
    '</span><span class="v">' +
    layerVis +
    "/" +
    page.layers.length +
    "</span></div>" +
    '<div class="export-info-row"><span class="k">' +
    esc(i18n.t("export.masks")) +
    '</span><span class="v">' +
    maskVis +
    "/" +
    page.inpaintMasks.length +
    "</span></div>" +
    '<div class="export-info-row"><span class="k">' +
    esc(i18n.t("export.background")) +
    '</span><span class="v">' +
    esc(
      page.backgroundVisible !== false
        ? i18n.t("export.visible")
        : i18n.t("export.hidden"),
    ) +
    "</span></div>" +
    '<div class="export-info-note">' +
    esc(i18n.t("export.approxNote")) +
    "</div>";
}

/** Redraw the preview canvas to fit the host (contain). */
function fitPreview(): void {
  if (!_previewHost || !_previewCanvas || !_previewCtx || !_previewImg) return;
  const rect = _previewHost.getBoundingClientRect();
  const w = rect.width;
  const h = rect.height;
  const iw = _previewImg.width;
  const ih = _previewImg.height;
  if (!w || !h || !iw || !ih) return;
  const scale = Math.min(w / iw, h / ih) * 0.97;
  const dw = Math.max(1, Math.floor(iw * scale));
  const dh = Math.max(1, Math.floor(ih * scale));
  _previewCanvas.width = dw;
  _previewCanvas.height = dh;
  _previewCtx.imageSmoothingEnabled = true;
  _previewCtx.imageSmoothingQuality = "high";
  _previewCtx.drawImage(_previewImg, 0, 0, dw, dh);
}

async function renderPreview(): Promise<void> {
  const page = _order[_selIdx];
  const token = ++_previewVersion;
  const busy = document.getElementById("export-preview-busy");
  const empty = document.getElementById("export-empty");
  if (!page) {
    _previewImg = null;
    if (_previewCanvas) {
      _previewCanvas.width = 0;
      _previewCanvas.height = 0;
    }
    if (empty) empty.classList.remove("hidden");
    if (busy) busy.classList.add("hidden");
    return;
  }
  if (empty) empty.classList.add("hidden");
  if (busy) busy.classList.remove("hidden");
  try {
    await document.fonts.ready;
    const img = await renderPageToCanvas(page);
    if (token !== _previewVersion) return; // stale — user switched pages
    _previewImg = img;
    fitPreview();
  } catch {
    // leave canvas empty; the info panel still describes the page
  } finally {
    if (token === _previewVersion && busy) busy.classList.add("hidden");
  }
}

function select(idx: number): void {
  _selIdx = idx;
  _list?.querySelectorAll(".export-row").forEach(function (r, i) {
    r.classList.toggle("selected", i === idx);
  });
  updateLabel();
  renderInfo();
  renderPreview();
}

function buildAddMenu(): void {
  const menu = document.getElementById("export-add-menu");
  if (!menu) return;
  const inList = new Set(
    _order.map(function (p) {
      return p.filePath;
    }),
  );
  const avail = state.pages.filter(function (p) {
    return !inList.has(p.filePath);
  });
  menu.innerHTML = "";
  if (!avail.length) {
    const d = document.createElement("div");
    d.className = "export-add-empty";
    d.textContent = i18n.t("export.allAdded");
    menu.appendChild(d);
    return;
  }
  avail.forEach(function (p) {
    const item = document.createElement("div");
    item.className = "export-add-item";
    const img = document.createElement("img");
    const t = canvas.generateThumbnail(p, 24, 32);
    if (t) img.src = t;
    img.alt = p.fileName;
    const span = document.createElement("span");
    span.textContent = p.fileName;
    item.append(img, span);
    item.addEventListener("click", function () {
      _order.push(p);
      menu.classList.add("hidden");
      renderList();
      select(_order.length - 1);
    });
    menu.appendChild(item);
  });
}

function renderList(): void {
  if (!_list) return;
  _list.innerHTML = "";
  _order.forEach(function (page, i) {
    const row = document.createElement("div");
    row.className = "export-row" + (i === _selIdx ? " selected" : "");
    row.draggable = true;
    row.dataset.idx = String(i);

    const idx = document.createElement("span");
    idx.className = "export-idx";
    idx.textContent = String(i + 1);

    const thumb = document.createElement("img");
    thumb.className = "export-thumb";
    thumb.alt = page.fileName;
    const dataUrl = canvas.generateThumbnail(page, 36, 48);
    if (dataUrl) thumb.src = dataUrl;

    const name = document.createElement("span");
    name.className = "export-name";
    name.textContent = page.fileName;

    const rm = document.createElement("button");
    rm.className = "btn export-row-remove";
    rm.title = i18n.t("export.remove");
    rm.innerHTML = '<i data-lucide="x" class="w-3 h-3"></i>';
    rm.addEventListener("click", function (e) {
      e.stopPropagation();
      _order.splice(i, 1);
      if (_selIdx >= _order.length) _selIdx = _order.length - 1;
      renderList();
      select(Math.max(0, _selIdx));
    });

    row.append(idx, thumb, name, rm);

    row.addEventListener("click", function () {
      select(i);
    });
    row.addEventListener("dragstart", function (e) {
      const t = e.target as HTMLElement;
      if (t.closest("button, input")) {
        e.preventDefault();
        return;
      }
      _dragIdx = i;
      row.classList.add("dragging");
      if (e.dataTransfer) {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", String(i));
      }
    });
    row.addEventListener("dragend", function () {
      row.classList.remove("dragging");
      clearDropIndicators();
      _dragIdx = null;
    });
    row.addEventListener("dragover", function (e) {
      if (_dragIdx === null || _dragIdx === i) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
      const rect = row.getBoundingClientRect();
      const before = e.clientY < rect.top + rect.height / 2;
      row.classList.toggle("drop-before", before);
      row.classList.toggle("drop-after", !before);
    });
    row.addEventListener("dragleave", function () {
      row.classList.remove("drop-before", "drop-after");
    });
    row.addEventListener("drop", function (e) {
      e.preventDefault();
      if (_dragIdx === null || _dragIdx === i) return;
      const from = _dragIdx;
      const rect = row.getBoundingClientRect();
      const before = e.clientY < rect.top + rect.height / 2;
      const to = before ? i : i + 1;
      const [p] = _order.splice(from, 1);
      _order.splice(Math.max(0, to > from ? to - 1 : to), 0, p);
      clearDropIndicators();
      renderList();
      select(_selIdx);
    });

    _list!.append(row);
  });
  updateFooter();
}

function onDocClick(e: MouseEvent): void {
  const menu = document.getElementById("export-add-menu");
  const wrap = document.querySelector(".export-add-wrap");
  if (
    menu &&
    !menu.classList.contains("hidden") &&
    wrap &&
    !wrap.contains(e.target as Node)
  ) {
    menu.classList.add("hidden");
  }
}

function buildModal(): void {
  if (_overlay) _overlay.remove();

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
            <span class="export-preview-busy hidden" id="export-preview-busy" data-i18n="export.previewBusy">Rendering preview...</span>
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
    </div>
  `;
  document.body.appendChild(overlay);
  _overlay = overlay;
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
  _list = document.getElementById("export-list");
  _previewHost = document.getElementById("export-preview-host");
  _previewCanvas = document.getElementById(
    "export-preview-canvas",
  ) as HTMLCanvasElement | null;
  _previewCtx = _previewCanvas ? _previewCanvas.getContext("2d") : null;

  const fmtBtns = overlay.querySelectorAll<HTMLButtonElement>(".export-opt");
  fmtBtns.forEach(function (b) {
    b.addEventListener("click", function () {
      _format = (b.dataset.fmt as "png" | "jpg") || "png";
      fmtBtns.forEach(function (x) {
        x.classList.toggle("active", x === b);
      });
      const q = document.getElementById("export-quality");
      if (q) q.classList.toggle("hidden", _format !== "jpg");
      renderInfo();
    });
  });
  const slider = document.getElementById(
    "export-quality-slider",
  ) as HTMLInputElement | null;
  const val = document.getElementById("export-quality-val");
  if (slider) {
    slider.addEventListener("input", function () {
      _quality = Number(slider.value);
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

  if (_previewHost && _previewCanvas) {
    _ro = new ResizeObserver(fitPreview);
    _ro.observe(_previewHost);
  }

  renderList();
  select(_selIdx);
  overlay.classList.add("show");
  createIcons();
}

function close(): void {
  _previewVersion++; // cancel in-flight preview
  if (_ro) {
    _ro.disconnect();
    _ro = null;
  }
  document.removeEventListener("click", onDocClick);
  if (_overlay) {
    _overlay.remove();
    _overlay = null;
  }
  _list = null;
  _previewHost = null;
  _previewCanvas = null;
  _previewCtx = null;
  _previewImg = null;
  _order = [];
  _selIdx = 0;
  _dragIdx = null;
}

async function doExport(goBtn: HTMLButtonElement): Promise<void> {
  goBtn.disabled = true;
  const toast = ui.toast(i18n.t("export.running"), "running", 0);
  try {
    await document.fonts.ready;
    const files: ExportPayload["files"] = [];
    for (const page of _order) {
      await ensureMaskImages(page);
      const data = await renderPage(page, _format, _quality);
      files.push({ fileName: page.fileName, data });
    }
    const res: ExportResult = await window.lumina.exportImages({
      format: _format,
      quality: _quality,
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
    goBtn.disabled = _order.length === 0;
  }
}

function _open(pages: Page[]): void {
  if (!pages.length) {
    ui.toast(i18n.t("export.noPages"), "warn");
    return;
  }
  _order = pages.slice();
  _format = "png";
  _quality = 92;
  _selIdx = 0;
  buildModal();
}

/** Export the currently open page only. */
export function open(): void {
  const active = state.getActivePage();
  _open(active ? [active] : []);
}

/** Export every page in the project. */
export function openAll(): void {
  _open(state.pages.slice());
}
