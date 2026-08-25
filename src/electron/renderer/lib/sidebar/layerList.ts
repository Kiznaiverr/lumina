/* ── Sidebar: unified layer list (koharu-style) ──
 * One flat list per page: text layers (T) + bubble layers (B).
 * Click row → select on canvas. Selected text row expands into an
 * inline editor for the OCR/source text (commit on blur).
 */
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

export function layerListHTML(page: Page | null): string {
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

  const tSel = page._selectedTextIdx;
  const bSel = page._selectedBubbleIdx;
  let html = "";

  // Text layers first (reading order), then bubbles
  texts.forEach(function (d, i) {
    const isSelected = i === tSel;
    html += layerRowHTML({
      kind: "text",
      idx: i,
      selected: isSelected,
      expanded: isSelected,
      statusColor: TEXT_STATUS_COLORS[d.status] || "#00ff88",
      label:
        "T" + (i + 1) + " · " + (d.type === "text_bubble" ? "bubble" : "free"),
      conf: Math.round(d.confidence * 100),
      preview: d.text || "",
      editorText: d.text || "",
    });
  });

  bubbles.forEach(function (d, i) {
    const isSelected = i === bSel;
    html += layerRowHTML({
      kind: "bubble",
      idx: i,
      selected: isSelected,
      expanded: false,
      statusColor: BUBBLE_STATUS_COLORS[d.status] || "#00bfff",
      label: "B" + (i + 1) + " · " + i18n.t("sidebar.bubbleName"),
      conf: Math.round(d.confidence * 100),
      preview: "",
      editorText: "",
    });
  });

  return html;
}

interface RowOpts {
  kind: "text" | "bubble";
  idx: number;
  selected: boolean;
  expanded: boolean;
  statusColor: string;
  label: string;
  conf: number;
  preview: string;
  editorText: string;
}

function layerRowHTML(o: RowOpts): string {
  let html =
    '<div class="layer-row' +
    (o.selected ? " selected" : "") +
    '" data-type="' +
    o.kind +
    '" data-idx="' +
    o.idx +
    '">' +
    '<div class="layer-row-main">' +
    '<div class="detection-badge" style="background:' +
    o.statusColor +
    '">' +
    (o.kind === "text" ? "T" : "B") +
    "</div>" +
    '<div class="detection-label">' +
    esc(o.label) +
    (o.preview
      ? '<span class="layer-preview">' + esc(o.preview) + "</span>"
      : "") +
    "</div>" +
    '<div class="detection-conf">' +
    o.conf +
    "%</div>" +
    '<div class="detection-actions">' +
    '<button class="det-btn" data-action="move-up" title="' +
    esc(i18n.t("sidebar.moveUp")) +
    '"' +
    (o.idx === 0 ? " disabled" : "") +
    ">↑</button>" +
    '<button class="det-btn" data-action="move-down" title="' +
    esc(i18n.t("sidebar.moveDown")) +
    '"' +
    (o.selected ? "" : " disabled") +
    ">↓</button>" +
    '<button class="det-btn det-btn-danger" data-action="delete" title="' +
    esc(i18n.t("sidebar.delete")) +
    '">✕</button>' +
    "</div>" +
    "</div>";

  // Inline source-text editor for the selected text layer
  if (o.expanded && o.kind === "text") {
    html +=
      '<div class="layer-editor">' +
      '<textarea class="layer-editor-textarea" data-type="text" data-idx="' +
      o.idx +
      '" rows="3" placeholder="' +
      esc(i18n.t("sidebar.editorPlaceholder")) +
      '">' +
      esc(o.editorText) +
      "</textarea>" +
      "</div>";
  }

  html += "</div>";
  return html;
}

export function wireEvents(): void {
  const items = document.querySelectorAll<HTMLElement>(".layer-row");
  items.forEach(function (el) {
    el.addEventListener("click", function (e) {
      const target = e.target as HTMLElement;
      // Ignore clicks inside the inline editor
      if (target.closest(".layer-editor")) return;
      const btn = target.closest(".det-btn") as HTMLButtonElement | null;
      const type = el.getAttribute("data-type") as "text" | "bubble";
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

  // Inline editor: commit on blur, snapshot only when changed
  document
    .querySelectorAll<HTMLTextAreaElement>(".layer-editor-textarea")
    .forEach(function (ta) {
      ta.addEventListener("click", function (e) {
        e.stopPropagation();
      });
      ta.addEventListener("blur", function () {
        const idx = parseInt(ta.getAttribute("data-idx") as string, 10);
        canvas.setTextDetectionText(idx, ta.value);
      });
      ta.addEventListener("keydown", function (e) {
        if (e.key === "Escape") ta.blur();
      });
    });
}
