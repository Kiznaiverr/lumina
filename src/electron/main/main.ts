import { app, BrowserWindow, Menu } from "electron";
import * as path from "path";
import { spawnPythonBackend, stopPythonBackend } from "./backend";
import { registerIpcHandlers } from "./pipeline";
import { registerSecretHandlers } from "./storage";

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
      preload: path.join(__dirname, "../preload/preload.js"),
    },
  });

  // From dist/electron/main/main.js → ../../../src/electron/renderer/index.html
  mainWindow.loadFile(
    path.join(__dirname, "../../../src/electron/renderer/index.html"),
  );

  registerIpcHandlers(mainWindow);
  registerSecretHandlers();

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  // Remove default Electron menu bar (File/Edit/View...)
  Menu.setApplicationMenu(null);
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
