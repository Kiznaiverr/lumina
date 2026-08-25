/* ── Settings: General tab (language) ── */
import * as i18n from "../i18n";
import { canvas } from "../canvas/index";
import { sidebar } from "../sidebar";
import { shortcutsTab } from "./shortcutsTab";

export const generalTab = {
  build(pane: HTMLElement): void {
    pane.innerHTML = "";

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
    pane.appendChild(row);

    const hint = document.createElement("p");
    hint.className = "text-[0.68rem] text-text-muted leading-relaxed";
    hint.dataset.i18n = "settings.langHint";
    hint.textContent = i18n.t("settings.langHint");
    pane.appendChild(hint);

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
