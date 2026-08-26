/* ── Lumina Font-Fit — cypy-style auto-shrink text-in-box ──
 * Spec: preset-based fitting with scoring loop + small-overflow tolerance.
 * Two variants:
 *   horizontal    — word-wrap languages (EN/ID), hyphen-split long words
 *   vertical-cjk  — Japanese columns right→left, char-per-column math
 *
 * All measurements run in IMAGE space (unscaled page pixels) so results are
 * zoom-independent. The renderer maps the result back to stage space.
 */
import type { Typography } from "../../../types";

export type FitStatus = "ok" | "overflow-tolerated" | "forced-minimum";

export interface TextFitPreset {
  maxFont: number;
  minFont: number;
  widthUsageRatio: number;
  heightUsageRatio: number;
  fontScale: number;
  spacingRatio: number;
}

export interface TextFitResult {
  fontSize: number; // image-space px
  wrappedText: string | string[][]; // string (horizontal) | columns (cjk)
  textWidth: number;
  textHeight: number;
  fitStatus: FitStatus;
}

// ── Measurement context (shared hidden canvas) ──

const _measureCanvas = document.createElement("canvas");
const _ctx = _measureCanvas.getContext("2d") as CanvasRenderingContext2D;

function fontString(size: number, typo: Typography): string {
  const weight = typo.fontWeight >= 700 ? "bold" : "normal";
  const style = typo.fontStyle === "italic" ? "italic" : "normal";
  return (
    style +
    " " +
    weight +
    " " +
    size +
    "px " +
    (typo.fontFamily || "Arial, sans-serif")
  );
}

function measureLineWidth(
  text: string,
  size: number,
  typo: Typography,
): number {
  _ctx.font = fontString(size, typo);
  return _ctx.measureText(text).width;
}

/** Total bbox of wrapped lines incl. line spacing */
function measureMultiline(
  lines: string[],
  size: number,
  spacing: number,
  typo: Typography,
): { w: number; h: number } {
  _ctx.font = fontString(size, typo);
  let w = 0;
  for (const line of lines) {
    const lw = _ctx.measureText(line).width;
    if (lw > w) w = lw;
  }
  return {
    w: w,
    h: lines.length * size + Math.max(0, lines.length - 1) * spacing,
  };
}

// ── Preset selection ──

const PRESET_BIG_SHORT: TextFitPreset = {
  maxFont: 86,
  minFont: 10,
  widthUsageRatio: 0.85,
  heightUsageRatio: 0.78,
  fontScale: 0.95,
  spacingRatio: 0.055,
};
const PRESET_BIG_MED: TextFitPreset = {
  maxFont: 82,
  minFont: 10,
  widthUsageRatio: 0.82,
  heightUsageRatio: 0.78,
  fontScale: 0.94,
  spacingRatio: 0.06,
};
const PRESET_DEFAULT: TextFitPreset = {
  maxFont: 76,
  minFont: 8,
  widthUsageRatio: 0.76,
  heightUsageRatio: 0.76,
  fontScale: 0.92,
  spacingRatio: 0.075,
};

export function selectPreset(
  boxWidth: number,
  boxHeight: number,
  charCount: number,
): TextFitPreset {
  const isBigBox =
    boxWidth >= 150 && boxHeight >= 130 && boxWidth * boxHeight >= 30000;
  if (isBigBox && charCount <= 28) return PRESET_BIG_SHORT;
  if (isBigBox && charCount <= 55) return PRESET_BIG_MED;
  return PRESET_DEFAULT;
}

// ── Word wrap (horizontal) ──

const CJK_RE = /[\u3000-\u9fff\uf900-\ufaff\uff00-\uffef]/;

/** Split a word longer than maxWidth at hyphens into tokens */
function splitLongWord(
  word: string,
  size: number,
  typo: Typography,
  maxWidth: number,
): string[] {
  if (measureLineWidth(word, size, typo) <= maxWidth) return [word];
  const hyphenIdx = word.indexOf("-");
  if (hyphenIdx === -1 || hyphenIdx === word.length - 1) return [word];
  const head = word.slice(0, hyphenIdx + 1); // keep hyphen on token
  const rest = splitLongWord(word.slice(hyphenIdx + 1), size, typo, maxWidth);
  return [head, ...rest];
}

export function wordWrap(
  text: string,
  size: number,
  typo: Typography,
  maxWidth: number,
): string[] {
  // No spaces + CJK → wrap per character
  if (!/\s/.test(text) && CJK_RE.test(text)) {
    return Array.from(text);
  }
  const lines: string[] = [];
  for (const para of text.split("\n")) {
    let current = "";
    for (const rawWord of para.split(/\s+/)) {
      if (!rawWord) continue;
      for (const word of splitLongWord(rawWord, size, typo, maxWidth)) {
        const test = current ? current + " " + word : word;
        if (measureLineWidth(test, size, typo) > maxWidth && current) {
          lines.push(current);
          current = word;
        } else {
          current = test;
        }
      }
    }
    lines.push(current);
  }
  return lines.length ? lines : [""];
}

// ── Horizontal variant ──

