/* ── Text Tool — shared state & coordinate helpers ── */
import Konva from "konva";
import { state } from "../../state";
import { canvas } from "../index";

/** All layer text nodes currently on the stage (visual + interactive) */
export const layerTextNodes: Konva.Group[] = [];

let editor: HTMLTextAreaElement | null = null;
export let editingLayerId: string | null = null;

export function setEditor(ta: HTMLTextAreaElement | null): void {
  editor = ta;
}

export function setEditingLayerId(id: string | null): void {
  editingLayerId = id;
}

export function getEditingLayerId(): string | null {
  return editingLayerId;
}

export function getEditor(): HTMLTextAreaElement | null {
  return editor;
}

export function isEditing(): boolean {
  return editor !== null;
}

/** Image-space page coords → stage/container coords */
export function imgToStage(ix: number, iy: number): { x: number; y: number } {
  const sr = canvas.getScaleRatio();
  const off = canvas.getOffset();
  return { x: off.x + ix * sr, y: off.y + iy * sr };
}

/** Stage coords → image-space page coords */
export function stageToImg(sx: number, sy: number): { x: number; y: number } {
  const sr = canvas.getScaleRatio();
  const off = canvas.getOffset();
  return {
    x: Math.round((sx - off.x) / sr),
    y: Math.round((sy - off.y) / sr),
  };
}

export function cleanedViewReady(): boolean {
  // The text tool is available whenever a page is open — no separate
  // "cleaned view" exists anymore; masks composite over the original image.
  return !!state.getActivePage();
}
