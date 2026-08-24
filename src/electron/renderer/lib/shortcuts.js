/* ── Lumina Shortcuts — Keybinding Manager + Settings Modal ── */
var L = window.Lumina;

/**
 * Default shortcuts. Values are normalized key combos:
 * modifiers (ctrl, shift, alt) + key, e.g. "Ctrl+Shift+Z".
 * Persisted to localStorage under "lumina-shortcuts".
 */
L.shortcuts = {
  defaults: {
    undo: "Ctrl+Z",
    redo: "Ctrl+Shift+Z",
    toolSelect: "V",
    toolLasso: "L",
    zoomIn: "Ctrl+=",
    zoomOut: "Ctrl+-",
    zoomFit: "Ctrl+0",
  },
  _custom: {},

  init: function () {
    try {
      this._custom = JSON.parse(
        localStorage.getItem("lumina-shortcuts") || "{}",
      );
    } catch (e) {
      this._custom = {};
    }
  },

  /** Get effective binding for an action id */
  get: function (action) {
    return this._custom[action] || this.defaults[action] || null;
  },

  isDefault: function (action) {
    return !this._custom[action];
  },

  set: function (action, combo) {
    if (!combo || combo === this.defaults[action]) {
      delete this._custom[action];
    } else {
      this._custom[action] = combo;
    }
    localStorage.setItem("lumina-shortcuts", JSON.stringify(this._custom));
    this._updateHeaderTitles();
  },

  resetAll: function () {
    this._custom = {};
    localStorage.removeItem("lumina-shortcuts");
    this._updateHeaderTitles();
  },

  /** Find action bound to a combo (for conflict detection) */
  findByCombo: function (combo) {
    var found = null;
    Object.keys(this.defaults).forEach(function (a) {
      if (L.shortcuts.get(a).toLowerCase() === combo.toLowerCase()) found = a;
    });
    return found;
  },

  /** Normalize a KeyboardEvent into a combo string */
  eventToCombo: function (e) {
    var parts = [];
    if (e.ctrlKey || e.metaKey) parts.push("Ctrl");
    if (e.altKey) parts.push("Alt");
    if (e.shiftKey) parts.push("Shift");
    var key = e.key;
    if (["Control", "Shift", "Alt", "Meta"].indexOf(key) === -1) {
      key = key.length === 1 ? key.toUpperCase() : key;
      parts.push(key);
      return parts.join("+");
    }
    return null; // only modifiers pressed
  },

  /** Global keydown dispatch — call once from init */
  bindGlobal: function () {
    document.addEventListener("keydown", function (e) {
      // Don't hijack typing in inputs
      var tag = e.target.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      var combo = L.shortcuts.eventToCombo(e);
      if (!combo) return;

      var actions = {
        undo: function () {
          L.history.undo();
        },
        redo: function () {
          L.history.redo();
        },
        toolSelect: function () {
          L.tools.setActive("select");
        },
        toolLasso: function () {
          L.tools.setActive("lasso");
        },
        zoomIn: function () {
          L.canvas.zoomIn();
        },
        zoomOut: function () {
          L.canvas.zoomOut();
        },
        zoomFit: function () {
          L.canvas.zoomReset();
        },
      };

      for (var action in actions) {
        if (L.shortcuts.get(action).toLowerCase() === combo.toLowerCase()) {
          e.preventDefault();
          actions[action]();
          return;
        }
      }
    });
  },

  // ── Settings modal ──

  openSettings: function () {
    var overlay = document.getElementById("settings-overlay");
    if (!overlay) return;
    overlay.classList.add("show");
    this._switchTab("general");
    this._renderShortcuts();
  },

  _switchTab: function (tabId) {
    document.querySelectorAll(".settings-tab").forEach(function (t) {
      t.classList.toggle("active", t.dataset.tab === tabId);
    });
    document.querySelectorAll(".settings-pane").forEach(function (p) {
      p.classList.add("hidden");
    });
    var pane = document.getElementById("tab-" + tabId);
    if (pane) pane.classList.remove("hidden");

    // Reset All only applies to shortcuts tab
    var resetBtn = document.getElementById("btn-shortcuts-reset-all");
    if (resetBtn) resetBtn.classList.toggle("hidden", tabId !== "shortcuts");
  },

  closeSettings: function () {
    var overlay = document.getElementById("settings-overlay");
    if (overlay) overlay.classList.remove("show");
  },

  /** Bind tab buttons + language select — call once from init */
  bindSettingsUI: function () {
    var self = this;
    document.querySelectorAll(".settings-tab").forEach(function (t) {
      t.addEventListener("click", function () {
        self._switchTab(this.dataset.tab);
      });
    });

    // Language select mirrors current i18n lang
    var sel = document.getElementById("settings-lang");
    if (sel) {
      sel.value = L.i18n.lang();
      sel.addEventListener("change", function () {
        L.i18n.setLang(this.value);
        L.sidebar.render();
        if (L.canvas && L.canvas._updateStatus) L.canvas._updateStatus();
        self._updateHeaderTitles();
        self._renderShortcuts(); // refresh labels
      });
    }
  },

  _renderShortcuts: function () {
    var self = this;
    var list = document.getElementById("shortcut-list");
    if (!list) return;
    list.innerHTML = "";

    var labels = {
      undo: L.i18n.t("shortcuts.undo"),
      redo: L.i18n.t("shortcuts.redo"),
      toolSelect: L.i18n.t("tools.select"),
      toolLasso: L.i18n.t("tools.lasso"),
      zoomIn: L.i18n.t("zoom.zoomIn"),
      zoomOut: L.i18n.t("zoom.zoomOut"),
      zoomFit: L.i18n.t("zoom.fit"),
    };

    Object.keys(labels).forEach(function (action) {
      var row = document.createElement("div");
      row.className = "shortcut-row";

      var name = document.createElement("span");
      name.className = "shortcut-name";
      name.textContent = labels[action];

      var btn = document.createElement("button");
      btn.className = "shortcut-key";
      btn.textContent = self.get(action);
      btn.dataset.action = action;

      btn.addEventListener("click", function () {
        btn.textContent = L.i18n.t("shortcuts.pressKey");
        btn.classList.add("listening");

        function onKey(e) {
          e.preventDefault();
          e.stopPropagation();
          document.removeEventListener("keydown", onKey, true);

          if (e.key === "Escape") {
            btn.textContent = self.get(action);
            btn.classList.remove("listening");
            return;
          }

          var combo = self.eventToCombo(e);
          if (!combo) return; // still holding modifiers

          // Conflict check
          var conflict = self.findByCombo(combo);
          if (conflict && conflict !== action) {
            btn.textContent = self.get(action);
            btn.classList.remove("listening");
            L.ui.toast(
              L.i18n.t("shortcuts.conflict", { combo: combo }),
              "warn",
              3000,
            );
            return;
          }

          self.set(action, combo);
          btn.textContent = combo;
          btn.classList.remove("listening");
        }
        document.addEventListener("keydown", onKey, true);
      });

      var resetBtn = document.createElement("button");
      resetBtn.className = "shortcut-reset";
      resetBtn.title = L.i18n.t("shortcuts.reset");
      resetBtn.innerHTML = '<i data-lucide="rotate-ccw"></i>';
      resetBtn.addEventListener("click", function () {
        self.set(action, self.defaults[action]);
        btn.textContent = self.get(action);
      });

      row.appendChild(name);
      row.appendChild(btn);
      row.appendChild(resetBtn);
      list.appendChild(row);
    });

    if (window.lucide) lucide.createIcons();
  },

  /** Sync header button tooltips with current bindings */
  _updateHeaderTitles: function () {
    var undoBtn = document.getElementById("btn-undo");
    if (undoBtn)
      undoBtn.title = L.i18n
        .t("header.undo")
        .replace("Ctrl+Z", this.get("undo"));
    var redoBtn = document.getElementById("btn-redo");
    if (redoBtn)
      redoBtn.title = L.i18n
        .t("header.redo")
        .replace("Ctrl+Shift+Z", this.get("redo"));
  },
};
