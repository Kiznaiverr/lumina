/* ── Lumina Tools Panel ── */
var L = window.Lumina;

L.tools = {
  _items: [
    { id: "select", icon: "mouse-pointer-2", titleKey: "tools.select" },
    { id: "lasso", icon: "lasso", titleKey: "tools.lasso" },
    { id: "hand", icon: "hand", titleKey: "tools.hand" },
  ],

  init: function () {
    var panel = document.getElementById("tools-panel");
    if (!panel) return;
    panel.innerHTML = "";

    var self = this;
    this._items.forEach(function (item) {
      var btn = document.createElement("button");
      btn.className = "tool-btn" + (item.id === L.state.activeTool ? " active" : "");
      btn.innerHTML = '<i data-lucide="' + item.icon + '"></i>';
      btn.title = L.i18n.t(item.titleKey);
      btn.dataset.tool = item.id;
      btn.addEventListener("click", function () {
        self.setActive(item.id);
      });
      panel.appendChild(btn);
    });

    // Separator
    var sep = document.createElement("div");
    sep.className = "w-6 h-px bg-surface-3 my-1";
    panel.appendChild(sep);

    // Keyboard shortcuts handled by L.shortcuts.bindGlobal()

    lucide.createIcons();
  },

  setActive: function (toolId) {
    L.state.activeTool = toolId;

    document.querySelectorAll(".tool-btn").forEach(function (btn) {
      btn.classList.toggle("active", btn.dataset.tool === toolId);
    });

    var label = L.i18n.t("tools." + toolId + "Name");
    var statusTool = document.getElementById("status-tool");
    if (statusTool) statusTool.textContent = label;

    // Update cursor
    var container = document.getElementById("canvas-container");
    var cursors = { hand: "grab", lasso: "crosshair", select: "default" };
    if (container) container.style.cursor = cursors[toolId] || "default";

    if (L.canvas && L.canvas.onToolChange) L.canvas.onToolChange(toolId);
  },
};
