/* ── Lumina project save/open (.lmi = zip) ──
 * Save: bundle project.json + a copy of every source image + every inpaint
 * patch PNG into one zip. Open: extract to a session temp dir (patches are
 * runtime artifacts — they already live in the temp cache dir) and return
 * rewritten absolute paths so the renderer can load pages exactly like an
 * import.
 */
import { dialog, BrowserWindow, ipcMain } from "electron";
import type { IpcMainInvokeEvent } from "electron";
import fs from "fs";
import os from "os";
import path from "path";
import {
  IPC,
  type DiscardChoice,
  type OpenProjectResult,
  type ProjectPageData,
  type ProjectSavePayload,
  type ProjectSaveResult,
} from "../shared/bridge";
import { zipRead, zipWrite } from "./zip";

/** Session extraction root — wiped with the rest of the cache on app close */
const EXTRACT_ROOT = path.join(os.tmpdir(), "lumina");

function _window(event: IpcMainInvokeEvent): BrowserWindow | undefined {
  return BrowserWindow.fromWebContents(event.sender) ?? undefined;
}

function _ext(name: string): string {
  const e = path.extname(name);
  return e && e.length <= 5 ? e : ".png";
}

async function _handleSave(
  event: IpcMainInvokeEvent,
  payload: ProjectSavePayload,
): Promise<ProjectSaveResult> {
  let savePath = payload.savePath;
  if (!savePath) {
    const res = await dialog.showSaveDialog(_window(event)!, {
      title: "Save Project",
      defaultPath: "project.lmi",
      filters: [{ name: "Lumina Project", extensions: ["lmi"] }],
    });
    if (res.canceled || !res.filePath) return { path: null, canceled: true };
    savePath = res.filePath;
  }
  if (!savePath.toLowerCase().endsWith(".lmi")) savePath += ".lmi";

  const pages = payload.project.pages;
  const zipPages = pages.map((p, i) => {
    const imageEntry = `pages/${String(i).padStart(3, "0")}${_ext(p.fileName)}`;
    return {
      fileName: p.fileName,
      naturalWidth: p.naturalWidth,
      naturalHeight: p.naturalHeight,
      textDetections: p.textDetections,
      layers: p.layers,
      backgroundVisible: p.backgroundVisible,
      _zoomLevel: p._zoomLevel,
      _panX: p._panX,
      _panY: p._panY,
      imageEntry,
      inpaintMasks: p.inpaintMasks.map((m, j) => ({
        id: m.id,
        bbox: m.bbox,
        visible: m.visible,
        opacity: m.opacity,
        imageEntry: `patches/${String(i).padStart(3, "0")}-${String(j).padStart(3, "0")}.png`,
      })),
    };
  });

  const entries: { name: string; data: Buffer }[] = [
    {
      name: "project.json",
      data: Buffer.from(
        JSON.stringify(
          {
            version: 1,
            activePageIdx: payload.project.activePageIdx,
            settings: payload.project.settings,
            pages: zipPages,
          },
          null,
          2,
        ),
        "utf-8",
      ),
    },
  ];
  pages.forEach((p, i) => {
    try {
      entries.push({
        name: `pages/${String(i).padStart(3, "0")}${_ext(p.fileName)}`,
        data: fs.readFileSync(p.filePath),
      });
    } catch {
      console.warn(`[Lumina] Skipping missing source image: ${p.filePath}`);
    }
    p.inpaintMasks.forEach((m, j) => {
      try {
        entries.push({
          name: `patches/${String(i).padStart(3, "0")}-${String(j).padStart(3, "0")}.png`,
          data: fs.readFileSync(m.imagePath),
        });
      } catch {
        console.warn(`[Lumina] Skipping missing patch: ${m.imagePath}`);
      }
    });
  });

  fs.writeFileSync(savePath, zipWrite(entries));
  console.log(
    `[Lumina] Project saved: ${savePath} (${pages.length} page(s), ${entries.length} file(s))`,
  );
  return { path: savePath, canceled: false };
}

async function _handleOpen(
  event: IpcMainInvokeEvent,
  explicitPath?: string,
): Promise<OpenProjectResult | null> {
  let zipPath = explicitPath;
  if (!zipPath) {
    const res = await dialog.showOpenDialog(_window(event)!, {
      title: "Open Project",
      properties: ["openFile"],
      filters: [{ name: "Lumina Project", extensions: ["lmi"] }],
    });
    if (res.canceled || !res.filePaths[0]) return null;
    zipPath = res.filePaths[0];
  }

  const entries = zipRead(fs.readFileSync(zipPath));
  const raw = entries.get("project.json");
  if (!raw) throw new Error("Invalid project file: missing project.json");
  const proj = JSON.parse(raw.toString("utf-8"));
  if (proj.version !== 1) {
    throw new Error(`Unsupported project version: ${proj.version}`);
  }

  // Extract into a fresh session dir (existing open-* dirs get wiped on
  // app close with the rest of the temp cache).
  const extractDir = path.join(EXTRACT_ROOT, `open-${Date.now()}`);
  fs.mkdirSync(path.join(extractDir, "pages"), { recursive: true });
  fs.mkdirSync(path.join(extractDir, "patches"), { recursive: true });
  for (const [name, data] of entries) {
    if (name === "project.json") continue;
    const dest = path.join(extractDir, name);
    const rel = path.relative(extractDir, dest);
    if (rel.startsWith("..") || path.isAbsolute(rel)) {
      throw new Error(`Unsafe entry name in project file: ${name}`);
    }
    fs.writeFileSync(dest, data);
  }

  const pages: ProjectPageData[] = (proj.pages as any[]).map((p) => {
    const { imageEntry, inpaintMasks, ...rest } = p;
    return {
      ...rest,
      filePath: path.join(extractDir, imageEntry as string),
      inpaintMasks: (inpaintMasks || []).map((m: any) => ({
        id: m.id,
        bbox: m.bbox,
        visible: m.visible,
        opacity: m.opacity,
        imagePath: path.join(extractDir, m.imageEntry as string),
      })),
    };
  });

  console.log(`[Lumina] Project opened: ${zipPath} (${pages.length} page(s))`);
  return {
    projectPath: zipPath,
    activePageIdx: proj.activePageIdx,
    settings: proj.settings,
    pages,
  };
}

async function _handleConfirmDiscard(
  event: IpcMainInvokeEvent,
  message: string,
): Promise<DiscardChoice> {
  const res = await dialog.showMessageBox(_window(event)!, {
    type: "warning",
    buttons: ["Save", "Don't Save", "Cancel"],
    defaultId: 0,
    cancelId: 2,
    noLink: true,
    message: "Unsaved changes",
    detail: message,
  });
  return res.response === 0
    ? "save"
    : res.response === 1
      ? "discard"
      : "cancel";
}

export function registerProjectIpc(): void {
  // removeHandler first — createWindow() may run again (macOS activate)
  ipcMain.removeHandler(IPC.saveProject);
  ipcMain.removeHandler(IPC.openProject);
  ipcMain.removeHandler(IPC.confirmDiscard);
  ipcMain.handle(IPC.saveProject, _handleSave);
  ipcMain.handle(IPC.openProject, _handleOpen);
  ipcMain.handle(IPC.confirmDiscard, _handleConfirmDiscard);
}

/** True when the given arg is a real .lmi file path (not a flag/value). */
export function isLumiFileArg(arg: string): boolean {
  return !!arg && arg.trim().toLowerCase().endsWith(".lmi");
}
