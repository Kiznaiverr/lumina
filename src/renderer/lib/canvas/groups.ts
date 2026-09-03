/* ── Lumina Canvas — Detection group factories & bbox sync helpers ── */
import Konva from "konva";
import { state, CONST } from "../state";
import { canvas } from "./index";
import { contextMenu, type MenuItem } from "../contextMenu";
import { history } from "../history";
import { sidebar } from "../sidebar";
import { models } from "../models";
import { ocr } from "../pipeline/ocr";
import * as i18n from "../i18n";
import type { BBox, TextDetection } from "../../types";
import { groupRegistry } from "./groupRegistry";
import { applyTextSelection } from "./selection";

// ── Transformer accessors (called from render.ts) ──

canvas._setTextTransformer = function (t) {
  groupRegistry.setTextTransformer(t);
};

// ── Re-OCR submenu children: one row per installed OCR model ──

/** Children for the "Re-OCR" menu item — run OCR on detection `idx` with a
 *  chosen model. Missing models are greyed out (downloadable in settings). */
function _ocrReRunItems(idx: number): MenuItem[] {
  const current = models.selectedModel("ocr");
  return models
    .list()
    .filter(function (m) {
      return m.kind === "ocr";
    })
    .map(function (m): MenuItem {
      return {
        label: m.name,
        title: m.ready ? undefined : i18n.t("models.missing"),
        checked: m.id === current,
        disabled: !m.ready,
        action: function () {
          void ocr.runBoxes([idx], m.id);
        },
      };
    });
}

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
  _syncBboxFromGroup(
    groupRegistry.textGroups(),
    page.textDetections,
    idx,
    sr,
    off,
  );
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
    const reOcrItems = _ocrReRunItems(idx);
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
      ...(reOcrItems.length
        ? [
            {
              labelKey: "ctx.reOcr",
              separatorBefore: true,
              children: reOcrItems,
            },
          ]
        : []),
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
    // Full re-render (mirrors textool's onNodeTransformEnd) — the old
    // in-place re-apply left rect/anchors/OCR-text stale until the next
    // zoom-triggered render.
    canvas.render();
    applyTextSelection(page._selectedTextIdx ?? null);
    sidebar.render();
    history.snapshot();
  });

  groupRegistry.pushTextGroup(group);
  return group;
};
