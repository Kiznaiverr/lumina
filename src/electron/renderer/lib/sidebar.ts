/* ── Lumina Sidebar ── */
import { state } from "./state";
import * as i18n from "./i18n";
import { canvas } from "./canvas/index";
import { createIcons } from "./icons";
import type {
  BubbleDetection,
  DetectionStatus,
  Page,
  TextDetection,
} from "../types";

function _esc(s: unknown): string {
  if (!s) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export const sidebar = {
  render(): void {
    const scroll = document.getElementById("sidebar-scroll");
    if (!scroll) return;
    scroll.innerHTML = "";

    const page = state.getActivePage();
    const tIdx = page
      ? page._selectedTextIdx !== undefined
        ? page._selectedTextIdx
        : null
      : null;
    const bIdx = page
      ? page._selectedBubbleIdx !== undefined
        ? page._selectedBubbleIdx
        : null
      : null;
    const tDet = tIdx !== null && page ? page.textDetections[tIdx] : null;
    const bDet = bIdx !== null && page ? page.bubbleDetections[bIdx] : null;

    // Group: IMAGE INFO
    const gImg = this._group(i18n.t("sidebar.image"), true);
    gImg.querySelector(".panel-group-body")!.innerHTML = this._imageHTML(page);
    scroll.appendChild(gImg);

    // Group: TEXT DETECTIONS
    const tCount = page ? (page.textDetections || []).length : 0;
    const gText = this._group(
      i18n.t("sidebar.textDetections", { count: tCount }),
      tDet !== null,
    );
    gText.querySelector(".panel-group-body")!.innerHTML =
      this._textDetHTML(tDet);
    scroll.appendChild(gText);

    // Group: BUBBLE DETECTIONS
    const bCount = page ? (page.bubbleDetections || []).length : 0;
    const gBubble = this._group(
      i18n.t("sidebar.bubbleDetections", { count: bCount }),
      bDet !== null,
    );
    gBubble.querySelector(".panel-group-body")!.innerHTML =
      this._bubbleDetHTML(bDet);
    scroll.appendChild(gBubble);

    // Group: ALL DETECTIONS
    const gList = this._group(i18n.t("sidebar.allDetections"), true);
    gList.querySelector(".panel-group-body")!.innerHTML =
      this._detectionListHTML(page);
    scroll.appendChild(gList);

    this._wireEvents();
    createIcons();
  },

  _group(title: string, expanded: boolean): HTMLDivElement {
    const div = document.createElement("div");
    div.className = "panel-group" + (expanded ? "" : " collapsed");
    const iconName = expanded ? "chevron-down" : "chevron-right";
    div.innerHTML =
      '<div class="panel-group-header">' +
      '<i data-lucide="' +
      iconName +
      '" class="arrow-icon"></i>' +
      "<span>" +
      title +
      "</span>" +
      "</div>" +
      '<div class="panel-group-body p-2.5"></div>';

    const header = div.querySelector(".panel-group-header") as HTMLElement;
    header.addEventListener("click", function () {
      div.classList.toggle("collapsed");
      const icon = div.querySelector(".arrow-icon") as HTMLElement;
      const isCollapsed = div.classList.contains("collapsed");
      icon.setAttribute(
        "data-lucide",
        isCollapsed ? "chevron-right" : "chevron-down",
      );
      createIcons({
        nameAttr: "data-lucide",
        attrs: {},
        root: icon.parentElement as HTMLElement,
      });
    });
    return div;
  },

  _imageHTML(page: Page | null): string {
    if (!page)
      return (
        '<div class="field-readonly">' +
        i18n.t("sidebar.image.noImage") +
        "</div>"
      );
    return (
      '<div class="field-row">' +
      '<div class="field"><div class="field-label">' +
      i18n.t("sidebar.image.width") +
      "</div><div>" +
      page.naturalWidth +
      "px</div></div>" +
      '<div class="field"><div class="field-label">' +
      i18n.t("sidebar.image.height") +
      "</div><div>" +
      page.naturalHeight +
      "px</div></div>" +
      "</div>" +
      '<div class="field"><div class="field-label">' +
      i18n.t("sidebar.image.file") +
      '</div><div class="text-[0.65rem] text-text-muted break-all">' +
      _esc(page.fileName) +
      "</div></div>"
    );
  },

  _textDetHTML(det: TextDetection | null): string {
    if (!det)
      return (
        '<div class="field-readonly">' +
        i18n.t("sidebar.text.clickInspect") +
        "</div>"
      );
    const statusColors: Record<DetectionStatus, string> = {
      auto: "#00ff88",
      adjusted: "#ffa500",
      rejected: "#ff4444",
    };
    return (
      '<div class="field-row">' +
      '<div class="field"><div class="field-label">' +
      i18n.t("sidebar.text.type") +
      "</div><div>" +
      _esc(det.type) +
      "</div></div>" +
      '<div class="field"><div class="field-label">' +
      i18n.t("sidebar.text.confidence") +
      "</div><div>" +
      Math.round(det.confidence * 100) +
      "%</div></div>" +
      "</div>" +
      '<div class="field"><div class="field-label">' +
      i18n.t("sidebar.text.bbox") +
      '</div><div class="text-[0.65rem] text-text-muted">' +
      Math.round(det.bbox.x) +
      ", " +
      Math.round(det.bbox.y) +
      " · " +
      Math.round(det.bbox.w) +
      "×" +
      Math.round(det.bbox.h) +
      "</div></div>" +
      '<div class="field"><div class="field-label">' +
      i18n.t("sidebar.text.status") +
      "</div><div>" +
      '<span class="status-dot" style="background:' +
      (statusColors[det.status] || "#00ff88") +
      '"></span>' +
      det.status +
      "</div></div>"
    );
  },

  _bubbleDetHTML(det: BubbleDetection | null): string {
    if (!det)
      return (
        '<div class="field-readonly">' +
        i18n.t("sidebar.bubble.clickInspect") +
        "</div>"
      );
    const statusColors: Record<DetectionStatus, string> = {
      auto: "#00bfff",
      adjusted: "#ffa500",
      rejected: "#ff4444",
    };
    return (
      '<div class="field"><div class="field-label">' +
      i18n.t("sidebar.bubble.confidence") +
      "</div><div>" +
      Math.round(det.confidence * 100) +
      "%</div></div>" +
      '<div class="field"><div class="field-label">' +
      i18n.t("sidebar.bubble.bbox") +
      '</div><div class="text-[0.65rem] text-text-muted">' +
      Math.round(det.bbox.x) +
      ", " +
      Math.round(det.bbox.y) +
      " · " +
      Math.round(det.bbox.w) +
      "×" +
      Math.round(det.bbox.h) +
      "</div></div>" +
      '<div class="field"><div class="field-label">' +
      i18n.t("sidebar.bubble.status") +
      "</div><div>" +
      '<span class="status-dot" style="background:' +
      (statusColors[det.status] || "#00bfff") +
      '"></span>' +
      det.status +
      "</div></div>"
    );
  },

  _detectionListHTML(page: Page | null): string {
    if (!page)
      return (
        '<div class="field-readonly">' +
        i18n.t("sidebar.noDetections") +
        "</div>"
      );
    const texts = page.textDetections || [];
    const bubbles = page.bubbleDetections || [];
    if (!texts.length && !bubbles.length)
      return (
        '<div class="field-readonly">' +
        i18n.t("sidebar.noDetections") +
        "</div>"
      );

    let html = '<div class="max-h-[300px] overflow-y-auto">';
    const tSel = page._selectedTextIdx;
    const bSel = page._selectedBubbleIdx;

    texts.forEach(function (d, i) {
      const isSelected = i === tSel;
      const statusColors: Record<DetectionStatus, string> = {
        auto: "#00ff88",
        adjusted: "#ffa500",
        rejected: "#ff4444",
      };
      html +=
        '<div class="detection-item' +
        (isSelected ? " selected" : "") +
        '" data-type="text" data-idx="' +
        i +
        '">' +
        '<div class="detection-badge" style="background:' +
        (statusColors[d.status] || "#00ff88") +
        '">T</div>' +
        '<div class="detection-label">T' +
        (i + 1) +
        " · " +
        _esc(d.type) +
        "</div>" +
        '<div class="detection-conf">' +
        Math.round(d.confidence * 100) +
        "%</div>" +
        "</div>";
    });

    bubbles.forEach(function (d, i) {
      const isSelected = i === bSel;
      const statusColors: Record<DetectionStatus, string> = {
        auto: "#00bfff",
        adjusted: "#ffa500",
        rejected: "#ff4444",
      };
      html +=
        '<div class="detection-item' +
        (isSelected ? " selected" : "") +
        '" data-type="bubble" data-idx="' +
        i +
        '">' +
        '<div class="detection-badge" style="background:' +
        (statusColors[d.status] || "#00bfff") +
        '">B</div>' +
        '<div class="detection-label">B' +
        (i + 1) +
        " · " +
        i18n.t("sidebar.bubbleName") +
        "</div>" +
        '<div class="detection-conf">' +
        Math.round(d.confidence * 100) +
        "%</div>" +
        "</div>";
    });

    html += "</div>";
    return html;
  },

  _wireEvents(): void {
    const items = document.querySelectorAll<HTMLElement>(
      ".detection-item[data-type]",
    );
    items.forEach(function (el) {
      el.addEventListener("click", function () {
        const type = el.getAttribute("data-type");
        const idx = parseInt(el.getAttribute("data-idx") as string, 10);
        if (type === "text") {
          canvas.selectTextDetection(idx);
        } else {
          canvas.selectBubbleDetection(idx);
        }
      });
    });
  },
};
