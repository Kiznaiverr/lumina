/* ── Header paint options bar (brush/eraser/bucket/eyedropper) ──
 * Show/hide is driven by paintool's onToolChange wrapper (syncOptionsBar);
 * this module only wires the controls. All changes persist via the
 * paintSettings setters (localStorage).
 */
import {
  paintSettings,
  setPaintColor,
  setPaintSize,
  setPaintOpacity,
  setPaintHardness,
  setPaintTolerance,
  setPaintContiguous,
  resetPaintSettings,
} from "./canvas/paintool/shared";
import { clearSprite } from "./canvas/paintool/strokes";
import { syncOptionsBar } from "./canvas/paintool/index";
import { wireSlider } from "./slider";
import { state } from "./state";

export function initPaintOptions(): void {
  const el = document.getElementById("paint-options");
  if (!el) return;

  const label = function (id: string): HTMLElement | null {
    return el.querySelector<HTMLElement>("#" + id + "-value");
  };

  const color = el.querySelector<HTMLInputElement>("#paint-color");
  if (color) {
    color.addEventListener("input", function () {
      setPaintColor(color.value);
      clearSprite();
    });
  }

  const size = el.querySelector<HTMLInputElement>("#paint-size");
  if (size) {
    size.addEventListener("input", function () {
      setPaintSize(parseInt(size.value, 10));
      const l = label("paint-size");
      if (l) l.textContent = String(Math.round(paintSettings().size));
      clearSprite();
    });
    wireSlider(size);
  }

  const opacity = el.querySelector<HTMLInputElement>("#paint-opacity");
  if (opacity) {
    opacity.addEventListener("input", function () {
      setPaintOpacity(parseInt(opacity.value, 10) / 100);
      const l = label("paint-opacity");
      if (l) l.textContent = Math.round(paintSettings().opacity * 100) + "%";
      clearSprite();
    });
    wireSlider(opacity);
  }

  const hardness = el.querySelector<HTMLInputElement>("#paint-hardness");
  if (hardness) {
    hardness.addEventListener("input", function () {
      setPaintHardness(parseInt(hardness.value, 10));
      const l = label("paint-hardness");
      if (l) l.textContent = paintSettings().hardness + "%";
      clearSprite();
    });
    wireSlider(hardness);
  }

  const tolerance = el.querySelector<HTMLInputElement>("#paint-tolerance");
  if (tolerance) {
    tolerance.addEventListener("input", function () {
      setPaintTolerance(parseInt(tolerance.value, 10));
      const l = label("paint-tolerance");
      if (l) l.textContent = String(paintSettings().tolerance);
    });
    wireSlider(tolerance);
  }

  const contiguous = el.querySelector<HTMLInputElement>("#paint-contiguous");
  if (contiguous) {
    contiguous.addEventListener("change", function () {
      setPaintContiguous(contiguous.checked);
    });
  }

  // Reset to defaults — restores every setting and re-syncs the bar.
  const reset = el.querySelector<HTMLButtonElement>("#paint-reset");
  if (reset) {
    reset.addEventListener("click", function () {
      resetPaintSettings();
      clearSprite();
      syncOptionsBar(state.activeTool);
    });
  }
}
