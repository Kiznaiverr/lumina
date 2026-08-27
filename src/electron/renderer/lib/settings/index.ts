/* ── Lumina Settings — modal shell (tabs, open/close) ──
 * Tab content is built by each tab module; index.html only holds a skeleton.
 */
import * as i18n from "../i18n";
import { createIcons } from "../icons";
import { generalTab } from "./general";
import { shortcutsTab } from "./shortcutsTab";
import { translationTab } from "./translation";
import { modelsTab } from "./models";
import { applySettingsWindow, initSettingsWindow } from "./window";

interface TabDef {
  id: string;
  labelKey: string;
  /** lucide icon name for the nav sidebar */
  icon: string;
  build(pane: HTMLElement): void;
  refresh(): void;
  /** Commit pending edits — called before modal closes */
  commit?(): void;
}

const TABS: TabDef[] = [
  {
    id: "general",
    labelKey: "settings.tabGeneral",
    icon: "sliders-horizontal",
    ...generalTab,
  },
  {
    id: "shortcuts",
    labelKey: "settings.tabShortcuts",
    icon: "keyboard",
    ...shortcutsTab,
  },
  {
    id: "translation",
    labelKey: "settings.tabTranslation",
    icon: "languages",
    ...translationTab,
  },
  {
    id: "models",
    labelKey: "settings.tabModels",
    icon: "package",
    ...modelsTab,
  },
];

let _activeTab = "general";

export const settings = {
  /** Build tab bar + panes into the modal — call once from init */
  init(): void {
    const tabBar = document.getElementById("settings-tabbar");
    const paneHost = document.getElementById("settings-panes");
    if (!tabBar || !paneHost) return;
    tabBar.innerHTML = "";
    paneHost.innerHTML = "";

    for (const tab of TABS) {
      const btn = document.createElement("button");
      btn.className = "settings-tab";
      btn.dataset.tab = tab.id;
      const icon = document.createElement("i");
      icon.dataset.lucide = tab.icon;
      const label = document.createElement("span");
      label.textContent = i18n.t(tab.labelKey);
      btn.appendChild(icon);
      btn.appendChild(label);
      btn.addEventListener("click", function () {
        settings.switchTab(this.dataset.tab as string);
      });
      tabBar.appendChild(btn);

      const pane = document.createElement("div");
      pane.className = "settings-pane hidden";
      pane.id = "tab-" + tab.id;
      tab.build(pane);
      paneHost.appendChild(pane);
    }

    this.bindOverlay();
    this.switchTab(_activeTab);
    initSettingsWindow();
    createIcons();
  },

  switchTab(tabId: string): void {
    _activeTab = tabId;
    document.querySelectorAll<HTMLElement>(".settings-tab").forEach((t) => {
      t.classList.toggle("active", t.dataset.tab === tabId);
    });
    document.querySelectorAll<HTMLElement>(".settings-pane").forEach((p) => {
      p.classList.add("hidden");
    });
    const pane = document.getElementById("tab-" + tabId);
    if (pane) {
      pane.classList.remove("hidden");
      const tab = TABS.find((t) => t.id === tabId);
      if (tab) tab.refresh();
    }

    // Reset All only applies to shortcuts tab
    const resetBtn = document.getElementById("btn-shortcuts-reset-all");
    if (resetBtn) resetBtn.classList.toggle("hidden", tabId !== "shortcuts");
  },

  open(tabId?: string): void {
    if (tabId) _activeTab = tabId;
    const overlay = document.getElementById("settings-overlay");
    if (!overlay) return;
    overlay.classList.add("show");
    applySettingsWindow();
    this.switchTab(_activeTab);
  },

  close(): void {
    // Commit pending edits from all tabs before closing (e.g. pasted api keys)
    for (const tab of TABS) {
      if (tab.commit) tab.commit();
    }
    const overlay = document.getElementById("settings-overlay");
    if (overlay) overlay.classList.remove("show");
  },

  bindOverlay(): void {
    const closeBtn = document.getElementById("btn-settings-close");
    if (closeBtn) closeBtn.addEventListener("click", () => settings.close());
    const doneBtn = document.getElementById("btn-settings-done");
    if (doneBtn) doneBtn.addEventListener("click", () => settings.close());
    const overlay = document.getElementById("settings-overlay");
    if (overlay) {
      overlay.addEventListener("click", function (e) {
        if (e.target === this) settings.close();
      });
    }
    const resetAll = document.getElementById("btn-shortcuts-reset-all");
    if (resetAll)
      resetAll.addEventListener("click", function () {
        shortcutsTab.resetAll();
        settings.switchTab("shortcuts");
      });
  },
};
