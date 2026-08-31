/* ── Lumina Tools Panel ── */
import { state } from "./state";
import * as i18n from "./i18n";
import { canvas } from "./canvas/index";
import { createIcons } from "./icons";

interface ToolItem {
  id: "select" | "lasso" | "rect" | "text";
  icon: string;
  titleKey: string;
}

export const tools = {
  _items: [
    { id: "select", icon: "mouse-pointer-2", titleKey: "tools.select" },
    { id: "lasso", icon: "lasso", titleKey: "tools.lasso" },
    { id: "rect", icon: "square-dashed", titleKey: "tools.rect" },
    { id: "text", icon: "type", titleKey: "tools.text" },
  ] as ToolItem[],

  init(): void {
    const panel = document.getElementById("tools-panel");
    if (!panel) return;
    panel.innerHTML = "";

    this._items.forEach((item) => {
      const btn = document.createElement("button");
      btn.className =
        "tool-btn" + (item.id === state.activeTool ? " active" : "");
      btn.innerHTML = '<i data-lucide="' + item.icon + '"></i>';
      btn.title = i18n.t(item.titleKey);
      btn.dataset.tool = item.id;
      btn.addEventListener("click", () => {
        tools.setActive(item.id);
      });
      panel.appendChild(btn);
    });

    // Separator
    const sep = document.createElement("div");
    sep.className = "w-6 h-px bg-surface-3 my-1";
    panel.appendChild(sep);

    // Keyboard shortcuts handled by shortcuts.bindGlobal()

    createIcons();
  },

  setActive(toolId: string): void {
    state.activeTool = toolId as never;

    document.querySelectorAll<HTMLElement>(".tool-btn").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.tool === toolId);
    });

    const label = i18n.t("tools." + toolId + "Name");
    const statusTool = document.getElementById("status-tool");
    if (statusTool) statusTool.textContent = label;

    // Update cursor
    const container = document.getElementById("canvas-container");
    const cursors: Record<string, string> = {
      lasso: "crosshair",
      rect: "crosshair",
      select: "default",
      text: "text",
    };
    if (container) container.style.cursor = cursors[toolId] || "default";

    if (canvas && canvas.onToolChange) canvas.onToolChange(toolId);
  },
};
