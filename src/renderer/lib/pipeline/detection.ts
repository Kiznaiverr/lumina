/* ── Lumina Pipeline — Detection ── */
import { state } from "../state";
import * as i18n from "../i18n";
import { ui } from "../ui";
import { history } from "../history";
import { canvas } from "../canvas/index";
import { sidebar } from "../sidebar";
import { models } from "../models";
import type { DetectResult, PageLayer, TextDetection } from "../../types";
import { sortReadingOrder } from "../readingOrder";
import { defaultTypography, loadGlobalTypography } from "../../types";

export const detection = {
  /** Run detection on active page */
  run: async function (): Promise<void> {
    const page = state.getActivePage();
    if (state.isRunning || !page) return;
    state.isRunning = true;

    const btn = document.getElementById(
      "btn-detect",
    ) as HTMLButtonElement | null;
    if (btn) {
      btn.disabled = true;
    }

    const isFirstRun = !state._modelLoaded;
    let loadingToast: ReturnType<typeof ui.toast> | null;
    if (isFirstRun) {
      loadingToast = ui.toast(i18n.t("toast.detectFirstRun"), "running", 0);
    } else {
      loadingToast = ui.toast(i18n.t("toast.detectRunning"), "running", 0);
    }

    try {
      const result = await window.lumina.apiPost<DetectResult>("/detect", {
        imagePath: page.filePath,
        model: models.selectedModel("detect") || "rtdetr",
      });
      if (!result || result.error)
        throw new Error(result?.detail || "Detection failed");

      // Sort into manga reading order (right→left, top→bottom) so T1..Tn
      // matches how a reader would encounter the text.
      const sortedTexts = sortReadingOrder(
        (result.textDetections || []).map(
          (d, i): TextDetection => ({
            id: "text-" + i,
            bbox: Object.assign({}, d.bbox),
            type: d.type,
            confidence: d.confidence || 0,
            status: "auto",
            textColor: d.textColor,
            textAngle: d.textAngle,
          }),
        ),
      );
      page.textDetections = sortedTexts;
      page.maskPath = result.maskPath ?? null;

      page._selectedTextIdx = null;

      // Sync text detections into the unified layer model (dialogue layers).
      // Free-text layers created by the user are preserved.
      const freeLayers = page.layers.filter(function (l) {
        return l.type === "text-free";
      });
      const dialogueLayers: PageLayer[] = sortedTexts.map(function (d, i) {
        return {
          id: "layer-t" + i,
          type: "text-dialogue" as const,
          bbox: Object.assign({}, d.bbox),
          source: d.text || "",
          translation: d.translated || "",
          // New dialogue layers inherit the global type defaults; the
          // detected glyph color + slant override the defaults when available.
          typography: Object.assign(
            defaultTypography(),
            loadGlobalTypography(),
            d.textColor ? { color: d.textColor } : {},
            typeof d.textAngle === "number" ? { rotation: d.textAngle } : {},
          ),
          visible: true,
          opacity: 1,
        };
      });
      page.layers = [...dialogueLayers, ...freeLayers];
      page._selectedLayerId = null;

      // Fresh boxes — make sure the overlay is visible.
      state.showDetBoxes = true;
      canvas._clearGroups();
      canvas.render();
      sidebar.render();

      state._modelLoaded = true;
      history.snapshot();
      ui.dismissToast(loadingToast);
      ui.toast(
        i18n.t("toast.detectDone", {
          texts: page.textDetections.length,
          bubbles: 0,
        }),
        "success",
        3000,
      );
    } catch (err) {
      console.error("Detection error:", err);
      if (err && (err as Error).stack) console.error((err as Error).stack);
      ui.dismissToast(loadingToast);
      ui.toast((err as Error).message || i18n.t("toast.detectFailed"), "error");
    } finally {
      state.isRunning = false;
      const btn2 = document.getElementById(
        "btn-detect",
      ) as HTMLButtonElement | null;
      if (btn2) btn2.disabled = false;
    }
  },

  /** Run detection on ALL pages */
  runAll: async function (): Promise<void> {
    if (state.isRunning || state.pages.length === 0) return;
    state.isRunning = true;

    for (let i = 0; i < state.pages.length; i++) {
      const page = state.pages[i];
      if (!page.filePath) continue;
      try {
        const result = await window.lumina.apiPost<DetectResult>("/detect", {
          imagePath: page.filePath,
          model: models.selectedModel("detect") || "rtdetr",
        });
        if (!result || result.error) continue;

        page.textDetections = (result.textDetections || []).map(
          (d, j): TextDetection => ({
            id: "text-" + j,
            bbox: Object.assign({}, d.bbox),
            type: d.type,
            confidence: d.confidence || 0,
            status: "auto",
          }),
        );
        page.maskPath = result.maskPath ?? null;
      } catch (err) {
        console.error("Detection error page " + (i + 1) + ":", err);
      }
    }

    state.isRunning = false;
    canvas._clearGroups();
    canvas.render();
    canvas.renderPageStrip();
    sidebar.render();
  },
};
