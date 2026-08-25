/* ── Sidebar: selected text/bubble detection detail groups ── */
import * as i18n from "../i18n";
import type {
  BubbleDetection,
  DetectionStatus,
  TextDetection,
} from "../../types";
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

export function textDetHTML(det: TextDetection | null): string {
  if (!det)
    return (
      '<div class="field-readonly">' +
      i18n.t("sidebar.text.clickInspect") +
      "</div>"
    );
  return (
    '<div class="field-row">' +
    '<div class="field"><div class="field-label">' +
    i18n.t("sidebar.text.type") +
    "</div><div>" +
    esc(det.type) +
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
    (TEXT_STATUS_COLORS[det.status] || "#00ff88") +
    '"></span>' +
    det.status +
    "</div></div>" +
    '<div class="field"><div class="field-label">' +
    i18n.t("sidebar.text.originalText") +
    '</div><div class="text-[0.65rem]" style="word-break:break-all">' +
    esc(det.text || "—") +
    "</div></div>"
  );
}

export function bubbleDetHTML(det: BubbleDetection | null): string {
  if (!det)
    return (
      '<div class="field-readonly">' +
      i18n.t("sidebar.bubble.clickInspect") +
      "</div>"
    );
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
    (BUBBLE_STATUS_COLORS[det.status] || "#00bfff") +
    '"></span>' +
    det.status +
    "</div></div>"
  );
}
