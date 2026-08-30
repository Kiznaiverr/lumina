/* ── Settings: General tab (language + auto-save) ── */
import * as i18n from "../i18n";
import { canvas } from "../canvas/index";
import { sidebar } from "../sidebar";
import { shortcutsTab } from "./shortcutsTab";
import * as autosave from "../autosave";

export const generalTab = {
  build(pane: HTMLElement): void {
    pane.innerHTML = "";

    const section = document.createElement("div");
    section.className = "settings-section";

    const row = document.createElement("div");
    row.className = "field-row items-center justify-between mb-3";

    const label = document.createElement("span");
    label.className = "text-[0.78rem] text-text-primary";
    label.dataset.i18n = "settings.language";
    label.textContent = i18n.t("settings.language");

    const sel = document.createElement("select");
    sel.id = "settings-lang";
    sel.className = "field-select";
    const en = document.createElement("option");
    en.value = "en";
    en.textContent = "English";
    const id = document.createElement("option");
    id.value = "id";
    id.textContent = "Bahasa Indonesia";
    sel.appendChild(en);
    sel.appendChild(id);

    row.appendChild(label);
    row.appendChild(sel);
    section.appendChild(row);

    const hint = document.createElement("p");
    hint.className = "text-[0.68rem] text-text-muted leading-relaxed";
    hint.dataset.i18n = "settings.langHint";
    hint.textContent = i18n.t("settings.langHint");
    section.appendChild(hint);

    pane.appendChild(section);

    // ── Auto-save ──
    const autoSection = document.createElement("div");
    autoSection.className = "settings-section";

    const autoRow = document.createElement("div");
    autoRow.className = "field-row items-center justify-between mb-3";

    const autoLabel = document.createElement("span");
    autoLabel.className = "text-[0.78rem] text-text-primary";
    autoLabel.dataset.i18n = "settings.autoSave";
    autoLabel.textContent = i18n.t("settings.autoSave");

    const toggle = document.createElement("label");
    toggle.className = "toggle";
    const toggleInput = document.createElement("input");
    toggleInput.type = "checkbox";
    toggleInput.id = "settings-autosave";
    const track = document.createElement("span");
    track.className = "track";
    toggle.appendChild(toggleInput);
    toggle.appendChild(track);

    autoRow.appendChild(autoLabel);
    autoRow.appendChild(toggle);
    autoSection.appendChild(autoRow);

    const intervalRow = document.createElement("div");
    intervalRow.className = "field-row items-center justify-between mb-3";

    const intervalLabel = document.createElement("span");
    intervalLabel.className = "text-[0.78rem] text-text-primary";
    intervalLabel.dataset.i18n = "settings.autoSaveInterval";
    intervalLabel.textContent = i18n.t("settings.autoSaveInterval");

    const intervalWrap = document.createElement("div");
    intervalWrap.className = "flex items-center gap-1.5";
    const intervalInput = document.createElement("input");
    intervalInput.type = "number";
    intervalInput.id = "settings-autosave-interval";
    intervalInput.min = "5";
    intervalInput.max = "3600";
    intervalInput.step = "5";
    intervalInput.className = "field-select";
    intervalInput.style.width = "76px";
    const sec = document.createElement("span");
    sec.className = "text-[0.68rem] text-text-muted";
    sec.dataset.i18n = "settings.seconds";
    sec.textContent = i18n.t("settings.seconds");
    intervalWrap.appendChild(intervalInput);
    intervalWrap.appendChild(sec);

    intervalRow.appendChild(intervalLabel);
    intervalRow.appendChild(intervalWrap);
    autoSection.appendChild(intervalRow);

    const autoHint = document.createElement("p");
    autoHint.className = "text-[0.68rem] text-text-muted leading-relaxed";
    autoHint.dataset.i18n = "settings.autoSaveHint";
    autoHint.textContent = i18n.t("settings.autoSaveHint");
    autoSection.appendChild(autoHint);

    pane.appendChild(autoSection);

    // Hydrate from persisted config
    const cfg = autosave.load();
    toggleInput.checked = cfg.enabled;
    intervalInput.value = String(cfg.intervalSec);
    intervalInput.disabled = !cfg.enabled;

    function commit(): void {
      const secs = parseInt(intervalInput.value, 10);
      const interval = Number.isFinite(secs) && secs > 0 ? secs : 60;
      intervalInput.value = String(interval);
      autosave.apply({ enabled: toggleInput.checked, intervalSec: interval });
    }
    toggleInput.addEventListener("change", function () {
      intervalInput.disabled = !this.checked;
      commit();
    });
    intervalInput.addEventListener("change", commit);

    sel.value = i18n.lang();
    sel.addEventListener("change", function () {
      i18n.setLang(this.value);
      sidebar.render();
      if (canvas && canvas._updateStatus) canvas._updateStatus();
      shortcutsTab.refreshTitles();
      shortcutsTab.refresh();
    });
  },

  refresh(): void {},
};
