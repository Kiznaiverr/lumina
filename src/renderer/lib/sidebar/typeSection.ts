/* ── Sidebar: TypeSection (koharu-style typography inspector) ──
 * Fixed-height section at the top of the sidebar. Hidden entirely when no
 * text layer is selected. Every change applies live to the selected layer.
 */
import { state } from "../state";
import * as i18n from "../i18n";
import { canvas } from "../canvas/index";
import { history } from "../history";
import { internalFontName } from "../fontLoader";
import { loadGlobalTypography, saveGlobalTypography } from "../../types";
import type { Page, PageLayer, Typography } from "../../types";

const FONT_SIZE_PRESETS = [
  8, 9, 10, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48, 64, 72, 96,
];
const WEIGHTS = [400, 500, 600, 700, 800, 900];

const TYPE_COLLAPSED_KEY = "lumina-type-collapsed";
let _collapsed = localStorage.getItem(TYPE_COLLAPSED_KEY) === "1";

/** Global type defaults — new layers inherit these (Photoshop-style) */
let _globalType: Typography = loadGlobalTypography();

function selectedTextLayer(page: Page | null): PageLayer | null {
  if (!page || !page._selectedLayerId) return null;
  const layer = page.layers.find(function (l) {
    return l.id === page._selectedLayerId;
  });
  if (!layer) return null;
  if (layer.type === "text-dialogue" || layer.type === "text-free")
    return layer;
  return null;
}

