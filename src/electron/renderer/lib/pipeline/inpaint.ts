/* ── Lumina Pipeline — Inpainting (LaMa via Python backend) ──
 * The backend returns one RGBA patch per detection box; each patch becomes
 * an independent mask layer (Photoshop-style) composited over the original
 * image. The renderer no longer swaps to a single cleaned image.
 */
import { state } from "../state";
import * as i18n from "../i18n";
import { ui } from "../ui";
import { history } from "../history";
import { canvas } from "../canvas/index";
import { sidebar } from "../sidebar";
import type { BBox, InpaintMask } from "../../types";

/** Convert a Windows path to a loadable file:// URL */
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
      reject(new Error("Failed to load patch image: " + p));
    };
    img.src = fileUrl(p);
  });
}

export const inpaint = {
  /** Inpaint all text detection boxes of the active page → mask layers */
  run: async function (): Promise<void> {
    const page = state.getActivePage();
    if (state.isRunning || !page) return;
    if (!page.textDetections.length) {
      ui.toast(i18n.t("toast.inpaintNoText"), "warn");
      return;
    }
    state.isRunning = true;

    const loadingToast = ui.toast(i18n.t("toast.inpaintRunning"), "running", 0);

    try {
      const result = await window.lumina.apiPost<{
        patches?: Array<{ bbox: BBox; imagePath: string }>;
        detail?: string;
      }>("/inpaint", {
        imagePath: page.filePath,
        boxes: page.textDetections.map((d) => d.bbox),
        model: "lama",
      });
      if (!result || !Array.isArray(result.patches))
        throw new Error(result?.detail || "Inpaint failed");

      const ts = Date.now();
      const masks: InpaintMask[] = [];
      for (let i = 0; i < result.patches.length; i++) {
        const p = result.patches[i];
        const image = await loadImage(p.imagePath);
        masks.push({
          id: "mask-" + ts + "-" + i,
          bbox: p.bbox,
          imagePath: p.imagePath,
          visible: true,
          opacity: 1,
          image,
        });
      }

      // Replace previous masks (re-run = fresh set of patches).
      // Detection boxes stay in the page model but are no longer drawn —
      // see render.ts (overlays only while masks.length === 0).
      page.inpaintMasks = masks;

      canvas.render();
      sidebar.render();
      history.snapshot();
      ui.dismissToast(loadingToast);
      ui.toast(
        i18n.t("toast.inpaintDone", { count: masks.length }),
        "success",
        3000,
      );
    } catch (err) {
      console.error("Inpaint error:", err);
      ui.dismissToast(loadingToast);
      ui.toast(
        (err as Error).message || i18n.t("toast.inpaintFailed"),
        "error",
      );
    } finally {
      state.isRunning = false;
    }
  },
};
