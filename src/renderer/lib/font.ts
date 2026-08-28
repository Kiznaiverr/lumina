/* ── Lumina Font Auto-Fit ── */
import { CONST } from "./state";

// Hidden canvas for text measurement
const _measureCanvas = document.createElement("canvas");
const _measureCtx = _measureCanvas.getContext("2d") as CanvasRenderingContext2D;

export interface AutoFitResult {
  fontSize: number;
  text: string;
  needsManualFit: boolean;
}

/**
 * Auto-fit text into a bounding box.
 */
export function fontAutoFit(
  text: string,
  bboxW: number,
  bboxH: number,
): AutoFitResult {
  const usableW = bboxW * CONST.BUBBLE_PADDING;
  const usableH = bboxH * CONST.BUBBLE_PADDING;

  let fontSize = CONST.DEFAULT_FONT_SIZE;

  while (fontSize >= CONST.MIN_FONT_SIZE) {
    _measureCtx.font = fontSize + "px " + CONST.FONT_FAMILY;
    const lines = wrapText(_measureCtx, text, usableW);
    const lineHeight = fontSize * 1.2;
    const totalH = lines.length * lineHeight;

    if (totalH <= usableH) {
      return {
        fontSize: fontSize,
        text: lines.join("\n"),
        needsManualFit: false,
      };
    }
    fontSize -= CONST.FONT_STEP;
  }

  // At min size — still overflow
  _measureCtx.font = CONST.MIN_FONT_SIZE + "px " + CONST.FONT_FAMILY;
  const lines = wrapText(_measureCtx, text, usableW);
  return {
    fontSize: CONST.MIN_FONT_SIZE,
    text: lines.join("\n"),
    needsManualFit: true,
  };
}

/** Word-wrap text to fit within maxWidth pixels */
export function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string[] {
  if (!text) return [""];
  const paragraphs = text.split("\n");
  const allLines: string[] = [];

  for (const para of paragraphs) {
    if (para === "") {
      allLines.push("");
      continue;
    }
    const words = para.split(/\s+/);
    let currentLine = "";

    for (const word of words) {
      const test = currentLine ? currentLine + " " + word : word;
      if (ctx.measureText(test).width > maxWidth && currentLine) {
        allLines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = test;
      }
    }
    if (currentLine) allLines.push(currentLine);
  }

  return allLines.length ? allLines : [""];
}
