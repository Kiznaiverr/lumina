/* ── Lumina Renderer Entry Point ── */
import * as L from "./lib/state";
import * as i18n from "./lib/i18n";
import { ui } from "./lib/ui";
import { history } from "./lib/history";
import { shortcuts } from "./lib/shortcuts";
import { tools } from "./lib/tools";
import { pipeline } from "./lib/pipeline";
import { settings } from "./lib/settings";
import { models } from "./lib/models";
import { canvas } from "./lib/canvas/index";
import { sidebar } from "./lib/sidebar";
import { setRendererImport } from "./lib/canvas/pages";
// Side-effect imports: attach real implementations onto the `canvas`
// object. Must come AFTER canvas/index so `canvas` is initialized
// (importing them from inside canvas/index would hit a TDZ error).
import "./lib/canvas/render";
import "./lib/canvas/groups";
import "./lib/canvas/selection";
import "./lib/canvas/mutations";
import "./lib/canvas/layers";
import "./lib/canvas/masks";
import { bindTextTool } from "./lib/canvas/textool";
import { loadSystemFonts } from "./lib/fontLoader";
import { createIcons } from "./lib/icons";
import type { Page } from "./types";

const landing = document.getElementById("landing");

// ── Model check on startup (CHECK ONLY — downloads are manual) ──
function checkModels(): void {
  models.check().then(function (list) {
    if (list.length && list.some((m) => !m.ready)) {
      ui.toast(i18n.t("models.warning"), "warn", 6000);
    }
  });
}

// ── Load single image → create page ──
/** Convert a raw Windows/POSIX file path into a valid file:// URL */
function _toFileUrl(p: string): string {
  if (/^file:\/\//i.test(p)) return p;
  let norm = p.replace(/\\/g, "/");
  if (!norm.startsWith("/")) norm = "/" + norm; // drive letter → /D:/...
  // encodeURI handles spaces & non-ASCII but keeps # and ? — escape those
  return "file://" + encodeURI(norm).replace(/#/g, "%23").replace(/\?/g, "%3F");
}

function _loadImageAsPage(filePath: string): Promise<Page | null> {
  return new Promise(function (resolve) {
    const img = new Image();
    img.onload = function () {
      const page: Page = {
        filePath: filePath,
        fileName: filePath.split(/[/\\]/).pop() as string,
        image: img,
        naturalWidth: img.naturalWidth,
        naturalHeight: img.naturalHeight,
        textDetections: [],
        layers: [],
        inpaintMasks: [],
        _selectedTextIdx: null,
        _selectedLayerId: null,
        _selectedMaskId: null,
      };
      resolve(page);
    };
    img.onerror = function () {
      resolve(null);
    };
    img.src = _toFileUrl(filePath);
  });
}

// ── Import: single or multi ──
async function importImages(): Promise<void> {
  // Try multi-file import first
  let filePaths: string[] | null;
  try {
    filePaths = await window.lumina.importImages();
  } catch (e) {
    // Fallback: single file
    const single = await window.lumina.importImage();
    if (!single) return;
    filePaths = [single];
  }

  if (!filePaths || filePaths.length === 0) return;

  for (const fp of filePaths) {
    const page = await _loadImageAsPage(fp);
    if (page) {
      L.state.addPage(page);
    }
  }

  // Set active to first if none selected
  if (L.state.activePageIdx === null && L.state.pages.length > 0) {
    L.state.setActivePage(0);
  }

  landing!.style.display = "none";
  models.setHasImage(true);

  canvas._clearGroups();
  canvas.render();
  canvas.renderPageStrip();
  ui.updatePageIndicator();
  sidebar.render();
  history.reset();
}

// Expose for page strip "+" button
setRendererImport(importImages);

// ── Init modules ──
i18n.init().then(function () {
  // ── Wire buttons ──
  document
    .getElementById("btn-import-landing")!
    .addEventListener("click", importImages);
  document
    .getElementById("btn-import")!
    .addEventListener("click", importImages);

  document.getElementById("btn-detect")!.addEventListener("click", function () {
    pipeline.runDetection();
  });

  document.getElementById("btn-ocr")!.addEventListener("click", function () {
    pipeline.runOcr();
  });

  document
    .getElementById("btn-translate")!
    .addEventListener("click", function () {
      pipeline.runTranslate();
    });

  document
    .getElementById("btn-inpaint")!
    .addEventListener("click", function () {
      pipeline.runInpaint();
    });

  document
    .getElementById("btn-toggle-boxes")!
    .addEventListener("click", function () {
      L.state.showDetBoxes = !L.state.showDetBoxes;
      canvas.updateBoxToggle();
      canvas.render();
    });

  // ── Undo / Redo buttons ──
  document.getElementById("btn-undo")!.addEventListener("click", function () {
    history.undo();
  });
  document.getElementById("btn-redo")!.addEventListener("click", function () {
    history.redo();
  });

  // ── Settings modal ──
  shortcuts.init();
  shortcuts.bindGlobal();
  settings.init();
  document
    .getElementById("btn-settings")!
    .addEventListener("click", function () {
      settings.open();
    });
  // Warning shortcut → open Settings on the Models tab
  document.getElementById("btn-models")!.addEventListener("click", function () {
    settings.open("models");
  });

  tools.init();
  ui.initResize();
  canvas.initBindings();
  bindTextTool();
  sidebar.render();

  createIcons();

  // ── Load system fonts via IPC + register as FontFaces ──
  // Rebuild the sidebar afterwards so the font dropdown gets populated
  // (it renders before fonts arrive on first paint).
  loadSystemFonts()
    .then(function () {
      sidebar.render();
    })
    .catch(function () {});

  // ── Model check on startup ──
  setTimeout(checkModels, 1500);
});

// ── Language picker (globe + dropdown) ──
document.getElementById("btn-lang")!.addEventListener("click", function (e) {
  e.stopPropagation();
  const dd = document.getElementById("lang-dropdown");
  if (dd) dd.classList.toggle("hidden");
});
document.querySelectorAll<HTMLElement>(".lang-opt").forEach(function (opt) {
  opt.addEventListener("click", function () {
    i18n.setLang(this.dataset.lang as string);
    sidebar.render();
    canvas._updateStatus();
    if (shortcuts && shortcuts.updateHeaderTitles)
      shortcuts.updateHeaderTitles();
  });
});
document.addEventListener("click", function () {
  const dd = document.getElementById("lang-dropdown");
  if (dd) dd.classList.add("hidden");
});
