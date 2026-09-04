/* ── Composite-color sampling (eyedropper / bucket seed) ──
 * Reads the 1×1 composite region (bg + visible inpaint patches + cleanup)
 * and returns the hex color, or null for fully transparent pixels.
 */
import type { Page } from "../../../types";
import { compositeRegion } from "./shared";

export function sampleComposite(
  page: Page,
  x: number,
  y: number,
): string | null {
  const c = compositeRegion(page, x, y, 1, 1);
  const d = c.getContext("2d")!.getImageData(0, 0, 1, 1).data;
  if (d[3] === 0) return null; // fully transparent — nothing to sample
  const hex =
    "#" +
    [d[0], d[1], d[2]]
      .map(function (v) {
        return v.toString(16).padStart(2, "0");
      })
      .join("");
  return hex;
}
