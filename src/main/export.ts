/* ── Lumina export — write rendered pages to a chosen folder ──
 * The renderer flattens each page to PNG/JPG bytes (offscreen Konva stage
 * at natural resolution) and sends them here; main shows the folder picker
 * and writes the files. This keeps image encoding in the renderer (it owns
 * the fonts/canvas) and disk access in main.
 */
import { dialog, BrowserWindow, ipcMain } from "electron";
import type { IpcMainInvokeEvent } from "electron";
import fs from "fs";
import path from "path";
import { IPC, type ExportPayload, type ExportResult } from "../shared/bridge";

function _window(event: IpcMainInvokeEvent): BrowserWindow | undefined {
  return BrowserWindow.fromWebContents(event.sender) ?? undefined;
}

async function _handleExport(
  event: IpcMainInvokeEvent,
  payload: ExportPayload,
): Promise<ExportResult> {
  if (!payload.files.length) return { canceled: false, dir: null, count: 0 };
  const res = await dialog.showOpenDialog(_window(event)!, {
    title: "Export Images",
    properties: ["openDirectory", "createDirectory"],
  });
  if (res.canceled || !res.filePaths[0])
    return { canceled: true, dir: null, count: 0 };

  const dir = res.filePaths[0];
  const ext = payload.format === "jpg" ? ".jpg" : ".png";
  let written = 0;
  for (const f of payload.files) {
    const rawBase = path.basename(f.fileName, path.extname(f.fileName));
    // Strip characters illegal on Windows, then collapse to non-empty.
    const base =
      rawBase.replace(/[<>:"/\\|?*\x00-\x1f]/g, " ").trim() || "page";
    // Overwrite existing files — same behavior as the OS's replace prompt.
    const dest = path.join(dir, base + ext);
    fs.writeFileSync(dest, Buffer.from(f.data));
    written++;
  }
  console.log(
    `[Lumina] Export done: ${dir} (${written} file(s), ${payload.format})`,
  );
  return { canceled: false, dir, count: written };
}

export function registerExportIpc(): void {
  ipcMain.removeHandler(IPC.exportImages);
  ipcMain.handle(IPC.exportImages, _handleExport);
}
