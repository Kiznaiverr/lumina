import { app, BrowserWindow, Menu, ipcMain } from "electron";
import * as path from "path";
import { IPC } from "../shared/bridge";
import {
  spawnPythonBackend,
  stopPythonBackend,
  prepareCacheDir,
} from "./backend";
import { registerIpcHandlers } from "./pipeline";
import { registerSecretHandlers, registerConfigHandlers } from "./storage";
import { registerProjectIpc, isLumiFileArg } from "./project";
import { registerExportIpc } from "./export";
import { registerTempCacheIpc } from "./tempCache";
import { registerUpdaterIpc } from "./updater";
import { registerRecentsIpc } from "./recents";
import { MAIN_DIR } from "./paths";

let mainWindow: BrowserWindow | null = null;
/** Set once the renderer approved closing — skips the unsaved-changes check */
let _allowClose = false;
/** First .lmi path passed at launch — pulled once by the renderer */
let _pendingOpenPath: string | null = null;

/** Finds a .lmi path in a command-line arg list (skips flags/values). */
function _findLumiPath(args: string[]): string | null {
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (!a || a.startsWith("-")) continue;
    // "--flag=value" style
    if (a.startsWith("--") && a.includes("=")) continue;
    if (isLumiFileArg(a)) return a;
  }
  return null;
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: "Lumina",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(MAIN_DIR, "../preload/preload.cjs"),
    },
  });

  // dist/main/main.js → ../renderer/index.html (same layout in dev and asar)
  mainWindow.loadFile(path.join(MAIN_DIR, "../renderer/index.html"));

  registerIpcHandlers(mainWindow);
  registerSecretHandlers();
  registerConfigHandlers();
  registerProjectIpc();
  registerExportIpc();
  registerTempCacheIpc();
  registerUpdaterIpc(mainWindow);
  registerRecentsIpc();

  // First .lmi path at launch — pulled once by the renderer
  ipcMain.removeHandler(IPC.pendingOpenPath);
  ipcMain.handle(IPC.pendingOpenPath, () => _pendingOpenPath);

  // Ask the renderer to confirm unsaved changes before closing (Photoshop-style).
  ipcMain.removeHandler(IPC.confirmClose);
  ipcMain.handle(IPC.confirmClose, (_e, ok: boolean) => {
    _allowClose = !!ok;
    if (_allowClose && mainWindow) mainWindow.close();
  });

  mainWindow.on("close", (e) => {
    if (_allowClose) return;
    const wc = mainWindow?.webContents;
    // Startup guard — no renderer listener yet, so just let it close.
    if (!wc || wc.isLoading()) return;
    e.preventDefault();
    wc.send(IPC.requestCloseCheck);
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
    _allowClose = false;
  });
}

app.whenReady().then(async () => {
  // Remove default Electron menu bar (File/Edit/View...)
  Menu.setApplicationMenu(null);

  // Single-instance: a second launch forwards its .lmi path to this window.
  const gotLock = app.requestSingleInstanceLock();
  if (!gotLock) {
    app.quit();
    return;
  }
  app.on("second-instance", (_e, argv) => {
    const p = _findLumiPath(argv);
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
      if (p) mainWindow.webContents.send(IPC.openProjectRequest, p);
    } else if (p) {
      _pendingOpenPath = p;
    }
  });

  // First launch with a .lmi file → open it once the window is ready
  _pendingOpenPath = _findLumiPath(process.argv.slice(1));

  prepareCacheDir();
  await spawnPythonBackend();
  createWindow();
});

app.on("window-all-closed", () => {
  stopPythonBackend();
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
