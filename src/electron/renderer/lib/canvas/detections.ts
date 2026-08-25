/* ── Lumina Canvas — Detection Groups & Selection ── */
import Konva from "konva";
import { state, CONST } from "../state";
import * as i18n from "../i18n";
import { canvas } from "./index";
import { TEXT_COLOR, BUBBLE_COLOR } from "./render";
import { sidebar } from "../sidebar";
import { history } from "../history";
import { contextMenu } from "../contextMenu";
import type { BBox, BubbleDetection, TextDetection } from "../../types";

let _textGroups: Konva.Group[] = [];
let _bubbleGroups: Konva.Group[] = [];
let _textTransformer: Konva.Transformer | null = null;
let _bubbleTransformer: Konva.Transformer | null = null;

// ── Transformer accessors (called from render.ts) ──

canvas._setTextTransformer = function (t) {
  _textTransformer = t;
};
canvas._setBubbleTransformer = function (b) {
  _bubbleTransformer = b;
};

// ── Helpers ──

function _syncBboxFromGroup(
  groups: Konva.Group[],
  dets: Array<{ bbox: BBox }>,
  idx: number,
  sr: number,
  off: { x: number; y: number },
): void {
  const group = groups[idx];
  const det = dets[idx];
  if (!group || !det) return;
  det.bbox.x = Math.round((group.x() - off.x) / sr);
  det.bbox.y = Math.round((group.y() - off.y) / sr);
  det.bbox.w = Math.round((group.width() * group.scaleX()) / sr);
  det.bbox.h = Math.round((group.height() * group.scaleY()) / sr);
}

function _syncTextBboxFromGroup(
  idx: number,
  sr: number,
  off: { x: number; y: number },
): void {
  const page = state.getActivePage();
  if (!page) return;
  _syncBboxFromGroup(_textGroups, page.textDetections, idx, sr, off);
}

function _syncBubbleBboxFromGroup(
  idx: number,
  sr: number,
  off: { x: number; y: number },
): void {
  const page = state.getActivePage();
  if (!page) return;
  _syncBboxFromGroup(_bubbleGroups, page.bubbleDetections, idx, sr, off);
}

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

// ── Group factories ──

