/* ── Lumina Sidebar (entry) — koharu-style layers panel ── */
import { state } from "../state";
import * as i18n from "../i18n";
import { createIcons } from "../icons";
import type { Page } from "../../types";
import { layerListHTML, wireEvents } from "./layerList";

export const sidebar = {
  render(): void {
    const scroll = document.getElementById("sidebar-scroll");
    if (!scroll) return;
    scroll.innerHTML = "";

    const page: Page | null = state.getActivePage();
    const tCount = page ? (page.textDetections || []).length : 0;
    const bCount = page ? (page.bubbleDetections || []).length : 0;
    const total = tCount + bCount;

    // Header: LAYERS + count
    const header = document.createElement("div");
    header.className = "layer-header";
    header.innerHTML =
      '<i data-lucide="layers" class="layer-header-icon"></i>' +
      "<span>" +
      i18n.t("sidebar.layers") +
      "</span>" +
      '<span class="layer-header-count">' +
      total +
      "</span>";
    scroll.appendChild(header);

    // Layer list
    const list = document.createElement("div");
    list.className = "layer-list";
    list.innerHTML = layerListHTML(page);
    scroll.appendChild(list);

    wireEvents();
    createIcons();
  },
};
