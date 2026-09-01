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
import { registerProjectIpc } from "./project";
import { registerExportIpc } from "./export";
import { MAIN_DIR, PROJECT_ROOT } from "./paths";

let mainWindow: BrowserWindow | null = null;
/** Set once the renderer approved closing — skips the unsaved-changes check */
let _allowClose = false;

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

  // From dist/main/main.js → repo root → src/renderer/index.html
  mainWindow.loadFile(path.join(PROJECT_ROOT, "src/renderer/index.html"));

  registerIpcHandlers(mainWindow);
  registerSecretHandlers();
  registerConfigHandlers();
  registerProjectIpc();
  registerExportIpc();

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
