/* ── Bucket fill (single click) ──
 * Flood-fills the cleanup layer against the composite image and commits
 * immediately (same undo granularity as a brush stroke).
 */
import type { Page } from "../../../types";
import { canvas } from "../index";
import { ensureCleanupMask, ensureCleanupCanvas } from "./shared";
import { applyBucket, clearSprite } from "./strokes";
import { requireCleanup } from "./guard";
import { commitStroke } from "./commit";

export function handleBucket(page: Page, img: { x: number; y: number }): void {
  if (!requireCleanup(page)) return;
  ensureCleanupMask(page);
  ensureCleanupCanvas(page);
  clearSprite();
  const changed = applyBucket(page, img.x, img.y);
  canvas.render();
  // Bucket is a single synchronous click — commit right away (the
  // snapshot is taken at stroke-end, same undo granularity as brush).
  void commitStroke(page, changed);
}
