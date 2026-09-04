/* ── Range slider styling helper ──
 * Custom track fill: sets a `--fill` CSS var (0-100%) that the .slider
 * track gradient consumes, so the filled portion reflects the value
 * (VS Code style). Call after the slider gains a value, and on input.
 */
export function setSliderFill(el: HTMLInputElement): void {
  if (el.type !== "range") return;
  const min = el.min !== "" ? parseFloat(el.min) : 0;
  const max = el.max !== "" ? parseFloat(el.max) : 100;
  const val = parseFloat(el.value);
  const pct = max > min ? ((val - min) / (max - min)) * 100 : 0;
  el.style.setProperty("--fill", Math.round(pct) + "%");
}

/** Wire a range input: fills the track live and keeps an optional value
 *  label (`#<id>-value` or a sibling with class .slider-value) in sync. */
export function wireSlider(el: HTMLInputElement): void {
  if (el.type !== "range") return;
  const label = document.querySelector<HTMLElement>("#" + el.id + "-value");
  const update = function (): void {
    setSliderFill(el);
    if (label) {
      const v = el.value;
      label.textContent =
        el.getAttribute("data-suffix") === "percent" ? v + "%" : v;
    }
  };
  setSliderFill(el);
  update();
  el.addEventListener("input", update);
}
