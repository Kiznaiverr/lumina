/* ── Lumina Pipeline — OCR (manga-ocr via Python backend) ── */
import { state } from "../state";
import * as i18n from "../i18n";
import { ui } from "../ui";
import { history } from "../history";
import { canvas } from "../canvas/index";
import { sidebar } from "../sidebar";
import type { OcrResult } from "../../types";

export const ocr = {
  /** Run OCR on all text detections of the active page */
  run: async function (): Promise<void> {
    const page = state.getActivePage();
    if (state.isRunning || !page) return;
    if (!page.textDetections.length) {
      ui.toast(i18n.t("toast.ocrNoText"), "warn");
      return;
    }
    state.isRunning = true;

    const btn = document.getElementById("btn-ocr") as HTMLButtonElement | null;
    if (btn) btn.disabled = true;

    const loadingToast = ui.toast(i18n.t("toast.ocrRunning"), "running", 0);

    try {
      const result = await window.lumina.apiPost<{
        results?: OcrResult[];
        detail?: string;
      }>("/ocr", {
        imagePath: page.filePath,
        boxes: page.textDetections.map((d) => d.bbox),
      });
      if (!result || !result.results)
        throw new Error(result?.detail || "OCR failed");

      (result.results || []).forEach(function (r) {
        const det = page.textDetections[r.index];
        if (det) det.text = r.text;
        // Mirror into the unified layer model
        const layer = page.layers[r.index];
        if (layer && layer.type === "text-dialogue") layer.source = r.text;
      });

      canvas.render();
      sidebar.render();
      history.snapshot();
      ui.dismissToast(loadingToast);
      ui.toast(
        i18n.t("toast.ocrDone", { count: (result.results || []).length }),
        "success",
        3000,
      );
    } catch (err) {
      console.error("OCR error:", err);
      ui.dismissToast(loadingToast);
      ui.toast((err as Error).message || i18n.t("toast.ocrFailed"), "error");
    } finally {
      state.isRunning = false;
      const btn2 = document.getElementById(
        "btn-ocr",
      ) as HTMLButtonElement | null;
      if (btn2) btn2.disabled = false;
    }
  },
};
