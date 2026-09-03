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
import { bindSelectTool } from "./lib/canvas/selectool";
import { loadSystemFonts } from "./lib/fontLoader";
import { createIcons } from "./lib/icons";
import { project, handleCloseRequest } from "./lib/project";
import * as exportModule from "./lib/export";
import * as autosave from "./lib/autosave";
import { isDirty, getSavePath, setDirtyListener } from "./lib/dirty";
import type { Page } from "./types";

const landing = document.getElementById("landing");

// ── Model check on startup (CHECK ONLY — downloads are manual) ──
function checkModels(): void {
  models.refreshDevice();
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
        backgroundVisible: true,
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
  project.markImportedDirty();
}

// ── Project dirty indicator (status bar + window title) ──
function updateDirtyUI(): void {
  const el = document.getElementById("status-project");
  const path = getSavePath();
  const name = path ? (path.split(/[\\/]/).pop() as string) : "";
  if (el) el.textContent = name ? (isDirty() ? name + " •" : name) : "";
  document.title = isDirty() ? "Lumina •" : "Lumina";

  const hasPages = L.state.pages.length > 0;
  const saveBtn = document.getElementById("btn-save");
  const saveAsBtn = document.getElementById("btn-save-as");
  const exportBtn = document.getElementById("btn-export");
  const exportAllBtn = document.getElementById("btn-export-all");
  if (saveBtn) (saveBtn as HTMLButtonElement).disabled = !hasPages;
  if (saveAsBtn) (saveAsBtn as HTMLButtonElement).disabled = !hasPages;
  if (exportBtn) (exportBtn as HTMLButtonElement).disabled = !hasPages;
  if (exportAllBtn) (exportAllBtn as HTMLButtonElement).disabled = !hasPages;
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
  document.getElementById("btn-open")!.addEventListener("click", function () {
    project.open();
  });
  document
    .getElementById("btn-open-landing")!
    .addEventListener("click", function () {
      project.open();
    });
  document.getElementById("btn-save")!.addEventListener("click", function () {
    project.save();
  });
  document
    .getElementById("btn-save-as")!
    .addEventListener("click", function () {
      project.saveAs();
    });
  document.getElementById("btn-export")!.addEventListener("click", function () {
    exportModule.open();
  });
  document
    .getElementById("btn-export-all")!
    .addEventListener("click", function () {
      exportModule.openAll();
    });

  // ── Auto-update: show an update button when a newer published version
  //    exists. Click → download (progress reuses the model-download bar),
  //    click again once downloaded → install & relaunch.
  const btnUpdate = document.getElementById("btn-update");
  const updateIcon = btnUpdate?.querySelector("i[data-lucide]");
  const badge = btnUpdate?.querySelector("span");
  let updateToast: HTMLElement | null = null;
  let updateState:
    | "checking"
    | "available"
    | "downloading"
    | "downloaded"
    | "error" = "checking";

  function setUpdateIcon(name: string): void {
    if (updateIcon) {
      updateIcon.setAttribute("data-lucide", name);
      updateIcon.className = "w-3 h-3";
    }
    if (createIcons)
      createIcons({
        nameAttr: "data-lucide",
        attrs: {},
        root: btnUpdate as HTMLElement,
      });
  }

  function setUpdateButton(state: typeof updateState, title: string): void {
    updateState = state;
    if (!btnUpdate) return;
    btnUpdate.hidden = state === "checking";
    if (title) btnUpdate.title = title;
    if (badge) badge.hidden = state !== "available" && state !== "downloaded";
    if (state === "downloading") setUpdateIcon("loader-2");
    else if (state === "downloaded") setUpdateIcon("download");
    else if (state === "error") setUpdateIcon("alert-triangle");
    else setUpdateIcon("cloud-download");
  }

  if (btnUpdate) {
    btnUpdate.addEventListener("click", function () {
      if (updateState === "downloaded") {
        void window.lumina.installUpdate();
      } else if (updateState === "available" || updateState === "error") {
        setUpdateButton("downloading", i18n.t("update.downloading"));
        updateToast = ui.downloadToast(i18n.t("update.downloading"));
        void window.lumina.downloadUpdate();
      }
    });
  }

  window.lumina.onUpdateProgress(function (p) {
    if (p.state === "downloading") {
      setUpdateButton("downloading", i18n.t("update.downloading"));
      if (!updateToast)
        updateToast = ui.downloadToast(i18n.t("update.downloading"));
      ui.updateDownloadToast(p.percent || 0, p.transferred || 0, p.total || 0);
    } else if (p.state === "downloaded") {
      if (updateToast) {
        ui.dismissToast(updateToast as never);
        updateToast = null;
      }
      const msg = i18n.t("update.downloaded", {
        version: p.version || "",
      });
      ui.toast(msg, "success", 6000);
      setUpdateButton(
        "downloaded",
        i18n.t("update.install", { version: p.version || "" }),
      );
    } else if (p.state === "error") {
      if (updateToast) {
        ui.dismissToast(updateToast as never);
        updateToast = null;
      }
      ui.toast(i18n.t("update.downloadError"), "error", 8000);
      setUpdateButton("error", i18n.t("update.retry"));
    }
  });

  window.lumina
    .checkForUpdates()
    .then(function (res) {
      if (!res.available) {
        setUpdateButton("checking", "");
        return;
      }
      setUpdateButton(
        "available",
        i18n.t("update.available", { version: res.latest || "" }),
      );
    })
    .catch(function () {
      setUpdateButton("checking", "");
    });

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
  autosave.start();
  // Photoshop-style unsaved-changes check before the window closes
  window.lumina.onRequestCloseCheck(function () {
    handleCloseRequest();
  });
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
  bindSelectTool();
  sidebar.render();

  setDirtyListener(updateDirtyUI);
  updateDirtyUI();

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

  // ── .lmi file association: open projects handed over by the OS ──
  // Second instance launched while the app is running → main pushes the path
  window.lumina.onOpenProjectRequest(function (p) {
    void project.open(p);
  });
  // First launch launched with a .lmi path → pull it once
  window.lumina
    .getPendingOpenPath()
    .then(function (p) {
      if (p) void project.open(p);
    })
    .catch(function () {});
});

// ── Language picker removed — interface language is set in Settings → General ──

document.addEventListener("click", function () {
  const dd = document.getElementById("lang-dropdown");
  if (dd) dd.classList.add("hidden");
});
