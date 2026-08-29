/* ── Text Tool — in-place editing (textarea overlay) ── */
import Konva from "konva";
import { state } from "../../state";
import { canvas } from "../index";
import {
  imgToStage,
  getEditor,
  setEditor,
  setEditingLayerId,
  getEditingLayerId,
} from "./shared";
import { layerTextNodes } from "./shared";
import { getTransformer } from "./transformer";

/** Commit and remove the open editor. Empty text on an existing layer
 * deletes the layer (Photoshop behavior). */
export function removeEditor(commit: boolean): void {
  const ta = getEditor();
  if (!ta) return;
  const id = getEditingLayerId();
  // Capture the resized box BEFORE the textarea is removed.
  const rect = ta.getBoundingClientRect();
  setEditor(null);
  setEditingLayerId(null);
  ta.remove();
  if (commit && id) {
    const value = ta.value.trim();
    // Sync the textarea's (possibly resized) box back to the layer — the
    // text box can be resized while editing, Photoshop-style.
    const page = state.getActivePage();
    const lay = page
      ? page.layers.find(function (l) {
          return l.id === id;
        })
      : null;
    if (lay) {
      const sr = canvas.getScaleRatio();
      lay.bbox.w = Math.max(8, Math.round(rect.width / sr));
      lay.bbox.h = Math.max(8, Math.round(rect.height / sr));
    }
    if (!value) {
      canvas.deleteLayer(id); // emptied text deletes the layer
    } else {
      canvas.setLayerText(id, "translation", value);
    }
  } else {
    canvas.render(); // restore hidden node visuals
  }
}

/** True when the last pointer press (in stage coords) falls on the edited
 * box or its transformer handles — those presses keep the editor open
 * (reposition caret, resize via anchor) instead of exiting edit mode. */
function _pressInsideBox(): boolean {
  const stage = canvas.getStage();
  const id = getEditingLayerId();
  if (!stage || !id) return false;
  const node = layerTextNodes.find(function (n) {
    return n.getAttr("layerId") === id;
  });
  if (!node) return false;
  const pos = stage.getPointerPosition();
  if (!pos) return false;
  const box = node.getClientRect();
  const M = 12; // transformer padding (6) + half anchor (4) + slack
  return (
    pos.x >= box.x - M &&
    pos.x <= box.x + box.width + M &&
    pos.y >= box.y - M &&
    pos.y <= box.y + box.height + M
  );
}

/** Any press outside the edited box while editing exits edit mode — even if
 * the textarea already lost focus (a suppressed blur), so the editor can't
 * get stuck open. */
document.addEventListener("mousedown", function () {
  if (!getEditor() || !getEditingLayerId()) return;
  if (!_pressInsideBox()) removeEditor(true);
});

/** Vertically center SINGLE-line content in the box (Photoshop-like): only
 * when the text is exactly one visual line (no explicit newlines AND no
 * wrap) does line-height = box height push it to the middle. Multi-line
 * content keeps normal line spacing — a tall box must NOT stretch each line
 * to full box height (that would push every line after the first out of
 * view). */
function _fitLineHeight(ta: HTMLTextAreaElement): void {
  ta.style.lineHeight = "1.2";
  const fs = parseFloat(ta.style.fontSize) || 16;
  // One visual line ≈ 1.2em; two wrapped/explicit lines ≈ 2.4em. Anything
  // below ~1.9em is a single line (with slack for textarea quirks).
  if (!ta.value.includes("\n") && ta.scrollHeight <= fs * 1.2 * 1.6) {
    ta.style.lineHeight = ta.clientHeight + "px";
  }
}

