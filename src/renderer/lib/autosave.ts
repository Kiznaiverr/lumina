/* ── Auto-save — periodically persists the session to the current .lmi ──
 * Default ON, every 60 s. Skips while a pipeline op (detect / ocr /
 * inpaint / translate) or a model download is running, when nothing is
 * dirty, no pages are loaded, or there is no save target yet (the first
 * save is always manual so the user picks a location — auto-save never
 * pops the dialog).
 */
import { state } from "./state";
import { isDirty, getSavePath } from "./dirty";
import { models } from "./models";
import { project } from "./project";

export interface AutoSaveConfig {
  enabled: boolean;
  intervalSec: number;
}

const STORAGE_KEY = "lumina-autosave";

let _timer: ReturnType<typeof setInterval> | null = null;

export function defaultConfig(): AutoSaveConfig {
  return { enabled: true, intervalSec: 60 };
}

export function load(): AutoSaveConfig {
  const cfg = defaultConfig();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const p = JSON.parse(raw) as Partial<AutoSaveConfig>;
      cfg.enabled = typeof p.enabled === "boolean" ? p.enabled : cfg.enabled;
      cfg.intervalSec =
        typeof p.intervalSec === "number" && p.intervalSec > 0
          ? p.intervalSec
          : cfg.intervalSec;
    }
  } catch {
    /* keep defaults */
  }
  return cfg;
}

function save(cfg: AutoSaveConfig): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
}

/** Persist the config and restart the timer (called from Settings). */
export function apply(cfg: AutoSaveConfig): void {
  save(cfg);
  start();
}

function tick(): void {
  if (!isDirty()) return;
  if (state.pages.length === 0) return;
  if (!getSavePath()) return; // first save must pick a location manually
  if (state.isRunning) return; // pipeline op in flight
  if (models.isDownloading()) return;
  project.save({ silent: true });
}

export function start(): void {
  if (_timer) clearInterval(_timer);
  _timer = null;
  const cfg = load();
  if (!cfg.enabled) return;
  _timer = setInterval(tick, cfg.intervalSec * 1000);
}
