/* ── Lumina Canvas — Page Strip Navigation ── */
import { state } from "../state";
import * as i18n from "../i18n";
import { ui } from "../ui";
import { canvas } from "./index";
import { sidebar } from "../sidebar";
import { createIcons } from "../icons";
import type { Page } from "../../types";

/** Render page strip thumbnails */
canvas.renderPageStrip = function (): void {
  const strip = document.getElementById("page-strip");
  const items = document.getElementById("page-strip-items");
  if (!strip || !items) return;

  if (state.pages.length <= 1) {
    strip.classList.add("hidden");
    return;
  }

  strip.classList.remove("hidden");
  items.innerHTML = "";

  state.pages.forEach(function (page, i) {
    const thumb = document.createElement("div");
    thumb.className =
      "page-thumb" + (i === state.activePageIdx ? " active" : "");
    thumb.title = page.fileName;
    thumb.dataset.pageIdx = String(i);

    // Create thumbnail image
    const img = document.createElement("img");
    if (page.image) {
      img.src = page.image.src;
    }
    thumb.appendChild(img);

    // Page number label
    const num = document.createElement("div");
    num.className = "page-num";
    num.textContent = String(i + 1);
    thumb.appendChild(num);

    // Delete button (shown on hover)
    const del = document.createElement("div");
    del.className =
      "absolute top-0 right-0 w-3.5 h-3.5 bg-red-600 rounded-bl rounded-tr-sm cursor-pointer hidden items-center justify-center text-white text-[8px] leading-none hover:bg-red-500";
    del.textContent = "×";
    del.title = i18n.t("pages.remove");
    thumb.appendChild(del);
    thumb.addEventListener("mouseenter", function () {
      del.style.display = "flex";
    });
    thumb.addEventListener("mouseleave", function () {
      del.style.display = "none";
    });
    del.addEventListener("click", function (e) {
      e.stopPropagation();
      canvas.removePage(i);
    });

    // Click to switch page
    thumb.addEventListener("click", function () {
      canvas.switchPage(i);
    });

    items.appendChild(thumb);
  });

  // Add "+" button at the end
  const addBtn = document.createElement("div");
  addBtn.className =
    "page-thumb flex items-center justify-center bg-surface-3 text-text-muted hover:text-text-secondary cursor-pointer";
  addBtn.title = i18n.t("pages.importMore");
  addBtn.innerHTML = '<i data-lucide="plus" class="w-4 h-4"></i>';
  addBtn.addEventListener("click", function () {
    if (rendererRef && rendererRef.importImages) {
      rendererRef.importImages();
    }
  });
  items.appendChild(addBtn);

  createIcons({
    nameAttr: "data-lucide",
    attrs: {},
    root: addBtn.parentElement as HTMLElement,
  });
};

/** Set by renderer entry — avoids circular import */
let rendererRef: { importImages: () => Promise<void> } | null = null;
export function setRendererImport(fn: () => Promise<void>): void {
  rendererRef = { importImages: fn };
}

/** Switch active page by index */
canvas.switchPage = function (idx: number): void {
  canvas._clearGroups();
  state.setActivePage(idx);
  canvas.render();
  canvas.renderPageStrip();
  ui.updatePageIndicator();
  if (sidebar && sidebar.render) sidebar.render();
};

/** Remove a page */
canvas.removePage = function (idx: number): void {
  state.removePage(idx);
  canvas._clearGroups();
  if (state.pages.length > 0) {
    state.activePageIdx = Math.min(idx, state.pages.length - 1);
    canvas.render();
  } else {
    // No pages left — show landing
    const landing = document.getElementById("landing");
    if (landing) landing.classList.remove("hidden");
    const stage = canvas.getStage();
    if (stage) stage.destroy();
  }
  canvas.renderPageStrip();
  ui.updatePageIndicator();
  if (sidebar && sidebar.render) sidebar.render();
};

/** Generate a thumbnail data URL from page (for export, future) */
canvas.generateThumbnail = function (
  page: Page,
  maxW?: number,
  maxH?: number,
): string | null {
  maxW = maxW || 80;
  maxH = maxH || 100;
  if (!page || !page.image) return null;
  const cnv = document.createElement("canvas");
  const ratio = Math.min(maxW / page.naturalWidth, maxH / page.naturalHeight);
  cnv.width = Math.round(page.naturalWidth * ratio);
  cnv.height = Math.round(page.naturalHeight * ratio);
  const ctx = cnv.getContext("2d") as CanvasRenderingContext2D;
  ctx.drawImage(page.image, 0, 0, cnv.width, cnv.height);
  return cnv.toDataURL("image/png");
};
