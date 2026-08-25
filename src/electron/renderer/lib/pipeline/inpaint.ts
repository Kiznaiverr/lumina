/* ── Lumina Pipeline — Inpainting (LaMa via Python backend) ── */
import { state } from "../state";
import * as i18n from "../i18n";
import { ui } from "../ui";
import { history } from "../history";
import { canvas } from "../canvas/index";
import { sidebar } from "../sidebar";

export const inpaint = {
  /** Inpaint all text detection boxes of the active page */
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
        outputPath?: string;
        detail?: string;
      }>("/inpaint", {
        imagePath: page.filePath,
        boxes: page.textDetections.map((d) => d.bbox),
      });
      if (!result || !result.outputPath)
        throw new Error(result?.detail || "Inpaint failed");

      // Load the cleaned image and attach to the page
      const outPath = result.outputPath;
      const img = new Image();
      await new Promise<void>(function (resolve, reject) {
        img.onload = function () {
          resolve();
        };
        img.onerror = function () {
          reject(new Error("Failed to load cleaned image"));
        };
        img.src = "file://" + (outPath as string).replace(/\\/g, "/");
      });

      page.cleanedImage = img;

      // Reveal the Original/Cleaned toggle and jump to cleaned view so the
      // user immediately sees the inpaint result.
      canvas.updateViewToggle();
      canvas.setViewMode("cleaned");
      sidebar.render();
      history.snapshot();
      ui.dismissToast(loadingToast);
      ui.toast(i18n.t("toast.inpaintDone"), "success", 3000);
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
