/* ── Sidebar: all-detections list + event wiring ── */
import * as i18n from "../i18n";
import { canvas } from "../canvas/index";
import type { DetectionStatus, Page } from "../../types";
import { esc } from "./_esc";

const TEXT_STATUS_COLORS: Record<DetectionStatus, string> = {
  auto: "#00ff88",
  adjusted: "#ffa500",
  rejected: "#ff4444",
};
const BUBBLE_STATUS_COLORS: Record<DetectionStatus, string> = {
  auto: "#00bfff",
  adjusted: "#ffa500",
  rejected: "#ff4444",
};

export function detectionListHTML(page: Page | null): string {
  if (!page)
    return (
      '<div class="field-readonly">' + i18n.t("sidebar.noDetections") + "</div>"
    );
  const texts = page.textDetections || [];
  const bubbles = page.bubbleDetections || [];
  if (!texts.length && !bubbles.length)
    return (
      '<div class="field-readonly">' + i18n.t("sidebar.noDetections") + "</div>"
    );

  let html = '<div class="max-h-[300px] overflow-y-auto">';
  const tSel = page._selectedTextIdx;
  const bSel = page._selectedBubbleIdx;

  texts.forEach(function (d, i) {
    const isSelected = i === tSel;
    html +=
      '<div class="detection-item' +
      (isSelected ? " selected" : "") +
      '" data-type="text" data-idx="' +
      i +
      '">' +
      '<div class="detection-badge" style="background:' +
      (TEXT_STATUS_COLORS[d.status] || "#00ff88") +
      '">T</div>' +
      '<div class="detection-label">T' +
      (i + 1) +
      " · " +
      esc(d.type) +
      "</div>" +
      '<div class="detection-conf">' +
      Math.round(d.confidence * 100) +
      "%</div>" +
      '<div class="detection-actions">' +
      '<button class="det-btn" data-action="move-up" title="' +
      esc(i18n.t("sidebar.moveUp")) +
      '"' +
      (i === 0 ? " disabled" : "") +
      ">↑</button>" +
      '<button class="det-btn" data-action="move-down" title="' +
      esc(i18n.t("sidebar.moveDown")) +
      '"' +
      (i === texts.length - 1 ? " disabled" : "") +
      ">↓</button>" +
      '<button class="det-btn det-btn-danger" data-action="delete" title="' +
      esc(i18n.t("sidebar.delete")) +
      '">✕</button>' +
      "</div>" +
      "</div>";
  });

  bubbles.forEach(function (d, i) {
    const isSelected = i === bSel;
    html +=
      '<div class="detection-item' +
      (isSelected ? " selected" : "") +
      '" data-type="bubble" data-idx="' +
      i +
      '">' +
      '<div class="detection-badge" style="background:' +
      (BUBBLE_STATUS_COLORS[d.status] || "#00bfff") +
      '">B</div>' +
      '<div class="detection-label">B' +
      (i + 1) +
      " · " +
      i18n.t("sidebar.bubbleName") +
      "</div>" +
      '<div class="detection-conf">' +
      Math.round(d.confidence * 100) +
      "%</div>" +
      '<div class="detection-actions">' +
      '<button class="det-btn" data-action="move-up" title="' +
      esc(i18n.t("sidebar.moveUp")) +
      '"' +
      (i === 0 ? " disabled" : "") +
      ">↑</button>" +
      '<button class="det-btn" data-action="move-down" title="' +
      esc(i18n.t("sidebar.moveDown")) +
      '"' +
      (i === bubbles.length - 1 ? " disabled" : "") +
      ">↓</button>" +
      '<button class="det-btn det-btn-danger" data-action="delete" title="' +
      esc(i18n.t("sidebar.delete")) +
      '">✕</button>' +
      "</div>" +
      "</div>";
  });

  html += "</div>";
  return html;
}

export function wireEvents(): void {
  const items = document.querySelectorAll<HTMLElement>(
    ".detection-item[data-type]",
  );
  items.forEach(function (el) {
    el.addEventListener("click", function (e) {
      const target = e.target as HTMLElement;
      const btn = target.closest(".det-btn") as HTMLButtonElement | null;
      const type = el.getAttribute("data-type");
      const idx = parseInt(el.getAttribute("data-idx") as string, 10);

      if (btn && !btn.disabled) {
        e.stopPropagation();
        const action = btn.getAttribute("data-action");
        if (type === "text") {
          if (action === "delete") canvas.deleteTextDetection(idx);
          else if (action === "move-up") canvas.moveTextDetection(idx, -1);
          else if (action === "move-down") canvas.moveTextDetection(idx, 1);
        } else {
          if (action === "delete") canvas.deleteBubbleDetection(idx);
          else if (action === "move-up") canvas.moveBubbleDetection(idx, -1);
          else if (action === "move-down") canvas.moveBubbleDetection(idx, 1);
        }
        return;
      }

      if (type === "text") {
        canvas.selectTextDetection(idx);
      } else {
        canvas.selectBubbleDetection(idx);
      }
    });
  });
}
