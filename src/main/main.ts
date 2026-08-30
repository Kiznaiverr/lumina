import { app, BrowserWindow, Menu } from "electron";
import * as path from "path";
import {
  spawnPythonBackend,
  stopPythonBackend,
  prepareCacheDir,
} from "./backend";
import { registerIpcHandlers } from "./pipeline";
import { registerSecretHandlers } from "./storage";
import { registerProjectIpc } from "./project";
import { registerExportIpc } from "./export";
import { MAIN_DIR, PROJECT_ROOT } from "./paths";

let mainWindow: BrowserWindow | null = null;

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
  registerProjectIpc();
  registerExportIpc();

  mainWindow.on("closed", () => {
    mainWindow = null;
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
