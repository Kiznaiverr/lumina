/* ── Lumina Shortcuts — Keybinding Manager + Settings Modal ── */
import * as i18n from "./i18n";
import { ui } from "./ui";
import { history } from "./history";
import { tools } from "./tools";
import { canvas } from "./canvas/index";
import { sidebar } from "./sidebar";
import { createIcons } from "./icons";

type ActionId =
  | "undo"
  | "redo"
  | "toolSelect"
  | "toolLasso"
  | "zoomIn"
  | "zoomOut"
  | "zoomFit";

export const shortcuts = {
  defaults: {
    undo: "Ctrl+Z",
    redo: "Ctrl+Shift+Z",
    toolSelect: "V",
    toolLasso: "L",
    zoomIn: "Ctrl+=",
    zoomOut: "Ctrl+-",
    zoomFit: "Ctrl+0",
  } as Record<ActionId, string>,
  _custom: {} as Partial<Record<ActionId, string>>,

  init(): void {
    try {
      this._custom = JSON.parse(
        localStorage.getItem("lumina-shortcuts") || "{}",
      );
    } catch (e) {
      this._custom = {};
    }
  },

  /** Get effective binding for an action id */
  get(action: ActionId): string | null {
    return this._custom[action] || this.defaults[action] || null;
  },

  isDefault(action: ActionId): boolean {
    return !this._custom[action];
  },

  set(action: ActionId, combo: string): void {
    if (!combo || combo === this.defaults[action]) {
      delete this._custom[action];
    } else {
      this._custom[action] = combo;
    }
    localStorage.setItem("lumina-shortcuts", JSON.stringify(this._custom));
    this._updateHeaderTitles();
  },

  resetAll(): void {
    this._custom = {};
    localStorage.removeItem("lumina-shortcuts");
    this._updateHeaderTitles();
  },

  /** Find action bound to a combo (for conflict detection) */
  findByCombo(combo: string): ActionId | null {
    let found: ActionId | null = null;
    (Object.keys(this.defaults) as ActionId[]).forEach((a) => {
      if ((shortcuts.get(a) as string).toLowerCase() === combo.toLowerCase())
        found = a;
    });
    return found;
  },

  /** Normalize a KeyboardEvent into a combo string */
  eventToCombo(e: KeyboardEvent): string | null {
    const parts: string[] = [];
    if (e.ctrlKey || e.metaKey) parts.push("Ctrl");
    if (e.altKey) parts.push("Alt");
    if (e.shiftKey) parts.push("Shift");
    let key = e.key;
    if (["Control", "Shift", "Alt", "Meta"].indexOf(key) === -1) {
      key = key.length === 1 ? key.toUpperCase() : key;
      parts.push(key);
      return parts.join("+");
    }
    return null; // only modifiers pressed
  },

  /** Global keydown dispatch — call once from init */
  bindGlobal(): void {
    document.addEventListener("keydown", function (e) {
      // Don't hijack typing in inputs
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      const combo = shortcuts.eventToCombo(e);
      if (!combo) return;

      const actions: Record<ActionId, () => void> = {
        undo: function () {
          history.undo();
        },
        redo: function () {
          history.redo();
        },
        toolSelect: function () {
          tools.setActive("select");
        },
        toolLasso: function () {
          tools.setActive("lasso");
        },
        zoomIn: function () {
          canvas.zoomIn();
        },
        zoomOut: function () {
          canvas.zoomOut();
        },
        zoomFit: function () {
          canvas.zoomReset();
        },
      };

      for (const action of Object.keys(actions) as ActionId[]) {
        if (
          (shortcuts.get(action) as string).toLowerCase() ===
          combo.toLowerCase()
        ) {
          e.preventDefault();
          actions[action]();
          return;
        }
      }
    });
  },

  // ── Settings modal ──

  openSettings(): void {
    const overlay = document.getElementById("settings-overlay");
    if (!overlay) return;
    overlay.classList.add("show");
    this._switchTab("general");
    this._renderShortcuts();
  },

  _switchTab(tabId: string): void {
    document.querySelectorAll<HTMLElement>(".settings-tab").forEach((t) => {
      t.classList.toggle("active", t.dataset.tab === tabId);
    });
    document.querySelectorAll<HTMLElement>(".settings-pane").forEach((p) => {
      p.classList.add("hidden");
    });
    const pane = document.getElementById("tab-" + tabId);
    if (pane) pane.classList.remove("hidden");

    // Reset All only applies to shortcuts tab
    const resetBtn = document.getElementById("btn-shortcuts-reset-all");
    if (resetBtn) resetBtn.classList.toggle("hidden", tabId !== "shortcuts");
  },

  closeSettings(): void {
    const overlay = document.getElementById("settings-overlay");
    if (overlay) overlay.classList.remove("show");
  },

  /** Bind tab buttons + language select — call once from init */
  bindSettingsUI(): void {
    document.querySelectorAll<HTMLElement>(".settings-tab").forEach((t) => {
      t.addEventListener("click", function () {
        shortcuts._switchTab(this.dataset.tab as string);
      });
    });

    // Language select mirrors current i18n lang
    const sel = document.getElementById(
      "settings-lang",
    ) as HTMLSelectElement | null;
    if (sel) {
      sel.value = i18n.lang();
      sel.addEventListener("change", function () {
        i18n.setLang(this.value);
        sidebar.render();
        if (canvas && canvas._updateStatus) canvas._updateStatus();
        shortcuts._updateHeaderTitles();
        shortcuts._renderShortcuts(); // refresh labels
      });
    }
  },

  _renderShortcuts(): void {
    const list = document.getElementById("shortcut-list");
    if (!list) return;
    list.innerHTML = "";

    const labels: Record<ActionId, string> = {
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

  /** Sync header button tooltips with current bindings */
  _updateHeaderTitles(): void {
    const undoBtn = document.getElementById("btn-undo");
    if (undoBtn)
      undoBtn.title = i18n
        .t("header.undo")
        .replace("Ctrl+Z", this.get("undo") as string);
    const redoBtn = document.getElementById("btn-redo");
    if (redoBtn)
      redoBtn.title = i18n
        .t("header.redo")
        .replace("Ctrl+Shift+Z", this.get("redo") as string);
  },
};