export const typeSection = {
  isCollapsed(): boolean {
    return _collapsed;
  },

  toggleCollapsed(): void {
    _collapsed = !_collapsed;
    localStorage.setItem(TYPE_COLLAPSED_KEY, _collapsed ? "1" : "0");
  },

  /** Build DOM once; visibility toggled on each sidebar render */
  build(host: HTMLElement): void {
    host.className =
      "type-section shrink-0 border-b border-surface-3 overflow-y-auto";
    host.id = "type-section";
    host.classList.toggle("type-collapsed", _collapsed);

    // Header — clicking it collapses/expands the section (persisted)
    const header = document.createElement("div");
    header.className = "layer-header type-header";
    header.innerHTML =
      '<i data-lucide="type" class="layer-header-icon"></i>' +
      "<span>" +
      i18n.t("type.title") +
      "</span>";
    const chev = document.createElement("button");
    chev.className = "type-collapse-btn";
    chev.dataset.lucide = _collapsed ? "chevron-down" : "chevron-up";
    chev.title = i18n.t(_collapsed ? "type.expand" : "type.collapse");
    header.appendChild(chev);
    host.appendChild(header);

    const body = document.createElement("div");
    body.className = "p-2 flex flex-col gap-1.5";
    body.id = "type-body";
    host.appendChild(body);

    // Row 1: Font + Color
    const row1 = this._grid("minmax(0,1fr) minmax(0,40px)");
    row1.appendChild(this._field(i18n.t("type.font"), this._fontSelect()));
    row1.appendChild(this._field(i18n.t("type.color"), this._colorInput()));
    body.appendChild(row1);

    // Row 2: Size + Weight + Style
    const row2 = this._grid("minmax(0,1fr) minmax(0,64px) minmax(0,72px)");
    row2.appendChild(this._field(i18n.t("type.size"), this._sizeField()));
    row2.appendChild(this._field(i18n.t("type.weight"), this._weightSelect()));
    row2.appendChild(this._field(i18n.t("type.style"), this._styleSelect()));
    body.appendChild(row2);

    // Row 3: Alignment (full width — direction note removed)
    const row3 = this._grid("minmax(0,1fr)");
    row3.appendChild(
      this._field(i18n.t("type.alignment"), this._alignSegmented()),
    );
    body.appendChild(row3);

    // Row 4: Border — toggle + color + width steppers
    const row4 = this._grid("minmax(0,26px) minmax(0,1fr) minmax(0,1fr)");
    row4.appendChild(
      this._field(i18n.t("type.strokeColor"), this._strokeToggle()),
    );
    row4.appendChild(this._field("", this._strokeColorInput()));
    row4.appendChild(
      this._field(i18n.t("type.strokeWidth"), this._strokeWidth()),
    );
    body.appendChild(row4);

    // Row 5: Rotation — stepper + reset-to-0
    const row5 = this._grid("minmax(0,1fr)");
    row5.appendChild(
      this._field(i18n.t("type.rotation"), this._rotationField()),
    );
    body.appendChild(row5);

    // Row 6: Auto-fit — full-width button
    const autofitBtn = document.createElement("button");
    autofitBtn.id = "type-autofit";
    autofitBtn.className = "field-select type-align-btn type-autofit-btn";
    autofitBtn.textContent = i18n.t("type.autoFit");
    autofitBtn.addEventListener("click", function () {
      const page: Page | null = state.getActivePage();
      const layer = selectedTextLayer(page);
      if (!layer) return;
      layer.typography.fontSize = null; // re-arm auto-fit
      canvas.render();
      history.snapshot();
      typeSection.refresh();
    });
    body.appendChild(autofitBtn);
  },

  /** Refresh control values from the selected layer */
  refresh(): void {
    const host = document.getElementById("type-section");
    if (!host) return;
    const page: Page | null = state.getActivePage();
    const layer = selectedTextLayer(page);
    // Always visible; no selection edits the global defaults (which new
    // layers inherit), selection edits the layer. Only layer-bound controls
    // (auto-fit) are disabled without a selection.
    host.classList.remove("hidden");
    host.classList.toggle("type-disabled", false);
    host
      .querySelectorAll<
        HTMLInputElement | HTMLSelectElement | HTMLButtonElement
      >("input, select, button")
      .forEach(function (el) {
        el.disabled = false;
      });
    if (!layer) {
      const af = host.querySelector<HTMLButtonElement>("#type-autofit");
      if (af) af.disabled = true;
    }
    const t = layer ? layer.typography : _globalType;
    const set = function (id: string, value: string): void {
      const el = host.querySelector<HTMLInputElement | HTMLSelectElement>(
        "#" + id,
      );
      if (el && document.activeElement !== el) el.value = value;
    };
    set("type-font", t.fontFamily || "");
    set("type-color", t.color);
    set("type-size", t.fontSize === null ? "" : String(t.fontSize));
    set("type-weight", String(t.fontWeight));
    set("type-style", t.fontStyle);
    set("type-stroke-color", t.strokeColor || "#ffffff");
    set("type-stroke-width", String(t.strokeWidth));
    set("type-rotation", String(Math.round(t.rotation)));

    // Alignment segmented active state
    host
      .querySelectorAll<HTMLButtonElement>("[data-align]")
      .forEach(function (btn) {
        btn.classList.toggle("active", btn.dataset.align === t.align);
      });
    // Stroke toggle visual
    const strokeToggle =
      host.querySelector<HTMLButtonElement>("#type-stroke-on");
    if (strokeToggle)
      strokeToggle.classList.toggle(
        "active",
        !!t.strokeColor && t.strokeWidth > 0,
      );
    // Color well dims while the border is off
    const strokeColor =
      host.querySelector<HTMLInputElement>("#type-stroke-color");
    if (strokeColor)
      strokeColor.classList.toggle(
        "off",
        !(t.strokeColor && t.strokeWidth > 0),
      );
    // Auto-fit active state (fontSize null = fitted by the box)
    const autoFitBtn = host.querySelector<HTMLButtonElement>("#type-autofit");
    if (autoFitBtn) autoFitBtn.classList.toggle("active", t.fontSize === null);
  },

  // ── Control factories ──

  _grid(cols: string): HTMLElement {
    const div = document.createElement("div");
    div.style.display = "grid";
    div.style.gridTemplateColumns = cols;
    div.style.gap = "6px";
    return div;
  },

  _field(labelText: string, control: HTMLElement): HTMLElement {
    const wrap = document.createElement("div");
    wrap.className = "flex flex-col gap-0.5 min-w-0";
    const label = document.createElement("span");
    label.className = "type-field-label";
    label.textContent = labelText;
    wrap.appendChild(label);
    wrap.appendChild(control);
    return wrap;
  },

  /** Font select with a search input on top (native select + filter) */
  _fontSelect(): HTMLElement {
    const wrap = document.createElement("div");
    wrap.className = "font-picker";
    const sel = document.createElement("select");
    sel.id = "type-font";
    sel.className = "field-select";
    const def = document.createElement("option");
    def.value = "";
    def.textContent = i18n.t("type.defaultFont");
    sel.appendChild(def);
    (state.fontList || []).forEach(function (f) {
      const opt = document.createElement("option");
      opt.value = internalFontName(f.family);
      opt.textContent = f.family;
      opt.style.fontFamily = f.family;
      sel.appendChild(opt);
    });
    sel.addEventListener("change", function () {
      typeSection._apply({ fontFamily: this.value || null });
    });
    wrap.appendChild(sel);

    // Search box filters the select options live
    const search = document.createElement("input");
    search.type = "text";
    search.className = "field-select mt-0.5";
    search.placeholder = i18n.t("type.searchFont");
    search.addEventListener("input", function () {
      const q = this.value.toLowerCase();
      Array.from(sel.options).forEach(function (opt) {
        const name = (opt.textContent || "").toLowerCase();
        opt.hidden = q !== "" && name.indexOf(q) === -1 && opt.value !== "";
      });
      // Auto-select first visible non-default match while searching
      if (q) {
        const first = Array.from(sel.options).find(
          (o) => !o.hidden && o.value !== "",
        );
        if (first) sel.value = first.value;
      }
    });
    search.addEventListener("change", function () {
      typeSection._apply({ fontFamily: sel.value || null });
    });
    wrap.appendChild(search);
    return wrap;
  },
  _colorInput(): HTMLElement {
    const input = document.createElement("input");
    input.type = "color";
    input.id = "type-color";
    input.className = "type-color-well";
    input.value = "#111111";
    input.addEventListener("input", function () {
      typeSection._apply({ color: this.value });
    });
    return input;
  },

  _sizeField(): HTMLElement {
    const wrap = document.createElement("div");
    wrap.className = "flex";
    const input = document.createElement("input");
    input.type = "number";
    input.id = "type-size";
    input.className = "field-select w-full min-w-0";
    input.placeholder = i18n.t("type.auto");
    input.min = "4";
    input.max = "300";
    input.addEventListener("change", function () {
      const v = parseFloat(this.value);
      typeSection._apply({
        fontSize: Number.isFinite(v) && v > 0 ? v : null,
      });
    });
    wrap.appendChild(input);

    const btn = document.createElement("button");
    btn.className = "type-size-btn";
    btn.innerHTML = "▾";
    btn.title = i18n.t("type.presets");
    btn.addEventListener("click", function () {
      const existing = document.getElementById("type-size-presets");
      if (existing) {
        existing.remove();
        return;
      }
      const menu = document.createElement("div");
      menu.id = "type-size-presets";
      menu.className = "type-size-menu";
      FONT_SIZE_PRESETS.forEach(function (s) {
        const item = document.createElement("button");
        item.className = "type-size-item";
        item.textContent = String(s);
        item.addEventListener("click", function () {
          input.value = String(s);
          typeSection._apply({ fontSize: s });
          menu.remove();
        });
        menu.appendChild(item);
      });
      wrap.appendChild(menu);
    });
    wrap.appendChild(btn);
    return wrap;
  },

  _weightSelect(): HTMLElement {
    const sel = document.createElement("select");
    sel.id = "type-weight";
    sel.className = "field-select";
    WEIGHTS.forEach(function (w) {
      const opt = document.createElement("option");
      opt.value = String(w);
      opt.textContent = String(w);
      sel.appendChild(opt);
    });
    sel.addEventListener("change", function () {
      typeSection._apply({ fontWeight: parseInt(this.value, 10) });
    });
    return sel;
  },

  _styleSelect(): HTMLElement {
    const sel = document.createElement("select");
    sel.id = "type-style";
    sel.className = "field-select";
    for (const [value, key] of [
      ["normal", "type.styles.normal"],
      ["italic", "type.styles.italic"],
    ] as const) {
      const opt = document.createElement("option");
      opt.value = value;
      opt.textContent = i18n.t(key);
      sel.appendChild(opt);
    }
    sel.addEventListener("change", function () {
      typeSection._apply({
        fontStyle: this.value as Typography["fontStyle"],
      });
    });
    return sel;
  },

  _alignSegmented(): HTMLElement {
    const wrap = document.createElement("div");
    wrap.className = "type-align-seg";
    for (const [value, icon] of [
      ["left", "align-left"],
      ["center", "align-center"],
      ["right", "align-right"],
    ] as const) {
      const btn = document.createElement("button");
      btn.dataset.align = value;
      btn.className = "type-align-btn";
      btn.innerHTML = '<i data-lucide="' + icon + '"></i>';
      btn.addEventListener("click", function () {
        typeSection._apply({ align: value });
      });
      wrap.appendChild(btn);
    }
    return wrap;
  },

  /** Border on/off toggle — works on the selected layer, or the global
   * default when nothing is selected. */
  _strokeToggle(): HTMLElement {
    const toggle = document.createElement("button");
    toggle.id = "type-stroke-on";
    toggle.className = "type-align-btn type-square-toggle";
    toggle.innerHTML = '<i data-lucide="square"></i>';
    toggle.title = i18n.t("type.strokeColor");
    toggle.addEventListener("click", function () {
      if (typeSection._strokeActive()) {
        typeSection._apply({ strokeColor: null, strokeWidth: 0 });
      } else {
        typeSection._apply({
          strokeColor: typeSection._currentStrokeColor(),
          strokeWidth: Math.max(1, typeSection._currentStrokeWidth()),
        });
      }
    });
    return toggle;
  },

  _strokeColorInput(): HTMLElement {
    const input = document.createElement("input");
    input.type = "color";
    input.id = "type-stroke-color";
    input.className = "type-color-well type-color-well-flex";
    input.value = "#ffffff";
    input.addEventListener("input", function () {
      typeSection._apply({
        strokeColor: this.value,
        strokeWidth: Math.max(1, typeSection._currentStrokeWidth()),
      });
    });
    return input;
  },

  _strokeActive(): boolean {
    const page: Page | null = state.getActivePage();
    const layer = selectedTextLayer(page);
    const t = layer ? layer.typography : _globalType;
    return !!t.strokeColor && t.strokeWidth > 0;
  },

  _strokeWidth(): HTMLElement {
    const minus = document.createElement("button");
    minus.className = "type-step-btn";
    minus.textContent = "−";
    const num = document.createElement("input");
    num.type = "number";
    num.id = "type-stroke-width";
    num.className = "field-select type-width-num";
    num.min = "0";
    num.max = "20";
    num.step = "0.5";
    const plus = document.createElement("button");
    plus.className = "type-step-btn";
    plus.textContent = "+";
    minus.addEventListener("click", function () {
      num.value = String(Math.max(0, parseFloat(num.value || "0") - 0.5));
      num.dispatchEvent(new Event("change"));
    });
    plus.addEventListener("click", function () {
      num.value = String(parseFloat(num.value || "0") + 0.5);
      num.dispatchEvent(new Event("change"));
    });
    num.addEventListener("change", function () {
      const v = Math.max(0, parseFloat(this.value || "0"));
      typeSection._apply({
        strokeWidth: v,
        strokeColor: v > 0 ? typeSection._currentStrokeColor() : null,
      });
    });
    const wrap = document.createElement("div");
    wrap.className = "flex items-center gap-1";
    wrap.appendChild(minus);
    wrap.appendChild(num);
    wrap.appendChild(plus);
    return wrap;
  },

  _currentStrokeWidth(): number {
    const el = document.getElementById("type-stroke-width") as HTMLInputElement;
    return el ? parseFloat(el.value || "0") : 4;
  },

  _rotationField(): HTMLElement {
    const wrap = document.createElement("div");
    wrap.className = "flex items-center gap-1";
    const minus = document.createElement("button");
    minus.className = "type-step-btn";
    minus.textContent = "−";
    const num = document.createElement("input");
    num.type = "number";
    num.id = "type-rotation";
    num.className = "field-select type-width-num";
    num.min = "-45";
    num.max = "45";
    num.step = "1";
    num.value = "0";
    const plus = document.createElement("button");
    plus.className = "type-step-btn";
    plus.textContent = "+";
    const reset = document.createElement("button");
    reset.id = "type-rotation-reset";
    reset.className = "type-step-btn";
    reset.textContent = "↺";
    reset.title = i18n.t("type.rotationReset");
    const commit = function (): void {
      const v = Math.max(-45, Math.min(45, parseFloat(num.value || "0")));
      typeSection._apply({ rotation: Number.isFinite(v) ? v : 0 });
    };
    minus.addEventListener("click", function () {
      num.value = String(Math.max(-45, parseFloat(num.value || "0") - 1));
      commit();
    });
    plus.addEventListener("click", function () {
      num.value = String(Math.min(45, parseFloat(num.value || "0") + 1));
      commit();
    });
    reset.addEventListener("click", function () {
      num.value = "0";
      commit();
    });
    num.addEventListener("change", commit);
    wrap.appendChild(minus);
    wrap.appendChild(num);
    wrap.appendChild(plus);
    wrap.appendChild(reset);
    return wrap;
  },

  _currentStrokeColor(): string | null {
    const el = document.getElementById("type-stroke-color") as HTMLInputElement;
    return el ? el.value : "#ffffff";
  },

  /** Apply a partial typography update. With a text layer selected it goes
   * to that layer; without one it updates the global defaults (persisted). */
  _apply(patch: Partial<Typography>): void {
    const page: Page | null = state.getActivePage();
    const layer = selectedTextLayer(page);
    if (!layer) {
      Object.assign(_globalType, patch);
      saveGlobalTypography(_globalType);
      return;
    }
    Object.assign(layer.typography, patch);
    canvas.render();
    history.snapshot();
    typeSection.refresh(); // keep toggles/segments/alerts in sync
  },
};
