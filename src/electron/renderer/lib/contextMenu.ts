/* ── Lumina Context Menu ── */
import * as i18n from "./i18n";

export interface MenuItem {
  labelKey: string;
  action: () => void;
  danger?: boolean;
  separatorBefore?: boolean;
}

export const contextMenu = {
  _el: null as HTMLDivElement | null,

  _ensure(): HTMLDivElement {
    if (this._el) return this._el;
    const el = document.createElement("div");
    el.id = "context-menu";
    document.body.appendChild(el);
    this._el = el;

    // Hide on any click elsewhere / escape / scroll
    document.addEventListener("mousedown", (e) => {
      if (!el.contains(e.target as Node)) this.hide();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") this.hide();
    });
    window.addEventListener("blur", () => this.hide());
    return el;
  },

  hide(): void {
    if (this._el) this._el.classList.remove("show");
  },

  show(x: number, y: number, items: MenuItem[]): void {
    const el = this._ensure();
    el.innerHTML = "";

    items.forEach((item, i) => {
      if (item.separatorBefore && i > 0) {
        const sep = document.createElement("div");
        sep.className = "ctx-sep";
        el.appendChild(sep);
      }
      const btn = document.createElement("button");
      btn.className = "ctx-item" + (item.danger ? " ctx-danger" : "");
      btn.textContent = i18n.t(item.labelKey);
      btn.addEventListener("click", () => {
        this.hide();
        item.action();
      });
      el.appendChild(btn);
    });

    el.classList.add("show");

    // Clamp to viewport after measuring
    const rect = el.getBoundingClientRect();
    el.style.left = Math.min(x, window.innerWidth - rect.width - 4) + "px";
    el.style.top = Math.min(y, window.innerHeight - rect.height - 4) + "px";
  },
};
