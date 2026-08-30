/* ── Lumina Export — modal window + offscreen 1:1 page rendering ──
 * Export renders each page at natural resolution to PNG or JPG and writes
 * the files via the main process (native folder picker). Reordering pages
 * in the modal changes only the export order, never state.pages.
 */
import Konva from "konva";
import { state } from "./state";
import { canvas } from "./canvas/index";
import { makeNode } from "./canvas/textool/nodeFactory";
import { createIcons } from "./icons";
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

/** Composite one page at natural 1:1 into PNG/JPEG bytes.
 * Mirrors canvas render order: background → inpaint masks → text layers. */
async function renderPage(
  page: Page,
  format: "png" | "jpg",
  quality: number,
): Promise<Uint8Array> {
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

  let bytes: Uint8Array;
  if (format === "png") {
    bytes = dataUrlToBytes(stage.toDataURL({ mimeType: "image/png" }));
  } else {
    // JPEG has no alpha — composite over white like a flattened export.
    const c = document.createElement("canvas");
    c.width = page.naturalWidth;
    c.height = page.naturalHeight;
    const ctx = c.getContext("2d") as CanvasRenderingContext2D;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(stage.toCanvas(), 0, 0);
    bytes = dataUrlToBytes(c.toDataURL("image/jpeg", quality / 100));
  }
  stage.destroy();
  host.remove();
  return bytes;
}

/* ── modal state ── */

let _order: Page[] = [];
let _format: "png" | "jpg" = "png";
let _quality = 92;
let _overlay: HTMLElement | null = null;
let _list: HTMLElement | null = null;
let _dragIdx: number | null = null;

function clearDropIndicators(): void {
  _list
    ?.querySelectorAll(".export-row.drop-before, .export-row.drop-after")
    .forEach(function (r) {
      r.classList.remove("drop-before", "drop-after");
    });
}

function renderList(): void {
  if (!_list) return;
  _list.innerHTML = "";
  _order.forEach(function (page, i) {
    const row = document.createElement("div");
    row.className = "export-row";
    row.draggable = true;
    row.dataset.idx = String(i);

    const thumb = document.createElement("img");
    thumb.className = "export-thumb";
    thumb.alt = page.fileName;
    const dataUrl = canvas.generateThumbnail(page, 56, 72);
    if (dataUrl) thumb.src = dataUrl;

    const name = document.createElement("span");
    name.className = "export-name";
    name.textContent = page.fileName;

    const idx = document.createElement("span");
    idx.className = "export-idx";
    idx.textContent = String(i + 1);

    row.append(idx, thumb, name);

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
    });

    _list!.append(row);
  });
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
        <div class="export-list" id="export-list"></div>
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
      </div>
      <div class="flex justify-end gap-2 px-4 py-3 border-t border-surface-3">
        <button class="btn" id="btn-export-cancel" data-i18n="export.cancel">Cancel</button>
        <button class="btn primary" id="btn-export-go" data-i18n="export.export">Export</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  _overlay = overlay;
  _list = document.getElementById("export-list");

  const fmtBtns = overlay.querySelectorAll<HTMLButtonElement>(".export-opt");
  fmtBtns.forEach(function (b) {
    b.addEventListener("click", function () {
      _format = (b.dataset.fmt as "png" | "jpg") || "png";
      fmtBtns.forEach(function (x) {
        x.classList.toggle("active", x === b);
      });
      const q = document.getElementById("export-quality");
      if (q) q.classList.toggle("hidden", _format !== "jpg");
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
    });
  }

  const goBtn = document.getElementById("btn-export-go") as HTMLButtonElement;
  overlay.querySelector("#btn-export-close")?.addEventListener("click", close);
  overlay.querySelector("#btn-export-cancel")?.addEventListener("click", close);
  goBtn.addEventListener("click", function () {
    doExport(goBtn);
  });
  overlay.addEventListener("click", function (e) {
    if (e.target === overlay) close();
  });

  renderList();
  overlay.classList.add("show");
  createIcons();
}

function close(): void {
  if (_overlay) {
    _overlay.remove();
    _overlay = null;
  }
  _list = null;
  _order = [];
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
    goBtn.disabled = false;
  }
}

export function open(): void {
  if (!state.pages.length) {
    ui.toast(i18n.t("export.noPages"), "warn");
    return;
  }
  _order = state.pages.slice();
  _format = "png";
  _quality = 92;
  buildModal();
}
