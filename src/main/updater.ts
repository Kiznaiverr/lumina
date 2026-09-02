/* ── Minimal update checker ──
 * Checks GitHub's latest *published* release (drafts are ignored) once per
 * launch. If a newer version exists, the renderer shows an update button
 * that opens the release page in the default browser. No auto-download.
 */
import { app, ipcMain, shell } from "electron";
import { IPC } from "../shared/bridge";

const OWNER = "lumina-tl";
const REPO = "lumina";
// `/releases/latest` never returns prereleases (404 for our -preview tags),
// so fetch the newest release overall — drafts stay excluded by the API.
const API = `https://api.github.com/repos/${OWNER}/${REPO}/releases?per_page=1`;
const PAGE = `https://github.com/${OWNER}/${REPO}/releases`;

/** Compare semver-ish strings. 1 = a newer, -1 = b newer, 0 = equal.
 *  "0.1.0-experimental-preview" < "0.1.0" (prerelease is older than stable). */
function compareVersions(a: string, b: string): number {
  const numeric = (s: string) =>
    s.replace(/^v/i, "").split("-")[0].split(".").map(Number);
  const pa = numeric(a);
  const pb = numeric(b);
  for (let i = 0; i < 3; i++) {
    const x = pa[i] || 0;
    const y = pb[i] || 0;
    if (x !== y) return x > y ? 1 : -1;
  }
  const preA = a.includes("-");
  const preB = b.includes("-");
  if (preA && !preB) return -1;
  if (!preA && preB) return 1;
  return 0;
}

export function registerUpdaterIpc(): void {
  ipcMain.removeHandler(IPC.checkForUpdates);
  ipcMain.handle(IPC.checkForUpdates, async () => {
    try {
      const res = await fetch(API, {
        headers: {
          Accept: "application/vnd.github+json",
          "User-Agent": "lumina",
        },
      });
      if (!res.ok) return { available: false, error: `HTTP ${res.status}` };
      const data = (await res.json()) as {
        tag_name?: string;
        html_url?: string;
      }[];
      const latest = String(data?.[0]?.tag_name ?? "").replace(/^v/i, "");
      const current = app.getVersion();
      if (!latest) return { available: false, error: "no-tag" };
      return {
        available: compareVersions(latest, current) > 0,
        current,
        latest,
        url: data[0]?.html_url || PAGE,
      };
    } catch (e) {
      return { available: false, error: String(e) };
    }
  });

  ipcMain.removeHandler(IPC.openUpdateUrl);
  ipcMain.handle(IPC.openUpdateUrl, (_e, url: string) => {
    if (url) void shell.openExternal(url);
  });
}