/** Show a textarea positioned exactly over the layer's box — live preview */
export function startEdit(layerId: string): void {
  const page = state.getActivePage();
  const konvaLayer = canvas.getLayer();
  if (!page || !konvaLayer || getEditor()) return;
  const lay = page.layers.find(function (l) {
    return l.id === layerId;
  });
  if (!lay) return;
  const initial = lay.translation || lay.source || "";

  const sr = canvas.getScaleRatio();
  const p = imgToStage(lay.bbox.x, lay.bbox.y);
  const typo = lay.typography;
  const dispFs = (typo.fontSize || Math.max(8, lay.bbox.h * 0.6)) * sr;

  const ta = document.createElement("textarea");
  ta.id = "text-tool-editor";
  ta.value = initial;
  ta.style.position = "absolute";
  ta.style.left = p.x + "px";
  ta.style.top = p.y + "px";
  ta.style.width = Math.max(80, lay.bbox.w * sr) + "px";
  ta.style.height = Math.max(30, lay.bbox.h * sr) + "px";
  ta.style.minWidth = "40px";
  ta.style.minHeight = "20px";
  ta.style.background = "rgba(14,14,16,0.35)";
  ta.style.color = typo.color;
  ta.style.border = "none";
  ta.style.borderRadius = "2px";
  ta.style.padding = "0";
  ta.style.margin = "0";
  ta.style.fontSize = dispFs + "px";
  ta.style.fontFamily = typo.fontFamily || "Arial, sans-serif";
  ta.style.fontStyle = typo.fontStyle;
  ta.style.fontWeight = String(typo.fontWeight);
  ta.style.textAlign = typo.align;
  ta.style.resize = "none"; // no native grip — the transformer resizes
  ta.style.outline = "none";
  ta.style.overflow = "hidden";
  ta.style.zIndex = "50";

  // Hide only the text glyphs while editing — the textarea IS the preview.
  // The box stays visible so the transformer stays attached and the box can
  // be resized with real handles while typing (Photoshop behavior).
  const node = layerTextNodes.find(function (n) {
    return n.getAttr("layerId") === layerId;
  });
  if (node) {
    const glyphs = node.findOne<Konva.Text>(".layer-text-glyphs");
    if (glyphs) glyphs.visible(false);
  }
  // Re-assert selection on the edited box — onToolChange() cleared
  // _selectedLayerId when switching to the text tool, so re-attach here.
  page._selectedLayerId = layerId;
  const tr = getTransformer();
  if (tr && node) {
    tr.nodes([node]);
    node.draggable(true);
  }
  konvaLayer.draw();

  ta.addEventListener("keydown", function (e) {
    e.stopPropagation();
    if (e.key === "Escape" || (e.key === "Enter" && !e.shiftKey)) {
      e.preventDefault();
      removeEditor(true);
    }
  });
  // Re-center when the content wraps or collapses back to one line.
  ta.addEventListener("input", function () {
    _fitLineHeight(ta);
  });
  ta.addEventListener("blur", function () {
    // Clicking the transformer handles or the box edge keeps the editor
    // open — only exit when focus leaves the text area for real.
    if (_pressInsideBox()) return;
    removeEditor(true);
  });

  canvas.getStage()?.container().appendChild(ta);
  setEditor(ta);
  setEditingLayerId(layerId);
  ta.focus();
  ta.select();
  _fitLineHeight(ta);
}

/** Re-apply the editing visual state after a full canvas.render() (zoom, pan,
 * tool change, resize commit…) — the rebuilt node's glyphs would otherwise
 * show the committed text as a "shadow" under the textarea, and the textarea
 * itself must track the new zoom/pan. */
export function refreshEditingState(): void {
  const id = getEditingLayerId();
  const ta = getEditor();
  if (!id || !ta) return;
  const node = layerTextNodes.find(function (n) {
    return n.getAttr("layerId") === id;
  });
  if (!node) return;
  const glyphs = node.findOne<Konva.Text>(".layer-text-glyphs");
  if (glyphs) glyphs.visible(false);
  const tr = getTransformer();
  if (tr) {
    tr.nodes([node]);
    node.draggable(true);
  }
  syncEditorBox();
}

/** Re-position/resize the editor textarea to the layer's current box —
 * called after the box is resized via the transformer while editing. */
export function syncEditorBox(): void {
  const ta = getEditor();
  const id = getEditingLayerId();
  if (!ta || !id) return;
  const page = state.getActivePage();
  if (!page) return;
  const lay = page.layers.find(function (l) {
    return l.id === id;
  });
  if (!lay) return;
  const sr = canvas.getScaleRatio();
  const p = imgToStage(lay.bbox.x, lay.bbox.y);
  ta.style.left = p.x + "px";
  ta.style.top = p.y + "px";
  ta.style.width = Math.max(80, lay.bbox.w * sr) + "px";
  ta.style.height = Math.max(30, lay.bbox.h * sr) + "px";
  const fs = (lay.typography.fontSize || Math.max(8, lay.bbox.h * 0.6)) * sr;
  ta.style.fontSize = fs + "px";
  _fitLineHeight(ta);
}
