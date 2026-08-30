/* ── Offscreen 1:1 page rendering for export. ── */

import Konva from "konva";
import { canvas } from "../canvas/index";
import { makeNode } from "../canvas/textool/nodeFactory";
import type { Page } from "../../types";
import { st } from "./state";

function fileUrl(p: string): string {
  let norm = p.replace(/\\/g, "/");
  if (!norm.startsWith("/")) norm = "/" + norm;
  return "file://" + encodeURI(norm).replace(/#/g, "%23").replace(/\?/g, "%3F");
}

function loadImage(p: string): Promise<HTMLImageElement> {
  return new Promise(function (resolve, reject) {
    const img = new Image();
    img.onload = function () {
      resolve(img);
    };
    img.onerror = function () {
      reject(new Error("Failed to load image: " + p));
    };
    img.src = fileUrl(p);
  });
}

/** Saved projects don't carry the decoded mask images — reload them. */
export async function ensureMaskImages(page: Page): Promise<void> {
  for (const m of page.inpaintMasks) {
    if (m.image) continue;
    try {
      m.image = await loadImage(m.imagePath);
    } catch {
      m.image = undefined; // skip silently — nothing to composite anyway
    }
  }
}

function dataUrlToBytes(dataUrl: string): Uint8Array {
  const bin = atob(dataUrl.split(",")[1]);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return arr;
}

function fmtBytes(b: number): string {
  if (b >= 1024 * 1024 * 1024)
    return (b / (1024 * 1024 * 1024)).toFixed(2) + " GB";
  if (b >= 1024 * 1024) return (b / (1024 * 1024)).toFixed(1) + " MB";
  return Math.max(1, Math.round(b / 1024)) + " KB";
}

export function estSize(page: Page): string {
  const px = page.naturalWidth * page.naturalHeight;
  const bytes =
    st.format === "png" ? px * 2 : px * 3 * (0.08 + (st.quality / 100) * 0.25);
  return fmtBytes(bytes);
}

/** Composite one page at natural 1:1 into an offscreen canvas.
 * Mirrors canvas render order: background → inpaint masks → text layers. */
export async function renderPageToCanvas(
  page: Page,
): Promise<HTMLCanvasElement> {
  const host = document.createElement("div");
  host.style.cssText =
    "position:fixed;left:-10000px;top:0;width:1px;height:1px;overflow:hidden;";
  document.body.appendChild(host);
  const stage = new Konva.Stage({
    container: host,
    width: page.naturalWidth,
    height: page.naturalHeight,
  });
  const layer = new Konva.Layer();
  stage.add(layer);

  if (page.backgroundVisible !== false) {
    layer.add(
      new Konva.Image({
        image: page.image,
        x: 0,
        y: 0,
        width: page.naturalWidth,
        height: page.naturalHeight,
      }),
    );
  }

  for (const m of page.inpaintMasks) {
    if (!m.visible || !m.image) continue;
    layer.add(
      new Konva.Image({
        image: m.image,
        x: m.bbox.x,
        y: m.bbox.y,
        width: m.bbox.w,
        height: m.bbox.h,
        opacity: m.opacity,
      }),
    );
  }

  // makeNode()/imgToStage() read the live screen scale/offset — pin them to
  // natural space (sr=1, offset 0) so text lands pixel-identical to the editor.
  const origSr = canvas.getScaleRatio;
  const origOff = canvas.getOffset;
  canvas.getScaleRatio = function () {
    return 1;
  };
  canvas.getOffset = function () {
    return { x: 0, y: 0 };
  };
  try {
    for (const lay of page.layers) {
      if (!lay.visible) continue;
      // Dialogue text only renders after inpainting — same rule as the editor.
      if (lay.type === "text-dialogue" && page.inpaintMasks.length === 0) {
        continue;
      }
      const text = lay.translation || lay.source || "";
      if (!text) continue;
      layer.add(makeNode(lay, text));
    }
  } finally {
    canvas.getScaleRatio = origSr;
    canvas.getOffset = origOff;
  }
  layer.draw();

  const out = stage.toCanvas();
  stage.destroy();
  host.remove();
  return out;
}

/** Encode one rendered page as PNG or JPEG bytes. */
export async function renderPage(
  page: Page,
  format: "png" | "jpg",
  quality: number,
): Promise<Uint8Array> {
  const c = await renderPageToCanvas(page);
  if (format === "png") {
    return dataUrlToBytes(c.toDataURL("image/png"));
  }
  // JPEG has no alpha — composite over white like a flattened export.
  const jc = document.createElement("canvas");
  jc.width = page.naturalWidth;
  jc.height = page.naturalHeight;
  const ctx = jc.getContext("2d") as CanvasRenderingContext2D;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, jc.width, jc.height);
  ctx.drawImage(c, 0, 0);
  return dataUrlToBytes(jc.toDataURL("image/jpeg", quality / 100));
}
