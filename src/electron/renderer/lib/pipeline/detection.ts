/* ── Lumina Pipeline — Detection ── */
import { state } from "../state";
import * as i18n from "../i18n";
import { ui } from "../ui";
import { history } from "../history";
import { canvas } from "../canvas/index";
import { sidebar } from "../sidebar";
import type { BubbleDetection, DetectResult, TextDetection } from "../../types";
import { sortReadingOrder } from "../readingOrder";

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
          }),
        ),
      );
      page.textDetections = sortedTexts;

      const sortedBubbles = sortReadingOrder(
        (result.bubbleDetections || []).map(
          (d, i): BubbleDetection => ({
            id: "bubble-" + i,
            bbox: Object.assign({}, d.bbox),
            confidence: d.confidence || 0,
            status: "auto",
          }),
        ),
      );
      page.bubbleDetections = sortedBubbles;

      page._selectedTextIdx = null;
      page._selectedBubbleIdx = null;

      canvas._clearGroups();
      canvas.render();
      sidebar.render();

      state._modelLoaded = true;
      history.snapshot();
      ui.dismissToast(loadingToast);
      ui.toast(
        i18n.t("toast.detectDone", {
          texts: page.textDetections.length,
          bubbles: page.bubbleDetections.length,
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
        page.bubbleDetections = (result.bubbleDetections || []).map(
          (d, j): BubbleDetection => ({
            id: "bubble-" + j,
            bbox: Object.assign({}, d.bbox),
            confidence: d.confidence || 0,
            status: "auto",
          }),
        );
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
