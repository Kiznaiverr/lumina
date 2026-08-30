/* ── Export sidebar list: thumbnails, add/remove/reorder + page info. ── */

import { canvas } from "../canvas/index";
import { createIcons } from "../icons";
import { esc } from "../sidebar/_esc";
import * as i18n from "../i18n";
import { state } from "../state";
import { st } from "./state";
import { estSize } from "./render";
import { renderPreview } from "./preview";

function clearDropIndicators(): void {
  st.list
    ?.querySelectorAll(".export-row.drop-before, .export-row.drop-after")
    .forEach(function (r) {
      r.classList.remove("drop-before", "drop-after");
    });
}

function updateFooter(): void {
  const count = document.getElementById("export-go-count");
  if (count)
    count.textContent = st.order.length ? " (" + st.order.length + ")" : "";
  const go = document.getElementById(
    "btn-export-go",
  ) as HTMLButtonElement | null;
  if (go) go.disabled = st.order.length === 0;
}

function updateLabel(): void {
  const label = document.getElementById("export-preview-label");
  if (!label) return;
  const page = st.order[st.selIdx];
  label.innerHTML = page
    ? "<strong>" +
      esc(
        i18n.t("export.pageOf", {
          index: st.selIdx + 1,
          total: st.order.length,
        }),
      ) +
      '</strong><span class="export-label-name"> · ' +
      esc(page.fileName) +
      "</span>"
    : "";
}

export function renderInfo(): void {
  const info = document.getElementById("export-info");
  if (!info) return;
  const page = st.order[st.selIdx];
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
  const fmt = st.format === "png" ? "PNG" : "JPG (q" + st.quality + ")";
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

export function select(idx: number): void {
  st.selIdx = idx;
  st.list?.querySelectorAll(".export-row").forEach(function (r, i) {
    r.classList.toggle("selected", i === idx);
  });
  updateLabel();
  renderInfo();
  st.zoom = 1;
  st.panX = 0;
  st.panY = 0;
  renderPreview();
}

export function buildAddMenu(): void {
  const menu = document.getElementById("export-add-menu");
  if (!menu) return;
  const inList = new Set(
    st.order.map(function (p) {
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
      st.order.push(p);
      menu.classList.add("hidden");
      renderList();
      select(st.order.length - 1);
    });
    menu.appendChild(item);
  });
}

export function renderList(): void {
  if (!st.list) return;
  st.list.innerHTML = "";
  st.order.forEach(function (page, i) {
    const row = document.createElement("div");
    row.className = "export-row" + (i === st.selIdx ? " selected" : "");
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
      st.order.splice(i, 1);
      if (st.selIdx >= st.order.length) st.selIdx = st.order.length - 1;
      renderList();
      select(Math.max(0, st.selIdx));
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
      st.dragIdx = i;
      row.classList.add("dragging");
      if (e.dataTransfer) {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", String(i));
      }
    });
    row.addEventListener("dragend", function () {
      row.classList.remove("dragging");
      clearDropIndicators();
      st.dragIdx = null;
    });
    row.addEventListener("dragover", function (e) {
      if (st.dragIdx === null || st.dragIdx === i) return;
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
      if (st.dragIdx === null || st.dragIdx === i) return;
      const from = st.dragIdx;
      const rect = row.getBoundingClientRect();
      const before = e.clientY < rect.top + rect.height / 2;
      const to = before ? i : i + 1;
      const [p] = st.order.splice(from, 1);
      st.order.splice(Math.max(0, to > from ? to - 1 : to), 0, p);
      clearDropIndicators();
      renderList();
      select(st.selIdx);
    });

    st.list!.append(row);
  });
  // The rows' <i data-lucide> placeholders were just created — materialize
  // them into SVGs (buildModal only does this once at open time).
  createIcons({ root: st.list });
  updateFooter();
}

export function onDocClick(e: MouseEvent): void {
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
