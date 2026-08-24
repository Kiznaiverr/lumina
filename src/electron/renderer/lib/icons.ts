/* ── Lucide icon rendering (bundled) ──
 * npm build of lucide requires the explicit `icons` map —
 * unlike the UMD/CDN build which bundles every icon. */
import { createIcons as _createIcons, icons } from "lucide";
import type { CreateIconsOptions } from "lucide";

export function createIcons(
  options: Omit<CreateIconsOptions, "icons"> = {},
): void {
  _createIcons({ ...options, icons });
}
