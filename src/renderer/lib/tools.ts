/* ── Lumina Tools Panel ── */
import { state } from "./state";
import * as i18n from "./i18n";
import { canvas } from "./canvas/index";
import { createIcons } from "./icons";
import { paintSettings, setPaintSize } from "./canvas/paintool/shared";

interface ToolItem {
  id:
    | "select"
    | "lasso"
    | "rect"
    | "text"
    | "brush"
    | "eraser"
    | "bucket"
    | "eyedropper";
  icon: string;
  titleKey: string;
}

export const tools = {
  _items: [
    { id: "select", icon: "mouse-pointer-2", titleKey: "tools.select" },
    { id: "lasso", icon: "lasso", titleKey: "tools.lasso" },
    { id: "rect", icon: "square-dashed", titleKey: "tools.rect" },
    { id: "text", icon: "type", titleKey: "tools.text" },
    { id: "brush", icon: "brush", titleKey: "tools.brush" },
    { id: "eraser", icon: "eraser", titleKey: "tools.eraser" },
    { id: "bucket", icon: "paint-bucket", titleKey: "tools.bucket" },
    { id: "eyedropper", icon: "pipette", titleKey: "tools.eyedropper" },
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

    // Update cursor — all paint tools hide the OS cursor (the custom
    // #paint-cursor div renders crosshair/icon/circle instead).
    const container = document.getElementById("canvas-container");
    const cursors: Record<string, string> = {
      lasso: "crosshair",
      rect: "crosshair",
      select: "default",
      text: "text",
      brush: "none",
      eraser: "none",
      bucket: "none",
      eyedropper: "none",
    };
    if (container) container.style.cursor = cursors[toolId] || "default";

    if (canvas && canvas.onToolChange) canvas.onToolChange(toolId);
  },

  /** [ and ] — resize the brush ±1px (Photoshop behavior). */
  adjustBrushSize(dir: number): void {
    if (
      state.activeTool !== "brush" &&
      state.activeTool !== "eraser" &&
      state.activeTool !== "bucket"
    )
      return;
    const step = Math.max(1, Math.round(paintSettings().size * 0.1));
    setPaintSize(paintSettings().size + dir * step);
    // Live-update the options bar value label
    const el = document.getElementById("paint-options");
    const sizeInput = el?.querySelector<HTMLInputElement>("#paint-size");
    const label = el?.querySelector<HTMLElement>("#paint-size-value");
    if (sizeInput) sizeInput.value = String(paintSettings().size);
    if (label) label.textContent = String(paintSettings().size);
  },
};
