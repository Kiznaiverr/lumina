/* ── Text Tool — in-place editing (textarea overlay) ── */
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

/** Commit and remove the open editor. Empty text on an existing layer
 * deletes the layer (Photoshop behavior). */
export function removeEditor(commit: boolean): void {
  const ta = getEditor();
  if (!ta) return;
  const id = getEditingLayerId();
  setEditor(null);
  setEditingLayerId(null);
  ta.remove();
  if (commit && id) {
    const value = ta.value.trim();
    if (!value) {
      canvas.deleteLayer(id); // emptied text deletes the layer
    } else {
      canvas.setLayerText(id, "translation", value);
    }
  } else {
    canvas.render(); // restore hidden node visuals
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
  ta.style.background = "rgba(14,14,16,0.55)";
  ta.style.color = typo.color;
  ta.style.border = "1px dashed #e94560";
  ta.style.borderRadius = "2px";
  ta.style.padding = "0";
  ta.style.margin = "0";
  ta.style.fontSize = dispFs + "px";
  ta.style.lineHeight = "1.2";
  ta.style.fontFamily = typo.fontFamily || "Arial, sans-serif";
  ta.style.fontStyle = typo.fontStyle;
  ta.style.fontWeight = String(typo.fontWeight);
  ta.style.textAlign = typo.align;
  ta.style.resize = "none";
  ta.style.outline = "none";
  ta.style.overflow = "hidden";
  ta.style.zIndex = "50";

  // Hide the visual node while editing — the textarea IS the preview
  const node = layerTextNodes.find(function (n) {
    return n.getAttr("layerId") === layerId;
  });
  if (node) node.visible(false);
  konvaLayer.draw();

  ta.addEventListener("keydown", function (e) {
    e.stopPropagation();
    if (e.key === "Escape" || (e.key === "Enter" && !e.shiftKey)) {
      e.preventDefault();
      removeEditor(true);
    }
  });
  ta.addEventListener("blur", function () {
    removeEditor(true);
  });

  canvas.getStage()?.container().appendChild(ta);
  setEditor(ta);
  setEditingLayerId(layerId);
  ta.focus();
  ta.select();
}