canvas._createTextGroup = function (
  det: TextDetection,
  idx: number,
  sr: number,
  off: { x: number; y: number },
): Konva.Group {
  // Clamp dims — model can emit degenerate boxes with negative w/h after scaling
  const x = off.x + det.bbox.x * sr;
  const y = off.y + det.bbox.y * sr;
  const w = Math.max(1, det.bbox.w * sr);
  const h = Math.max(1, det.bbox.h * sr);

  const group = new Konva.Group({
    x: x,
    y: y,
    width: w,
    height: h,
    draggable: state.activeTool === "select",
  });

  group.add(
    new Konva.Rect({
      width: w,
      height: h,
      stroke: canvas.TEXT_COLOR,
      strokeWidth: 2,
      cornerRadius: 3,
      fill: "rgba(0,255,136,0.08)",
      name: "rect",
    }),
  );

  // Badge "T{n}"
  const bg = new Konva.Group({ x: 2, y: -10, name: "badge-left" });
  bg.add(
    new Konva.Rect({
      width: 28,
      height: 16,
      cornerRadius: 8,
      fill: canvas.TEXT_COLOR,
      shadowColor: "rgba(0,0,0,0.4)",
      shadowBlur: 3,
      shadowOffsetY: 1,
    }),
  );
  bg.add(
    new Konva.Text({
      text: "T" + (idx + 1),
      fontSize: 10,
      fontFamily: CONST.FONT_FAMILY,
      fontStyle: "bold",
      fill: "#000",
      width: 28,
      align: "center",
      y: 2,
    }),
  );
  group.add(bg);

  // OCR result (if present) or type label
  const ocrText = det.text ? det.text : "";
  group.add(
    new Konva.Text({
      text: ocrText || (det.type === "text_bubble" ? "bubble" : "free"),
      fontSize: 9 * sr,
      fontFamily: CONST.FONT_FAMILY,
      fill: ocrText ? canvas.TEXT_COLOR : "#888",
      x: 32,
      y: 2,
      width: w - 34,
      height: h - 4,
      wrap: "none",
    }),
  );

  group.on("click", function (e) {
    e.cancelBubble = true;
    canvas.selectTextDetection(idx);
  });
  group.on("contextmenu", function (e) {
    e.cancelBubble = true;
    e.evt.preventDefault();
    canvas.selectTextDetection(idx);
    const page = state.getActivePage();
    if (!page) return;
    contextMenu.show(e.evt.clientX, e.evt.clientY, [
      {
        labelKey: "ctx.delete",
        danger: true,
        action: function () {
          canvas.deleteTextDetection(idx);
        },
      },
      {
        labelKey: "ctx.cycleStatus",
        action: function () {
          const d = page.textDetections[idx];
          if (!d) return;
          d.status =
            d.status === "auto"
              ? "rejected"
              : d.status === "rejected"
                ? "adjusted"
                : "auto";
          canvas._refreshTextGroup(idx);
          history.snapshot();
        },
      },
      {
        labelKey: "ctx.deselect",
        separatorBefore: true,
        action: function () {
          canvas.selectTextDetection(null);
        },
      },
    ]);
  });
  group.on("dblclick dbltap", function (e) {
    e.cancelBubble = true;
    const page = state.getActivePage();
    if (!page) return;
    const d = page.textDetections[idx];
    d.status =
      d.status === "auto"
        ? "rejected"
        : d.status === "rejected"
          ? "adjusted"
          : "auto";
    canvas._refreshTextGroup(idx);
    history.snapshot();
  });
  group.on("dragmove", function () {
    _syncTextBboxFromGroup(idx, sr, off);
  });
  group.on("dragend", function () {
    history.snapshot();
  });
  group.on("transformend", function () {
    _syncTextBboxFromGroup(idx, sr, off);
    group.scaleX(1);
    group.scaleY(1);
    const page = state.getActivePage();
    if (!page || !page.textDetections[idx]) return;
    if (page.textDetections[idx].status === "auto") {
      page.textDetections[idx].status = "adjusted";
    }
    // Re-apply synced bbox to visuals — resetting scale alone leaves the
    // group/rect at the OLD size until next full render.
    const d = page.textDetections[idx];
    group.position({ x: off.x + d.bbox.x * sr, y: off.y + d.bbox.y * sr });
    _applySizeToGroup(group, d.bbox.w * sr, d.bbox.h * sr);
    canvas._refreshTextGroup(idx);
    history.snapshot();
  });

  _textGroups.push(group);
  return group;
};

