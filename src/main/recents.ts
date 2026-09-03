/* ── Lumina Recents — landing-page history (projects + imported images) ──
 * Persisted to <userData>/recents.json. Records are added by main right
 * where a path becomes known for sure (project save/open incl. file
 * association launches, image import dialogs). When the renderer asks for
 * the list, entries whose file no longer exists are dropped — the landing
 * never shows dead rows.
 */
import { app, ipcMain } from "electron";
import fs from "fs";
import path from "path";
import { IPC } from "../shared/bridge";
import type { RecentEntry, RecentKind, RecentsData } from "../shared/bridge";

const FILE_NAME = "recents.json";
const MAX_PER_KIND = 10;

interface RecentsStore {
  projects: RecentEntry[];
  images: RecentEntry[];
}

function filePath(): string {
  return path.join(app.getPath("userData"), FILE_NAME);
}

function readAll(): RecentsStore {
  try {
    const data = JSON.parse(fs.readFileSync(filePath(), "utf-8"));
    return {
      projects: Array.isArray(data?.projects) ? data.projects : [],
      images: Array.isArray(data?.images) ? data.images : [],
    };
  } catch {
    return { projects: [], images: [] };
  }
}

function writeAll(data: RecentsStore): void {
  const file = filePath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  // Write via temp file + rename so a crash can't corrupt the store
  const tmp = file + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), "utf-8");
  fs.renameSync(tmp, file);
}

/** Dedupe by path, bump to front, keep at most MAX_PER_KIND entries. */
function _push(list: RecentEntry[], kind: RecentKind, p: string): void {
  const entry: RecentEntry = {
    kind,
    path: p,
    name: path.basename(p),
    ts: Date.now(),
  };
  const rest = list.filter((e) => e.path !== p);
  list.length = 0;
  list.push(entry, ...rest.slice(0, MAX_PER_KIND - 1));
}

export function recordRecent(kind: RecentKind, p: string): void {
  if (!p) return;
  const data = readAll();
  _push(data[kind === "project" ? "projects" : "images"], kind, p);
  writeAll(data);
}

/** Serve the list filtered to paths that still exist (auto-heal). */
function listRecents(): RecentsData {
  const data = readAll();
  const exists = (e: RecentEntry) => fs.existsSync(e.path);
  return {
    projects: data.projects.filter(exists),
    images: data.images.filter(exists),
  };
}

export function removeRecent(p: string): void {
  const data = readAll();
  data.projects = data.projects.filter((e) => e.path !== p);
  data.images = data.images.filter((e) => e.path !== p);
  writeAll(data);
}

export function registerRecentsIpc(): void {
  // removeHandler first — createWindow() may run again (macOS activate)
  ipcMain.removeHandler(IPC.recentsList);
  ipcMain.removeHandler(IPC.recentsRemove);
  ipcMain.handle(IPC.recentsList, () => listRecents());
  ipcMain.handle(IPC.recentsRemove, (_e, p: string) =>
    removeRecent(String(p ?? "")),
  );
}
