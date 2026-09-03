/* ── Lumina Landing — minimal centered welcome ──
 * Own module so the welcome DOM can be rebuilt on every show (fresh
 * recents without an i18n-subscription hook). Static labels are rendered
 * through i18n.t at build time; the container (#landing) is a slim shell.
 *
 * Rendering happens in two places:
 *  - init() — first paint (app start)
 *  - show() — every time the landing reappears (fresh recents + labels)
 */
import * as i18n from "./i18n";
import { createIcons } from "./icons";
import type { RecentsData } from "../types";

export interface LandingHandlers {
  /** Open the native multi-image import dialog (page-strip "+" flow) */
  importImages: () => Promise<void>;
  /** Open a .lmi project — no path → native Open dialog */
  openProject: (path?: string) => Promise<void>;
  /** Load an image path directly (clicking a recent image) */
  openImagePath: (path: string) => Promise<void>;
}

let _root: HTMLElement | null = null;
let _handlers: LandingHandlers | null = null;

function _esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Absolute path → loadable file:// URL (for image previews) */
function _fileUrl(p: string): string {
  let norm = p.replace(/\\/g, "/");
  if (!norm.startsWith("/")) norm = "/" + norm;
  return "file://" + encodeURI(norm).replace(/#/g, "%23").replace(/\?/g, "%3F");
}

const MAX_PER_GROUP = 4;

function _grid(
  kind: "project" | "image",
  list: { path: string; name: string }[],
): string {
  if (list.length === 0) {
    return (
      '<div class="landing-empty">' +
      _esc(
        i18n.t(
          kind === "project" ? "landing.emptyProjects" : "landing.emptyImages",
        ),
      ) +
      "</div>"
    );
  }
  const items = list
    .slice(0, MAX_PER_GROUP)
    .map((e) => {
      const thumb =
        kind === "image"
          ? '<div class="landing-thumb" style="background-image:url(\'' +
            _fileUrl(e.path) +
            "')\"></div>"
          : '<div class="landing-thumb landing-thumb-project"><i data-lucide="package"></i></div>';
      return (
        '<div class="landing-grid-item" data-kind="' +
        kind +
        '" data-path="' +
        _esc(e.path) +
        '">' +
        thumb +
        '<div class="landing-grid-name" title="' +
        _esc(e.name) +
        '">' +
        _esc(e.name) +
        "</div>" +
        '<button class="landing-grid-remove" title="' +
        _esc(i18n.t("landing.remove")) +
        '" data-remove="' +
        _esc(e.path) +
        '"><i data-lucide="x"></i></button>' +
        "</div>"
      );
    })
    .join("");
  return '<div class="landing-grid">' + items + "</div>";
}

function _html(data: RecentsData): string {
  return (
    '<div class="landing-inner">' +
    '<h1 class="landing-title">Lumina</h1>' +
    '<p class="landing-subtitle">' +
    _esc(i18n.t("landing.subtitle")) +
    "</p>" +
    '<div class="landing-actions">' +
    '<button class="btn primary" id="landing-import">' +
    _esc(i18n.t("landing.import")) +
    "</button>" +
    '<button class="btn" id="landing-open">' +
    _esc(i18n.t("landing.openProject")) +
    "</button>" +
    "</div>" +
    '<div class="landing-recent">' +
    '<div class="landing-section-title">' +
    _esc(i18n.t("landing.recent")) +
    "</div>" +
    '<div class="landing-group">' +
    '<div class="landing-group-label">' +
    _esc(i18n.t("landing.projects")) +
    "</div>" +
    _grid("project", data.projects) +
    "</div>" +
    '<div class="landing-group">' +
    '<div class="landing-group-label">' +
    _esc(i18n.t("landing.images")) +
    "</div>" +
    _grid("image", data.images) +
    "</div>" +
    "</div>" +
    "</div>"
  );
}

async function _render(): Promise<void> {
  if (!_root) return;
  let data: RecentsData = { projects: [], images: [] };
  try {
    data = await window.lumina.getRecents();
  } catch {
    // Recents unavailable — render with empty lists
  }
  _root.innerHTML = _html(data || { projects: [], images: [] });
  createIcons({ root: _root as HTMLElement });
}

/* ── Click delegation (rows rebuild on every render) ── */
function _onClick(e: MouseEvent): void {
  if (!_handlers) return;
  const target = e.target as HTMLElement;

  const removeBtn = target.closest("[data-remove]") as HTMLElement | null;
  if (removeBtn) {
    e.stopPropagation();
    const path = removeBtn.getAttribute("data-remove");
    if (path) {
      void window.lumina.removeRecent(path).then(_render);
    }
    return;
  }

  const importBtn = target.closest("#landing-import");
  if (importBtn) {
    void _handlers.importImages();
    return;
  }
  const openBtn = target.closest("#landing-open");
  if (openBtn) {
    void _handlers.openProject();
    return;
  }

  const row = target.closest(".landing-grid-item") as HTMLElement | null;
  if (!row) return;
  const path = row.getAttribute("data-path");
  const kind = row.getAttribute("data-kind");
  if (!path) return;
  if (kind === "project") void _handlers.openProject(path);
  else void _handlers.openImagePath(path);
}

export function init(handlers: LandingHandlers): void {
  _handlers = handlers;
  _root = document.getElementById("landing");
  if (!_root) return;
  _root.addEventListener("click", _onClick);
  void _render();
}

export function show(): void {
  if (!_root) return;
  void _render();
  _root.style.display = "flex";
}

export function hide(): void {
  if (_root) _root.style.display = "none";
}
