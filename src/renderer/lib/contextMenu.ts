/* ── Lumina Context Menu ── */
import * as i18n from "./i18n";

export interface MenuItem {
  /** i18n key of the row label — used when `label` is not given. */
  labelKey?: string;
  /** Raw display text (bypasses i18n) — e.g. live model names. */
  label?: string;
  /** Runs when the row is clicked (rows with `children` don't run one). */
  action?: () => void;
  danger?: boolean;
  separatorBefore?: boolean;
  /** Fly-out rows opened while hovering the row. */
  children?: MenuItem[];
  /** Shows a checkmark prefix. */
  checked?: boolean;
  disabled?: boolean;
  /** Tooltip — e.g. why a disabled row can't run. */
  title?: string;
}

export const contextMenu = {
  _el: null as HTMLDivElement | null,
  /** Open popups in order: [root menu, fly-out 1, fly-out 2, …]. */
  _chain: [] as HTMLDivElement[],

  _ensure(): HTMLDivElement {
    if (this._el) return this._el;
    const el = document.createElement("div");
    el.id = "context-menu";
    document.body.appendChild(el);
    this._el = el;
    this._chain = [el];

    // Hide on any click elsewhere / escape / scroll. Fly-outs are separate
    // body-level popups, so clicks inside any of them must not dismiss the
    // menu.
    document.addEventListener("mousedown", (e) => {
      const t = e.target as Node | null;
      if (t && this._chain.some((p) => p.contains(t))) return;
      this.hide();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") this.hide();
    });
    window.addEventListener("blur", () => this.hide());
    el.addEventListener("mouseleave", (e) => this._onLeave(e));
    return el;
  },

  hide(): void {
    if (this._el) this._el.classList.remove("show");
    this._closeFlyouts(0);
  },

  /** Remove every open fly-out deeper than `keep` (root menu = index 0). */
  _closeFlyouts(keep: number): void {
    while (this._chain.length > keep + 1) {
      this._chain.pop()!.remove();
    }
  },

  /** Close fly-outs the hovered row's own menu is not part of — hovering a
   *  leaf row inside a fly-out must not close that very fly-out. */
  _pruneTo(container: HTMLElement): void {
    let keep = 0;
    for (let i = this._chain.length - 1; i >= 0; i--) {
      if (this._chain[i] === container) {
        keep = i;
        break;
      }
    }
    this._closeFlyouts(keep);
  },

  /** Close all fly-outs once the pointer leaves the whole menu tree. */
  _onLeave(e: MouseEvent): void {
    if (this._chain.length <= 1) return;
    const rt = e.relatedTarget as Node | null;
    if (rt && this._chain.some((p) => p.contains(rt))) return;
    this._closeFlyouts(0);
  },

  _rowText(item: MenuItem): string {
    return item.label != null ? item.label : i18n.t(item.labelKey || "");
  },

  /** Build rows (with hover fly-out wiring) into a menu container. */
  _fill(container: HTMLElement, items: MenuItem[]): void {
    items.forEach((item, i) => {
      if (item.separatorBefore && i > 0) {
        const sep = document.createElement("div");
        sep.className = "ctx-sep";
        container.appendChild(sep);
      }
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "ctx-item" + (item.danger ? " ctx-danger" : "");
      if (item.disabled) btn.classList.add("ctx-disabled");
      if (item.checked) {
        const check = document.createElement("span");
        check.className = "ctx-check";
        check.textContent = "✓";
        btn.appendChild(check);
      }
      const label = document.createElement("span");
      label.className = "ctx-label";
      label.textContent = this._rowText(item);
      btn.appendChild(label);
      const hasSub = !!(item.children && item.children.length);
      if (hasSub) {
        const caret = document.createElement("span");
        caret.className = "ctx-caret";
        caret.textContent = "▸";
        btn.appendChild(caret);
      }
      if (item.title) btn.title = item.title;

      if (!item.disabled) {
        btn.addEventListener("click", () => {
          if (hasSub) return; // hovering already revealed the fly-out
          this.hide();
          if (item.action) item.action();
        });
        btn.addEventListener("mouseenter", () => {
          if (hasSub) this._openSub(btn, item.children!);
          else this._pruneTo(container);
        });
      }
      container.appendChild(btn);
    });
  },

  /** Open (or swap to) a fly-out anchored to the hovered parent row. */
  _openSub(host: HTMLButtonElement, items: MenuItem[]): void {
    // Drop fly-outs that belong to other rows of this same menu.
    this._pruneTo(host.parentElement ?? this._el!);

    const sub = document.createElement("div");
    sub.className = "ctx-sub show";
    this._fill(sub, items);
    document.body.appendChild(sub);
    this._chain.push(sub);
    sub.addEventListener("mouseleave", (e) => this._onLeave(e));

    // Overlap the parent edge by 2 px — an empty gap between the menus would
    // make the pointer flash the fly-out closed while crossing it.
    const hostRect = host.getBoundingClientRect();
    let left = hostRect.right - 2;
    let top = hostRect.top - 2;
    sub.style.left = left + "px";
    sub.style.top = top + "px";

    // Clamp to the viewport; open on the left when there's no room right.
    const rect = sub.getBoundingClientRect();
    if (rect.right > window.innerWidth - 4) {
      left = hostRect.left - rect.width + 2;
    }
    if (rect.bottom > window.innerHeight - 4) {
      top = Math.max(4, rect.top - (rect.bottom - (window.innerHeight - 4)));
    }
    sub.style.left = left + "px";
    sub.style.top = top + "px";
  },

  show(x: number, y: number, items: MenuItem[]): void {
    const el = this._ensure();
    this._closeFlyouts(0);
    el.innerHTML = "";
    this._fill(el, items);

    el.classList.add("show");

    // Clamp to viewport after measuring
    const rect = el.getBoundingClientRect();
    el.style.left = Math.min(x, window.innerWidth - rect.width - 4) + "px";
    el.style.top = Math.min(y, window.innerHeight - rect.height - 4) + "px";
  },
};
