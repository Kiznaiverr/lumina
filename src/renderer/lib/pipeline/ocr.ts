/* ── Lumina Pipeline — OCR (manga-ocr via Python backend) ── */
import { state } from "../state";
import * as i18n from "../i18n";
import { ui } from "../ui";
import { history } from "../history";
import { canvas } from "../canvas/index";
import { sidebar } from "../sidebar";
import { models } from "../models";
import { normalizeAutoText } from "./textNorm";
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
        model: models.selectedModel("ocr") || "manga_ocr",
      });
      if (!result || !result.results)
        throw new Error(result?.detail || "OCR failed");

      (result.results || []).forEach(function (r) {
        const text = normalizeAutoText(r.text || "");
        const det = page.textDetections[r.index];
        if (det) det.text = text;
        // Mirror into the unified layer model
        const layer = page.layers[r.index];
        if (layer && layer.type === "text-dialogue") layer.source = text;
      });

      // Boxes stay visible after OCR (toggle in the header) — they only
      // disappear once inpainting produces masks.
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

  /** Run OCR on a subset of text detections (by index) — used by the box
   * context menu's "re-OCR" to re-run recognition on one box. Same endpoint
   * + layer mapping as run(); `modelId` overrides the selected OCR model. */
  runBoxes: async function (
    indices: number[],
    modelId?: string,
  ): Promise<void> {
    const page = state.getActivePage();
    if (!page || !indices.length || state.isRunning) return;
    const boxes = indices
      .map(function (i) {
        return page.textDetections[i];
      })
      .filter(Boolean)
      .map(function (d) {
        return d.bbox;
      });
    if (!boxes.length) return;

    // Snapshot of which detections we're OCR-ing so a mid-flight undo/redo
    // can't write text onto different boxes that now occupy those indices.
    const expectedIds = indices
      .map(function (i) {
        return page.textDetections[i]?.id;
      })
      .filter(Boolean);

    state.isRunning = true;
    const loadingToast = ui.toast(
      i18n.t("toast.ocrRunning", { count: boxes.length }),
      "running",
      0,
    );

    try {
      const result = await window.lumina.apiPost<{
        results?: OcrResult[];
        detail?: string;
      }>("/ocr", {
        imagePath: page.filePath,
        boxes: boxes,
        model: modelId || models.selectedModel("ocr") || "manga_ocr",
      });
      if (!result || !result.results)
        throw new Error(result?.detail || "OCR failed");

      // Backend indexes results by request position — map back through the
      // original detection indices. Skip if the boxes changed under us.
      let intact = true;
      (result.results || []).forEach(function (r, k) {
        if (!intact) return;
        const k2 = typeof r.index === "number" ? r.index : k;
        const det = page.textDetections[indices[k2]];
        if (!det || det.id !== expectedIds[k2]) {
          intact = false;
          return;
        }
        det.text = normalizeAutoText(r.text || "");
        const layer = page.layers[indices[k2]];
        if (layer && layer.type === "text-dialogue")
          layer.source = normalizeAutoText(r.text || "");
      });

      canvas.render();
      sidebar.render();
      // Standalone edit — its own undo step restores the previous text.
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
    }
  },
};