canvas._createBubbleGroup = function (
  det: BubbleDetection,
  idx: number,
  sr: number,
  off: { x: number; y: number },
): Konva.Group {
  // Clamp dims — model can emit degenerate boxes with negative w/h after scaling
  const x = off.x + det.bbox.x * sr;
  const y = off.y + det.bbox.y * sr;
  const w = Math.max(1, det.bbox.w * sr);
  const h = Math.max(1, det.bbox.h * sr);

  const group = new Konva.Group({
    x: x,
    y: y,
    width: w,
    height: h,
    draggable: state.activeTool === "select",
  });

  group.add(
    new Konva.Rect({
      width: w,
      height: h,
      stroke: canvas.BUBBLE_COLOR,
      strokeWidth: 2,
      cornerRadius: 4,
      fill: "rgba(0,191,255,0.08)",
      dash: [6, 3],
      name: "rect",
    }),
  );

  // Badge "B{n}"
  const bg = new Konva.Group({ x: w - 30, y: -10, name: "badge-right" });
  bg.add(
    new Konva.Rect({
      width: 28,
      height: 16,
      cornerRadius: 8,
      fill: canvas.BUBBLE_COLOR,
      shadowColor: "rgba(0,0,0,0.4)",
      shadowBlur: 3,
      shadowOffsetY: 1,
    }),
  );
  bg.add(
    new Konva.Text({
      text: "B" + (idx + 1),
      fontSize: 10,
      fontFamily: CONST.FONT_FAMILY,
      fontStyle: "bold",
      fill: "#000",
      width: 28,
      align: "center",
      y: 2,
    }),
  );
  group.add(bg);

  group.on("click", function (e) {
    e.cancelBubble = true;
    canvas.selectBubbleDetection(idx);
  });
  group.on("contextmenu", function (e) {
    e.cancelBubble = true;
    e.evt.preventDefault();
    canvas.selectBubbleDetection(idx);
    const page = state.getActivePage();
    if (!page) return;
    contextMenu.show(e.evt.clientX, e.evt.clientY, [
      {
        labelKey: "ctx.delete",
        danger: true,
        action: function () {
          canvas.deleteBubbleDetection(idx);
        },
      },
      {
        labelKey: "ctx.cycleStatus",
        action: function () {
          const d = page.bubbleDetections[idx];
          if (!d) return;
          d.status =
            d.status === "auto"
              ? "rejected"
              : d.status === "rejected"
                ? "adjusted"
                : "auto";
          canvas._refreshBubbleGroup(idx);
          history.snapshot();
        },
      },
      {
        labelKey: "ctx.deselect",
        separatorBefore: true,
        action: function () {
          canvas.selectBubbleDetection(null);
        },
      },
    ]);
  });
  group.on("dblclick dbltap", function (e) {
    e.cancelBubble = true;
    const page = state.getActivePage();
    if (!page) return;
    const d = page.bubbleDetections[idx];
    d.status =
      d.status === "auto"
        ? "rejected"
        : d.status === "rejected"
          ? "adjusted"
          : "auto";
    canvas._refreshBubbleGroup(idx);
    history.snapshot();
  });
  group.on("dragmove", function () {
    _syncBubbleBboxFromGroup(idx, sr, off);
  });
  group.on("dragend", function () {
    history.snapshot();
  });
  group.on("transformend", function () {
    _syncBubbleBboxFromGroup(idx, sr, off);
    group.scaleX(1);
    group.scaleY(1);
    const page = state.getActivePage();
    if (!page || !page.bubbleDetections[idx]) return;
    if (page.bubbleDetections[idx].status === "auto") {
      page.bubbleDetections[idx].status = "adjusted";
    }
    const d = page.bubbleDetections[idx];
    group.position({ x: off.x + d.bbox.x * sr, y: off.y + d.bbox.y * sr });
    _applySizeToGroup(group, d.bbox.w * sr, d.bbox.h * sr);
    canvas._refreshBubbleGroup(idx);
    history.snapshot();
  });

  _bubbleGroups.push(group);
  return group;
};

// ── Delete & reorder ──
// Deletion splices the array and re-renders: badge numbers (T1, B2, ...) are
// derived from array index, so they renumber automatically.

canvas.deleteTextDetection = function (idx: number): void {
  const page = state.getActivePage();
  if (!page || idx < 0 || idx >= page.textDetections.length) return;
  page.textDetections.splice(idx, 1);
  if (
    page._selectedTextIdx !== null &&
    page._selectedTextIdx >= page.textDetections.length
  )
    page._selectedTextIdx = null;
  canvas.render();
  sidebar.render();
  history.snapshot();
};

canvas.deleteBubbleDetection = function (idx: number): void {
  const page = state.getActivePage();
  if (!page || idx < 0 || idx >= page.bubbleDetections.length) return;
  page.bubbleDetections.splice(idx, 1);
  if (
    page._selectedBubbleIdx !== null &&
    page._selectedBubbleIdx >= page.bubbleDetections.length
  )
    page._selectedBubbleIdx = null;
  canvas.render();
  sidebar.render();
  history.snapshot();
};

