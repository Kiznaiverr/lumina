/* ── Export preview: zoom, pan, and canvas drawing. ── */

import { st, ZOOM_MAX, ZOOM_MIN, ZOOM_STEP } from "./state";
import { renderPageToCanvas } from "./render";

/** Draw the current page image into the canvas at (dw, dh) backing pixels. */
function drawPreview(dw: number, dh: number): void {
  if (!st.previewCanvas || !st.previewCtx || !st.previewImg) return;
  st.previewCanvas.width = dw;
  st.previewCanvas.height = dh;
  st.previewCtx.imageSmoothingEnabled = true;
  st.previewCtx.imageSmoothingQuality = "high";
  st.previewCtx.drawImage(st.previewImg, 0, 0, dw, dh);
}

/** Place the canvas so the image stays centered while fit, or clamped while zoomed. */
export function positionCanvas(): void {
  if (!st.previewHost || !st.previewCanvas) return;
  const w = st.previewHost.clientWidth;
  const h = st.previewHost.clientHeight;
  const dw = st.previewCanvas.width;
  const dh = st.previewCanvas.height;
  let offX = (w - dw) / 2 + st.panX;
  let offY = (h - dh) / 2 + st.panY;
  if (dw <= w) offX = (w - dw) / 2;
  else offX = Math.max(w - dw, Math.min(0, offX));
  if (dh <= h) offY = (h - dh) / 2;
  else offY = Math.max(h - dh, Math.min(0, offY));
  st.panX = offX - (w - dw) / 2;
  st.panY = offY - (h - dh) / 2;
  st.previewCanvas.style.left = offX + "px";
  st.previewCanvas.style.top = offY + "px";
  st.previewHost.classList.toggle("zoom-pan", st.zoom > 1.001);
}

function updateZoomLabel(): void {
  const val = document.getElementById("export-zoom-val");
  if (!val || !st.previewImg || !st.previewCanvas) return;
  val.textContent =
    Math.round((st.previewCanvas.width / st.previewImg.width) * 100) + "%";
}

/** Redraw the preview canvas to fit the host, honoring the current zoom. */
export function fitPreview(): void {
  if (!st.previewHost || !st.previewCanvas || !st.previewImg) return;
  const rect = st.previewHost.getBoundingClientRect();
  const w = rect.width;
  const h = rect.height;
  const iw = st.previewImg.width;
  const ih = st.previewImg.height;
  if (!w || !h || !iw || !ih) return;
  const scale = Math.min(w / iw, h / ih) * 0.97 * st.zoom;
  drawPreview(
    Math.max(1, Math.floor(iw * scale)),
    Math.max(1, Math.floor(ih * scale)),
  );
  positionCanvas();
  updateZoomLabel();
}

/** Zoom by `factor`, keeping the image point under (cx, cy) stationary. */
export function zoomAt(cx: number, cy: number, factor: number): void {
  if (!st.previewHost || !st.previewCanvas || !st.previewImg) return;
  const next = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, st.zoom * factor));
  if (next === st.zoom) return;
  const rect = st.previewHost.getBoundingClientRect();
  const hx = cx - rect.left;
  const hy = cy - rect.top;
  const iw = st.previewImg.width;
  const ih = st.previewImg.height;
  const dw = st.previewCanvas.width;
  const dh = st.previewCanvas.height;
  if (!dw || !dh) return;
  // Image-space point currently under the cursor
  const offX = (rect.width - dw) / 2 + st.panX;
  const offY = (rect.height - dh) / 2 + st.panY;
  const ix = (hx - offX) * (iw / dw);
  const iy = (hy - offY) * (ih / dh);
  st.zoom = next;
  fitPreview();
  // Re-anchor: the same image point must land back under the cursor
  const dw2 = st.previewCanvas.width;
  const dh2 = st.previewCanvas.height;
  st.panX = hx - (rect.width - dw2) / 2 - ix * (dw2 / iw);
  st.panY = hy - (rect.height - dh2) / 2 - iy * (dh2 / ih);
  positionCanvas();
  updateZoomLabel();
}

export function resetZoom(): void {
  st.zoom = 1;
  st.panX = 0;
  st.panY = 0;
  fitPreview();
}

export async function renderPreview(): Promise<void> {
  const page = st.order[st.selIdx];
  const token = ++st.previewVersion;
  const busy = document.getElementById("export-preview-busy");
  const empty = document.getElementById("export-empty");
  if (!page) {
    st.previewImg = null;
    if (st.previewCanvas) {
      st.previewCanvas.width = 0;
      st.previewCanvas.height = 0;
    }
    if (empty) empty.classList.remove("hidden");
    if (busy) busy.classList.add("hidden");
    return;
  }
  if (empty) empty.classList.add("hidden");
  if (busy) busy.classList.remove("hidden");
  try {
    await document.fonts.ready;
    const img = await renderPageToCanvas(page);
    if (token !== st.previewVersion) return; // stale — user switched pages
    st.previewImg = img;
    fitPreview();
  } catch {
    // leave canvas empty; the info panel still describes the page
  } finally {
    if (token === st.previewVersion && busy) busy.classList.add("hidden");
  }
}
