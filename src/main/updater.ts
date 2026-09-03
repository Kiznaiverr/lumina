/* ── Auto-updater (electron-updater + GitHub releases) ──
 * Checks GitHub's latest *published* release once per launch (draft
 * releases have no downloadable assets, so they are skipped). Download
 * starts on demand from the renderer button; progress is pushed to the
 * renderer, which reuses the model-download progress bar. Installing
 * quits Lumina and runs the NSIS installer (non-silent, so the user can
 * pick an install directory).
 *
 * In dev (npm start) there is no feed config, so this module no-ops.
 */
import { app, BrowserWindow, ipcMain, shell } from "electron";
import updaterPkg from "electron-updater";
import { IPC } from "../shared/bridge";
import type { CheckUpdateResult, UpdateProgress } from "../shared/bridge";

// electron-updater is CommonJS — esbuild keeps it external (the dynamic
// require("fs") inside fs-extra breaks when bundled into ESM), so destructure
// from the default import instead of a named import.
const { autoUpdater } = updaterPkg;

const UPDATE_URL = "https://github.com/lumina-tl/lumina/releases";

let _window: BrowserWindow | null = null;
let _checking = false;
let _downloading = false;
let _downloadedVersion: string | null = null;

// Download/install are one-way flows — wire the events once at module load.
autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = false;

function _push(progress: UpdateProgress): void {
  if (_window && !_window.isDestroyed()) {
    _window.webContents.send(IPC.updateProgress, progress);
  }
}

autoUpdater.on("download-progress", function (p) {
  _push({
    state: "downloading",
    percent: p.percent,
    transferred: p.transferred,
    total: p.total,
    speed: p.bytesPerSecond,
  });
});

autoUpdater.on("update-downloaded", function (info) {
  _downloading = false;
  _downloadedVersion = info.version;
  _push({ state: "downloaded", version: info.version });
});

// Only push download-phase errors — check-phase failures are handled by
// the promise in _checkOnce (the renderer button is hidden either way).
autoUpdater.on("error", function (e) {
  if (!_downloading) return;
  _downloading = false;
  _push({ state: "error", error: String((e as Error)?.message || e) });
});

function _checkOnce(): Promise<CheckUpdateResult> {
  const current = app.getVersion();
  return new Promise(function (resolve) {
    let done = false;
    const finish = function (r: CheckUpdateResult) {
      if (done) return;
      done = true;
      resolve(r);
    };
    const onAvailable = function (info: { version: string }) {
      finish({
        available: true,
        current,
        latest: info.version,
        url: UPDATE_URL,
      });
    };
    const onNotAvailable = function () {
      finish({ available: false, current });
    };
    const onError = function (e: unknown) {
      finish({ available: false, error: String((e as Error)?.message || e) });
    };
    autoUpdater.once("update-available", onAvailable);
    autoUpdater.once("update-not-available", onNotAvailable);
    autoUpdater.once("error", onError);
    void autoUpdater.checkForUpdates().catch(onError);
  });
}

export function registerUpdaterIpc(win: BrowserWindow | null): void {
  _window = win;

  ipcMain.removeHandler(IPC.checkForUpdates);
  ipcMain.handle(IPC.checkForUpdates, async () => {
    if (!app.isPackaged) return { available: false, error: "dev" };
    if (_downloadedVersion) {
      return {
        available: true,
        current: app.getVersion(),
        latest: _downloadedVersion,
        url: UPDATE_URL,
      };
    }
    if (_checking) return { available: false };
    _checking = true;
    const res = await _checkOnce();
    _checking = false;
    return res;
  });

  ipcMain.removeHandler(IPC.downloadUpdate);
  ipcMain.handle(IPC.downloadUpdate, async () => {
    if (_downloading || _downloadedVersion) return;
    _downloading = true;
    try {
      await autoUpdater.downloadUpdate();
    } catch (e) {
      _downloading = false;
      _push({ state: "error", error: String((e as Error)?.message || e) });
    }
  });

  ipcMain.removeHandler(IPC.installUpdate);
  ipcMain.handle(IPC.installUpdate, () => {
    if (!_downloadedVersion) return;
    // Non-silent installer: keeps the "choose install dir" page of the
    // NSIS wizard, and relaunches the app when it finishes.
    autoUpdater.quitAndInstall(false, true);
  });

  ipcMain.removeHandler(IPC.openUpdateUrl);
  ipcMain.handle(IPC.openUpdateUrl, (_e, url: string) => {
    if (url) void shell.openExternal(url);
  });
}