/** dir: -1 moves up in reading order, +1 moves down */
canvas.moveTextDetection = function (idx: number, dir: number): void {
  const page = state.getActivePage();
  if (!page) return;
  const arr = page.textDetections;
  const next = idx + dir;
  if (idx < 0 || idx >= arr.length || next < 0 || next >= arr.length) return;
  const tmp = arr[idx];
  arr[idx] = arr[next];
  arr[next] = tmp;
  if (page._selectedTextIdx === idx) page._selectedTextIdx = next;
  else if (page._selectedTextIdx === next) page._selectedTextIdx = idx;
  canvas.render();
  sidebar.render();
  history.snapshot();
};

canvas.moveBubbleDetection = function (idx: number, dir: number): void {
  const page = state.getActivePage();
  if (!page) return;
  const arr = page.bubbleDetections;
  const next = idx + dir;
  if (idx < 0 || idx >= arr.length || next < 0 || next >= arr.length) return;
  const tmp = arr[idx];
  arr[idx] = arr[next];
  arr[next] = tmp;
  if (page._selectedBubbleIdx === idx) page._selectedBubbleIdx = next;
  else if (page._selectedBubbleIdx === next) page._selectedBubbleIdx = idx;
  canvas.render();
  sidebar.render();
  history.snapshot();
};

/** Set OCR/source text on a text detection (from sidebar inline editor) */
canvas.setTextDetectionText = function (idx: number, text: string): void {
  const page = state.getActivePage();
  if (!page || idx < 0 || idx >= page.textDetections.length) return;
  const det = page.textDetections[idx];
  if (det.text === text) return;
  det.text = text;
  if (det.status === "auto") det.status = "adjusted";
  canvas._refreshTextGroup(idx);
  history.snapshot();
};

// ── Clear groups (called before re-render) ──

canvas._clearGroups = function (): void {
  _textGroups = [];
  _bubbleGroups = [];
  _textTransformer = null;
  _bubbleTransformer = null;
};

// ── Selection ──

canvas.selectTextDetection = function (idx: number | null): void {
  const page = state.getActivePage();
  if (!page) return;

  page._selectedTextIdx = idx;
  page._selectedBubbleIdx = null;

  _textGroups.forEach(function (g, i) {
    const rect = g.findOne<Konva.Rect>("rect");
    if (!rect) return;
    rect.stroke(i === idx ? "#00ff88" : canvas.TEXT_COLOR);
    rect.strokeWidth(i === idx ? 3 : 2);
  });
  _bubbleGroups.forEach(function (g) {
    const rect = g.findOne<Konva.Rect>("rect");
    if (rect) {
      rect.stroke(canvas.BUBBLE_COLOR);
      rect.strokeWidth(2);
    }
  });

  if (_textTransformer) {
    if (idx !== null && _textGroups[idx]) {
      _textTransformer.nodes([_textGroups[idx]]);
      _textGroups[idx].draggable(true);
    } else {
      _textTransformer.nodes([]);
    }
  }
  // Deselect the other type's transformer too
  _bubbleGroups.forEach(function (g) {
    g.draggable(false);
  });
  if (_bubbleTransformer) _bubbleTransformer.nodes([]);
  canvas._updateStatus();
  const layer1 = canvas.getLayer();
  if (layer1) layer1.draw();
  if (sidebar && sidebar.render) sidebar.render();
};

