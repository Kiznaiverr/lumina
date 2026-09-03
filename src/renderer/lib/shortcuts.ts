/* ── Lumina Shortcuts — Keybinding Manager ── */
import * as i18n from "./i18n";
import { history } from "./history";
import { tools } from "./tools";
import { canvas } from "./canvas/index";
import { project } from "./project";
import * as exportModule from "./export";

export type ActionId =
  | "undo"
  | "redo"
  | "openProject"
  | "save"
  | "saveAs"
  | "export"
  | "exportAll"
  | "toolSelect"
  | "toolLasso"
  | "toolRect"
  | "toolText"
  | "zoomIn"
  | "zoomOut"
  | "zoomFit";

export const shortcuts = {
  defaults: {
    undo: "Ctrl+Z",
    redo: "Ctrl+Shift+Z",
    openProject: "Ctrl+O",
    save: "Ctrl+S",
    saveAs: "Ctrl+Shift+S",
    export: "Ctrl+E",
    exportAll: "Ctrl+Shift+E",
    toolSelect: "V",
    toolLasso: "L",
    toolRect: "R",
    toolText: "T",
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
    this.updateHeaderTitles();
  },

  resetAll(): void {
    this._custom = {};
    localStorage.removeItem("lumina-shortcuts");
    this.updateHeaderTitles();
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
        openProject: function () {
          project.open();
        },
        save: function () {
          project.save();
        },
        saveAs: function () {
          project.saveAs();
        },
        export: function () {
          exportModule.open();
        },
        exportAll: function () {
          exportModule.openAll();
        },
        toolSelect: function () {
          tools.setActive("select");
        },
        toolLasso: function () {
          tools.setActive("lasso");
        },
        toolRect: function () {
          tools.setActive("rect");
        },
        toolText: function () {
          tools.setActive("text");
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

  /** Sync header button tooltips with current bindings */
  updateHeaderTitles(): void {
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
