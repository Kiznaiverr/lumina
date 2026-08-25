/* ── Settings: Shortcuts tab (keybinding list + capture) ── */
import * as i18n from "../i18n";
import { ui } from "../ui";
import { shortcuts } from "../shortcuts";
import { createIcons } from "../icons";

type ActionId = Parameters<typeof shortcuts.get>[0] extends infer A ? A : never;

export const shortcutsTab = {
  build(pane: HTMLElement): void {
    const list = document.createElement("div");
    list.id = "shortcut-list";
    pane.innerHTML = "";
    pane.appendChild(list);
  },

  refresh(): void {
    this._render();
  },

  resetAll(): void {
    shortcuts.resetAll();
  },

  refreshTitles(): void {
    shortcuts.updateHeaderTitles();
  },

  _render(): void {
    const list = document.getElementById("shortcut-list");
    if (!list) return;
    list.innerHTML = "";

    const labels: Record<string, string> = {
      undo: i18n.t("shortcuts.undo"),
      redo: i18n.t("shortcuts.redo"),
      toolSelect: i18n.t("tools.select"),
      toolLasso: i18n.t("tools.lasso"),
      zoomIn: i18n.t("zoom.zoomIn"),
      zoomOut: i18n.t("zoom.zoomOut"),
      zoomFit: i18n.t("zoom.fit"),
    };

    (Object.keys(labels) as ActionId[]).forEach(function (action) {
      const row = document.createElement("div");
      row.className = "shortcut-row";

      const name = document.createElement("span");
      name.className = "shortcut-name";
      name.textContent = labels[action];

      const btn = document.createElement("button");
      btn.className = "shortcut-key";
      btn.textContent = shortcuts.get(action);
      btn.dataset.action = action;

      btn.addEventListener("click", function () {
        btn.textContent = i18n.t("shortcuts.pressKey");
        btn.classList.add("listening");

        function onKey(e: KeyboardEvent): void {
          e.preventDefault();
          e.stopPropagation();
          document.removeEventListener("keydown", onKey, true);

          if (e.key === "Escape") {
            btn.textContent = shortcuts.get(action);
            btn.classList.remove("listening");
            return;
          }

          const combo = shortcuts.eventToCombo(e);
          if (!combo) return; // still holding modifiers

          // Conflict check
          const conflict = shortcuts.findByCombo(combo);
          if (conflict && conflict !== action) {
            btn.textContent = shortcuts.get(action);
            btn.classList.remove("listening");
            ui.toast(
              i18n.t("shortcuts.conflict", { combo: combo }),
              "warn",
              3000,
            );
            return;
          }

          shortcuts.set(action, combo);
          btn.textContent = combo;
          btn.classList.remove("listening");
        }
        document.addEventListener("keydown", onKey, true);
      });

      const resetBtn = document.createElement("button");
      resetBtn.className = "shortcut-reset";
      resetBtn.title = i18n.t("shortcuts.reset");
      resetBtn.innerHTML = '<i data-lucide="rotate-ccw"></i>';
      resetBtn.addEventListener("click", function () {
        shortcuts.set(action, shortcuts.defaults[action]);
        btn.textContent = shortcuts.get(action);
      });

      row.appendChild(name);
      row.appendChild(btn);
      row.appendChild(resetBtn);
      list.appendChild(row);
    });

    createIcons();
  },
};