canvas.selectBubbleDetection = function (idx: number | null): void {
  const page = state.getActivePage();
  if (!page) return;

  page._selectedBubbleIdx = idx;
  page._selectedTextIdx = null;

  _bubbleGroups.forEach(function (g, i) {
    const rect = g.findOne<Konva.Rect>("rect");
    if (!rect) return;
    rect.stroke(i === idx ? "#00bfff" : canvas.BUBBLE_COLOR);
    rect.strokeWidth(i === idx ? 3 : 2);
  });
  _textGroups.forEach(function (g) {
    const rect = g.findOne<Konva.Rect>("rect");
    if (rect) {
      rect.stroke(canvas.TEXT_COLOR);
      rect.strokeWidth(2);
    }
  });

  if (_bubbleTransformer) {
    if (idx !== null && _bubbleGroups[idx]) {
      _bubbleTransformer.nodes([_bubbleGroups[idx]]);
      _bubbleGroups[idx].draggable(true);
    } else {
      _bubbleTransformer.nodes([]);
    }
  }
  // Deselect the other type's transformer too
  _textGroups.forEach(function (g) {
    g.draggable(false);
  });
  if (_textTransformer) _textTransformer.nodes([]);
  canvas._updateStatus();
  const layer = canvas.getLayer();
  if (layer) layer.draw();
  if (sidebar && sidebar.render) sidebar.render();
};

// ── Refresh individual groups ──

const STATUS_COLORS_TEXT: Record<string, string> = {
  auto: TEXT_COLOR,
  adjusted: "#ffa500",
  rejected: "#ff4444",
};
const STATUS_COLORS_BUBBLE: Record<string, string> = {
  auto: BUBBLE_COLOR,
  adjusted: "#ffa500",
  rejected: "#ff4444",
};

canvas._refreshTextGroup = function (idx: number): void {
  const page = state.getActivePage();
  if (!page) return;
  const det = page.textDetections[idx];
  const group = _textGroups[idx];
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

canvas._refreshBubbleGroup = function (idx: number): void {
  const page = state.getActivePage();
  if (!page) return;
  const det = page.bubbleDetections[idx];
  const group = _bubbleGroups[idx];
  if (!group || !det) return;
  const sr = canvas.getScaleRatio();
  const off = canvas.getOffset();
  group.position({ x: off.x + det.bbox.x * sr, y: off.y + det.bbox.y * sr });
  _applySizeToGroup(group, det.bbox.w * sr, det.bbox.h * sr);
  const rect = group.findOne<Konva.Rect>("rect");
  if (rect) {
    const isSelected = idx === (page._selectedBubbleIdx || null);
    rect.stroke(
      isSelected
        ? "#00bfff"
        : STATUS_COLORS_BUBBLE[det.status] || canvas.BUBBLE_COLOR,
    );
    rect.strokeWidth(isSelected ? 3 : 2);
    rect.dash(det.status === "rejected" ? [5, 3] : [6, 3]);
  }
  const layer = canvas.getLayer();
  if (layer) layer.draw();
  if (sidebar && sidebar.render) sidebar.render();
};

// ── Status bar update ──

canvas._updateStatus = function (): void {
  const page = state.getActivePage();
  const tCount = page ? (page.textDetections || []).length : 0;
  const bCount = page ? (page.bubbleDetections || []).length : 0;
  const parts: string[] = [];
  parts.push(i18n.t("status.textCount", { count: tCount }));
  parts.push(i18n.t("status.bubbleCount", { count: bCount }));
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
  if (
    page &&
    page._selectedBubbleIdx !== null &&
    page._selectedBubbleIdx !== undefined
  ) {
    parts.push(
      i18n.t("status.selected", {
        type: "B",
        index: (page._selectedBubbleIdx as number) + 1,
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
    canvas.selectBubbleDetection(null);
  }
  _textGroups.forEach(function (g) {
    g.draggable(tool === "select");
  });
  _bubbleGroups.forEach(function (g) {
    g.draggable(tool === "select");
  });
  if (_textTransformer && tool !== "select") _textTransformer.nodes([]);
  if (_bubbleTransformer && tool !== "select") _bubbleTransformer.nodes([]);
  const layer = canvas.getLayer();
  if (layer) layer.draw();
};
