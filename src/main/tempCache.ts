/* ── Paint-tool temp PNG cache ──
 * Brush/eraser/bucket strokes serialize the cleanup canvas to versioned PNG
 * files in the session cache (same cache dir as inpaint patches, wiped on
 * app close). History snapshots reference these paths; undo/redo reloads
 * them, so every stroke is immutable on disk.
 */
import { ipcMain } from "electron";
import fs from "fs";
import path from "path";
import {
  IPC,
  type TempPngWritePayload,
  type TempPngWriteResult,
} from "../shared/bridge";
import { CACHE_DIR } from "./backend";

/** Sanitize a file base name (no separators/traversal, non-empty) */
function _safeName(name: string): string {
  const cleaned = name.replace(/[<>:"/\\|?*\x00-\x1f]/g, "").trim();
  return cleaned || "cleanup";
}

/** Write PNG bytes into a unique session-cache file; returns its abs path. */
function _handleWriteTempPng(
  _event: unknown,
  payload: TempPngWritePayload,
): TempPngWriteResult {
  const subdir = (payload.subdir || "cleanup")
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, "")
    .trim();
  const base = _safeName(payload.name || "cleanup");
  const dir = path.join(CACHE_DIR, subdir);
  fs.mkdirSync(dir, { recursive: true });

  let file = path.join(dir, `${base}-1.png`);
  let n = 1;
  while (fs.existsSync(file)) {
    n++;
    file = path.join(dir, `${base}-${n}.png`);
  }
  fs.writeFileSync(file, Buffer.from(payload.data));
  return { path: file };
}

export function registerTempCacheIpc(): void {
  ipcMain.removeHandler(IPC.writeTempPng);
  ipcMain.handle(IPC.writeTempPng, _handleWriteTempPng);
}
