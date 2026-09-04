/* ── Brush / eraser drag stroke ──
 * Starts a stroke on mousedown and stamps the brush sprite along the
 * pointer path until mouseup/touchend, then commits (serialize + snapshot).
 */
import type { Page } from "../../../types";
import { canvas } from "../index";
import { ensureCleanupMask, ensureCleanupCanvas, stageToImg } from "./shared";
import { applyStroke, clearSprite } from "./strokes";
import { requireCleanup } from "./guard";
import { commitStroke } from "./commit";
import { updateCursor } from "./cursor";

let _dragging = false;
let _points: Array<{ x: number; y: number }> = [];
let _mode: "brush" | "eraser" | null = null;

export function handleStroke(
  page: Page,
  img: { x: number; y: number },
  mode: "brush" | "eraser",
): void {
  if (!requireCleanup(page)) return;
  ensureCleanupMask(page);
  ensureCleanupCanvas(page);
  clearSprite();
  _dragging = true;
  _mode = mode;
  _points = [{ x: img.x, y: img.y }];
  applyStroke(page, _points, _mode);
  canvas.render();

  const getXY = function (ev: MouseEvent | TouchEvent): {
    x: number;
    y: number;
  } {
    const t = (ev as TouchEvent).touches || (ev as TouchEvent).changedTouches;
    if (t && t.length) return { x: t[0].clientX, y: t[0].clientY };
    const m = ev as MouseEvent;
    return { x: m.clientX, y: m.clientY };
  };

  const onMove = function (ev: MouseEvent | TouchEvent): void {
    if (!_dragging) return;
    const rect = canvas.getStage()!.container().getBoundingClientRect();
    const xy = getXY(ev);
    const p = stageToImg(xy.x - rect.left, xy.y - rect.top);
    _points.push(p);
    applyStroke(page, [_points[_points.length - 2], p], _mode!);
    updateCursor(xy.x - rect.left, xy.y - rect.top);
    canvas.render();
  };

  const onUp = function (): void {
    window.removeEventListener("mousemove", onMove);
    window.removeEventListener("mouseup", onUp);
    window.removeEventListener("touchmove", onMove);
    window.removeEventListener("touchend", onUp);
    if (!_dragging) return;
    _dragging = false;
    const changed = _points.length > 0;
    _mode = null;
    _points = [];
    void commitStroke(page, changed);
  };

  window.addEventListener("mousemove", onMove);
  window.addEventListener("mouseup", onUp);
  window.addEventListener("touchmove", onMove);
  window.addEventListener("touchend", onUp);
}