export function fitHorizontal(
  text: string,
  boxW: number,
  boxH: number,
  typo: Typography,
): TextFitResult {
  const chars = text.replace(/[\s\n]/g, "").length;
  const preset = selectPreset(boxW, boxH, chars);
  const maxW = boxW * preset.widthUsageRatio;
  const maxH = boxH * preset.heightUsageRatio;

  let bestSize = preset.minFont;
  let bestLines = wordWrap(text, preset.minFont, typo, maxW);
  let bestScore = -1;
  let status: FitStatus = "ok";
  let foundPerfect = false;

  for (let fs = preset.maxFont; fs >= preset.minFont; fs--) {
    const spacing = Math.max(1, fs * preset.spacingRatio);
    const wrapped = wordWrap(text, fs, typo, maxW);
    const m = measureMultiline(wrapped, fs, spacing, typo);

    if (m.w <= maxW && m.h <= maxH) {
      // Scenario A — perfect fit at this size: take it and stop
      const score = fs * 10 + m.w / maxW + m.h / maxH;
      if (score > bestScore) {
        bestScore = score;
        bestSize = fs;
        bestLines = wrapped;
        status = "ok";
        foundPerfect = true;
      }
      break;
    } else if (fs > bestSize * 1.5) {
      // Scenario B — tolerate up to 15% overflow while font stays large
      const overflow = Math.max(m.w / maxW, m.h / maxH);
      if (overflow <= 1.15) {
        const score = fs * 10 + m.w / maxW + m.h / maxH - overflow * 50;
        if (score > bestScore) {
          bestScore = score;
          bestSize = fs;
          bestLines = wrapped;
          status = "overflow-tolerated";
        }
      }
      // no break — smaller sizes may still score better via scenario A
    }
  }

  // Finalize with safety margin
  const finalSize = Math.max(
    preset.minFont,
    Math.floor(bestSize * preset.fontScale),
  );
  const finalSpacing = Math.max(1, Math.floor(finalSize * preset.spacingRatio));
  const finalWrap =
    foundPerfect || status === "overflow-tolerated"
      ? bestLines
      : wordWrap(text, finalSize, typo, maxW);
  const m = measureMultiline(finalWrap, finalSize, finalSpacing, typo);

  if (!foundPerfect && status !== "overflow-tolerated") {
    status = "forced-minimum";
  }

  return {
    fontSize: finalSize,
    wrappedText: finalWrap.join("\n"),
    textWidth: m.w,
    textHeight: m.h,
    fitStatus: status,
  };
}

// ── Vertical CJK variant ──

const JP_PUNCT = new Set(["。", "、", "."]);
const CHOOMPU = "ー";
const CHOOMPU_VERT = "\uFE31"; // ︱ vertical form

function chunkText(text: string, chunkSize: number): string[][] {
  const cols: string[][] = [];
  for (let i = 0; i < text.length; i += chunkSize) {
    cols.push(Array.from(text.slice(i, i + chunkSize)));
  }
  return cols;
}

export function fitVerticalCjk(
  text: string,
  boxW: number,
  boxH: number,
): TextFitResult {
  const clean = text.replace(/[\s\n]/g, "");
  const preset = selectPreset(boxW, boxH, clean.length);
  const maxW = boxW * preset.widthUsageRatio;
  const maxH = boxH * preset.heightUsageRatio;

  let bestSize = 0;
  let bestCols: string[][] | null = null;
  let status: FitStatus = "ok";

  for (let fs = preset.maxFont; fs >= preset.minFont; fs--) {
    const perCol = Math.max(1, Math.floor(maxH / fs));
    const cols = chunkText(clean, perCol);
    if (cols.length * fs <= maxW) {
      bestSize = fs;
      bestCols = cols;
      break;
    }
  }

  // Fallback with overflow tolerance (Lumina improvement over cypy):
  // try larger-than-minimum sizes allowing ≤15% width overflow first.
  if (!bestCols) {
    for (let fs = preset.maxFont; fs >= preset.minFont; fs--) {
      const perCol = Math.max(1, Math.floor(maxH / fs));
      const cols = chunkText(clean, perCol);
      const totalW = cols.length * fs;
      if (totalW <= maxW * 1.15) {
        bestSize = fs;
        bestCols = cols;
        status = "overflow-tolerated";
        break;
      }
    }
  }
  if (!bestCols) {
    const perCol = Math.max(1, Math.floor(maxH / preset.minFont));
    bestCols = chunkText(clean, perCol);
    bestSize = preset.minFont;
    status = "forced-minimum";
  }

  const finalSize = Math.max(
    preset.minFont,
    Math.floor(bestSize * preset.fontScale),
  );
  const actualW = bestCols.length * finalSize;
  const actualH = Math.max(...bestCols.map((c) => c.length)) * finalSize;

  return {
    fontSize: finalSize,
    wrappedText: bestCols,
    textWidth: actualW,
    textHeight: actualH,
    fitStatus: status,
  };
}

/** Main entry — pick variant by content */
export function fitTextToBox(
  text: string,
  boxWidth: number,
  boxHeight: number,
  typo: Typography,
): TextFitResult & { variant: "horizontal" | "vertical-cjk" } {
  const hasCjk = CJK_RE.test(text);
  const noSpaces = !/\s/.test(text.replace(/\n/g, ""));
  if (hasCjk && noSpaces) {
    return Object.assign(fitVerticalCjk(text, boxWidth, boxHeight), {
      variant: "vertical-cjk" as const,
    });
  }
  return Object.assign(fitHorizontal(text, boxWidth, boxHeight, typo), {
    variant: "horizontal" as const,
  });
}
