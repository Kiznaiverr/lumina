/* ── Lumina Sidebar (entry) — koharu-style Type + Layers|Masks panels ── */
import { state } from "../state";
import * as i18n from "../i18n";
import { createIcons } from "../icons";
import type { Page } from "../../types";
import { layerListHTML, wireEvents } from "./layerList";
import { maskListHTML, wireMaskEvents } from "./maskList";
import { typeSection } from "./typeSection";
import { esc } from "./_esc";

const TYPE_MIN_HEIGHT = 72;
const TYPE_STORAGE_KEY = "lumina-type-height";

function loadTypeHeight(): number | null {
  const raw = localStorage.getItem(TYPE_STORAGE_KEY);
  const v = raw ? parseInt(raw, 10) : NaN;
  return Number.isFinite(v) && v > 0 ? v : null;
}

let _typeHeight: number | null = loadTypeHeight();
let _activeTab: "layers" | "masks" = "layers";
// Per-tab scroll of the list — sidebar.render() rebuilds the list DOM, which
// would otherwise reset the scroll to top on every selection/toggle.
let _tabScroll: Record<"layers" | "masks", number> = { layers: 0, masks: 0 };

/** Drag the splitter to resize the Type section height (Photoshop-style). */
function wireSplitter(
  splitter: HTMLElement,
  typeHost: HTMLElement,
  scroll: HTMLElement,
): void {
  splitter.addEventListener("mousedown", function (e) {
    e.preventDefault();
    const startY = e.clientY;
    const startH = typeHost.offsetHeight;
    typeHost.style.maxHeight = "none";
    document.body.classList.add("resizing-row");
    const onMove = function (ev: MouseEvent) {
      const max = scroll.clientHeight - 48; // keep room for tabs + list
      const h = Math.min(
        Math.max(startH + (ev.clientY - startY), TYPE_MIN_HEIGHT),
        max,
      );
      typeHost.style.height = h + "px";
    };
    const onUp = function () {
      document.body.classList.remove("resizing-row");
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      _typeHeight = typeHost.offsetHeight;
      localStorage.setItem(TYPE_STORAGE_KEY, String(_typeHeight));
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  });
}

// Re-clamp the Type section height on window resize — without a render the
// stored height stays stale and can clip the layer list at the sidebar edge.
window.addEventListener("resize", function () {
  if (!_typeHeight || typeSection.isCollapsed()) return;
  const el = document.getElementById("type-section");
  if (!el || !el.parentElement) return;
  const max = el.parentElement.clientHeight - 48;
  const h = Math.max(TYPE_MIN_HEIGHT, Math.min(_typeHeight, max));
  if (h !== el.offsetHeight) el.style.height = h + "px";
});

function tabHTML(
  tab: "layers" | "masks",
  label: string,
  count: number,
  icon: string,
): string {
  return (
    '<button class="sidebar-tab' +
    (_activeTab === tab ? " active" : "") +
    '" data-tab="' +
    tab +
    '">' +
    '<i data-lucide="' +
    icon +
    '"></i>' +
    "<span>" +
    esc(label) +
    "</span>" +
    '<span class="sidebar-tab-count">' +
    count +
    "</span>" +
    "</button>"
  );
}

export const sidebar = {
  render(): void {
    const scroll = document.getElementById("sidebar-scroll");
    if (!scroll) return;

    // Preserve scroll position across the DOM rebuild below (keyed by tab)
    const prevList = scroll.querySelector<HTMLElement>(".layer-list");
    if (prevList) _tabScroll[_activeTab] = prevList.scrollTop;

    scroll.innerHTML = "";

    const page: Page | null = state.getActivePage();
    const total = page ? (page.layers || []).length : 0;
    const maskCount = page ? (page.inpaintMasks || []).length : 0;

    // Type section (hidden when no text layer selected; header click collapses)
    const typeHost = document.createElement("div");
    scroll.appendChild(typeHost);
    typeSection.build(typeHost);
    typeSection.refresh();
    if (_typeHeight && !typeSection.isCollapsed()) {
      // Clamp to the current sidebar height (same budget as the splitter
      // drag: tabs 32px + splitter 6px + ~10px for the list). The stored
      // height can be stale after the page strip appears (workspace shrinks
      // 68px) or the window resizes — without this the layer list gets
      // pushed out of #sidebar and clipped by its overflow-hidden.
      const max = scroll.clientHeight - 48;
      const h = Math.max(TYPE_MIN_HEIGHT, Math.min(_typeHeight, max));
      typeHost.style.maxHeight = "none";
      typeHost.style.height = h + "px";
    }
    const typeHeader = typeHost.querySelector<HTMLElement>(".type-header");
    if (typeHeader) {
      typeHeader.addEventListener("click", function () {
        typeSection.toggleCollapsed();
        sidebar.render();
      });
    }

    // Photoshop-style height splitter between Type and tabs/list
    // (not shown when the Type section is collapsed)
    if (!typeSection.isCollapsed()) {
      const splitter = document.createElement("div");
      splitter.className = "sidebar-splitter";
      splitter.title = i18n.t("sidebar.resizeType");
      splitter.innerHTML = '<span class="sidebar-splitter-grip"></span>';
      scroll.appendChild(splitter);
      wireSplitter(splitter, typeHost, scroll);
    }

    // Tab bar: Layers | Masks
    const tabs = document.createElement("div");
    tabs.className = "sidebar-tabs shrink-0";
    tabs.innerHTML =
      tabHTML("layers", i18n.t("sidebar.tabLayers"), total, "layers") +
      tabHTML("masks", i18n.t("sidebar.tabMasks"), maskCount, "eraser");
    scroll.appendChild(tabs);

    tabs
      .querySelectorAll<HTMLButtonElement>(".sidebar-tab")
      .forEach(function (b) {
        b.addEventListener("click", function () {
          const t = b.getAttribute("data-tab");
          if (t === "layers" || t === "masks") {
            _activeTab = t;
            sidebar.render();
          }
        });
      });

    // Active panel content (single scrollable region below the tabs)
    const content = document.createElement("div");
    content.className =
      "layer-list flex-1 min-h-0 overflow-y-auto custom-scrollbar";
    scroll.appendChild(content);

    if (_activeTab === "masks") {
      content.innerHTML = maskListHTML(page);
      wireMaskEvents();
    } else {
      content.innerHTML = layerListHTML(page);
      wireEvents();
    }

    content.scrollTop = _tabScroll[_activeTab] || 0;

    createIcons();
  },
};
