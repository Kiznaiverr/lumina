/* ── Lumina Canvas — Selection, group refresh, status bar, tool change ── */
import Konva from "konva";
import { state } from "../state";
import * as i18n from "../i18n";
import { canvas } from "./index";
import { TEXT_COLOR } from "./render";
import { sidebar } from "../sidebar";
import { groupRegistry } from "./groupRegistry";

// ── Clear groups (called before re-render) ──

canvas._clearGroups = function (): void {
  groupRegistry.clear();
};

// ── Selection ──

canvas.selectTextDetection = function (idx: number | null): void {
  const page = state.getActivePage();
  if (!page) return;

  page._selectedTextIdx = idx;

  const textGroups = groupRegistry.textGroups();

  textGroups.forEach(function (g, i) {
    const rect = g.findOne<Konva.Rect>("rect");
    if (!rect) return;
    rect.stroke(i === idx ? "#00ff88" : canvas.TEXT_COLOR);
    rect.strokeWidth(i === idx ? 3 : 2);
  });

  const tTransformer = groupRegistry.textTransformer();
  if (tTransformer) {
    if (idx !== null && textGroups[idx]) {
      tTransformer.nodes([textGroups[idx]]);
      textGroups[idx].draggable(true);
    } else {
      tTransformer.nodes([]);
    }
  }
  canvas._updateStatus();
  const layer1 = canvas.getLayer();
  if (layer1) layer1.draw();
  if (sidebar && sidebar.render) sidebar.render();
};

// ── Refresh individual groups ──

const STATUS_COLORS_TEXT: Record<string, string> = {
  auto: TEXT_COLOR,
  adjusted: "#ffa500",
  rejected: "#ff4444",
};

/** Apply bbox dims to a group's visuals: group size, rect, badge position */
function _applySizeToGroup(group: Konva.Group, w: number, h: number): void {
  group.width(Math.max(1, w));
  group.height(Math.max(1, h));
  const rect = group.findOne<Konva.Rect>("rect");
  if (rect) {
    rect.width(Math.max(1, w));
    rect.height(Math.max(1, h));
  }
  const badge = group.findOne<Konva.Group>("badge-right");
  if (badge) badge.x(Math.max(1, w) - 30);
}

canvas._refreshTextGroup = function (idx: number): void {
  const page = state.getActivePage();
  if (!page) return;
  const det = page.textDetections[idx];
  const group = groupRegistry.textGroups()[idx];
  if (!group || !det) return;
  const sr = canvas.getScaleRatio();
  const off = canvas.getOffset();
  group.position({ x: off.x + det.bbox.x * sr, y: off.y + det.bbox.y * sr });
  _applySizeToGroup(group, det.bbox.w * sr, det.bbox.h * sr);
  const rect = group.findOne<Konva.Rect>("rect");
  if (rect) {
    const isSelected = idx === (page._selectedTextIdx || null);
    rect.stroke(
      isSelected
        ? "#00ff88"
        : STATUS_COLORS_TEXT[det.status] || canvas.TEXT_COLOR,
    );
    rect.strokeWidth(isSelected ? 3 : 2);
  }
  const layer = canvas.getLayer();
  if (layer) layer.draw();
  if (sidebar && sidebar.render) sidebar.render();
};

// ── Status bar update ──

canvas._updateStatus = function (): void {
  const page = state.getActivePage();
  const tCount = page ? (page.textDetections || []).length : 0;
  const parts: string[] = [];
  parts.push(i18n.t("status.textCount", { count: tCount }));
  if (
    page &&
    page._selectedTextIdx !== null &&
    page._selectedTextIdx !== undefined
  ) {
    parts.push(
      i18n.t("status.selected", {
        type: "T",
        index: (page._selectedTextIdx as number) + 1,
      }),
    );
  }
  const el = document.getElementById("status-detections");
  if (el) el.textContent = parts.join(" · ");
};

// ── Tool change ──

canvas.onToolChange = function (tool: string): void {
  if (tool !== "select") {
    canvas.selectTextDetection(null);
  }
  groupRegistry.textGroups().forEach(function (g) {
    g.draggable(tool === "select");
  });
  const tTransformer = groupRegistry.textTransformer();
  if (tTransformer && tool !== "select") tTransformer.nodes([]);
  // Re-render so layer text nodes pick up the right interactivity mode
  canvas.render();
};
