/* ── Select Tool — stage interactions: lasso (freeform) + rect (marquee) ──
 * Photoshop-style modifiers:
 *   - plain drag   : single selection — existing selections clear the moment
 *                    a new one starts (click empty to deselect)
 *   - Shift + drag : add — the new shape becomes its own selection; if it
 *                    overlaps an existing selection they MERGE into one
 *   - Alt + drag   : subtract — the shape is carved out of every selection
 *                    it touches (rect − rect exact, polygon − rect clipped)
 *   - Alt + click  : remove that selection
 * Window-level move/up listeners keep the drag alive even when the pointer
 * leaves the canvas.
 */
import { state } from "../../state";
import { canvas } from "../index";
import { history } from "../../history";
import {
  selections,
  activeId,
  setActiveId,
  clearSelections,
  hitTest,
  stageToImg,
  shapesIntersect,
  subtractShape,
  unionOutline,
  isHoleShape,
  type Selection,
  type SelectionShape,
} from "./shared";
import { updatePreview, clearPreview, refreshOverlay } from "./render";
import { syncContextBar, hideContextBar } from "./contextBar";

type Modifier = "add" | "subtract" | null;

interface DragState {
  active: boolean;
  mode: "lasso" | "rect" | null;
  modifier: Modifier;
  startX: number;
  startY: number;
  points: Array<{ x: number; y: number }>;
}

let _bound = false;

function isSelectTool(): boolean {
  return state.activeTool === "lasso" || state.activeTool === "rect";
}

/** Topmost selection under a stage point (later = on top), or null. */
function topmostSelectionAt(sx: number, sy: number): Selection | null {
  for (let i = selections.length - 1; i >= 0; i--) {
    if (hitTest(selections[i], sx, sy)) return selections[i];
  }
  return null;
}

function addSelection(shape: SelectionShape): void {
  const sel: Selection = {
    id: "sel-" + Date.now() + "-" + Math.random().toString(36).slice(2, 7),
    shapes: [shape],
  };
  selections.push(sel);
  setActiveId(sel.id);
  refreshOverlay();
  syncContextBar();
  // Every committed drag is one undo step (doesn't dirty the project).
  history.snapshot({ dirty: false });
}

/** Shift+drag commit: union the new shape into every selection it touches. */
function addOrMerge(shape: SelectionShape): void {
  const hits = selections.filter(function (s) {
    return s.shapes.some(function (sh) {
      return shapesIntersect(sh, shape);
    });
  });
  if (!hits.length) {
    addSelection(shape);
    return;
  }
  // Boolean union: overlapping shapes collapse into ONE exact outline (an
  // L-shape stays an L, no phantom corners), converted to a single
  // detection on "Convert". Non-overlapping Shift additions stay separate.
  const all = hits[0].shapes.slice();
  hits.slice(1).forEach(function (o) {
    all.push.apply(all, o.shapes);
  });
  all.push(shape);
  // Hole loops are empty space, not solid region — exclude them from the
  // union so a merged shape stays exact.
  const solids = all.filter(function (sh, i) {
    const others = all.slice(0, i).concat(all.slice(i + 1));
    return !isHoleShape(others, sh);
  });
  const target = hits[0];
  target.shapes = unionOutline(solids).map(function (loop) {
    return { kind: "polygon", points: loop };
  });
  hits.slice(1).forEach(function (o) {
    const idx = selections.indexOf(o);
    if (idx >= 0) selections.splice(idx, 1);
  });
  setActiveId(target.id);
  refreshOverlay();
  syncContextBar();
  history.snapshot({ dirty: false });
}

/** Alt+drag commit: carve the shape out of every selection it touches. */
function subtractFromSelections(shape: SelectionShape): void {
  for (let i = selections.length - 1; i >= 0; i--) {
    const s = selections[i];
    const next: SelectionShape[] = [];
    s.shapes.forEach(function (sh) {
      next.push.apply(next, subtractShape(sh, shape));
    });
    if (next.length === 0) selections.splice(i, 1);
    else s.shapes = next;
  }
  if (
    !activeId ||
    !selections.some(function (s) {
      return s.id === activeId;
    })
  ) {
    setActiveId(
      selections.length ? selections[selections.length - 1].id : null,
    );
  }
  refreshOverlay();
  syncContextBar();
  history.snapshot({ dirty: false });
}

/** Alt+click: delete just that selection. */
function removeSelection(id: string): void {
  const idx = selections.findIndex(function (s) {
    return s.id === id;
  });
  if (idx < 0) return;
  selections.splice(idx, 1);
  if (activeId === id) {
    setActiveId(
      selections.length ? selections[selections.length - 1].id : null,
    );
  }
  refreshOverlay();
  syncContextBar();
  history.snapshot({ dirty: false });
}

export function bindStageInteractions(): void {
  if (_bound) return;
  const bindWhenReady = function (): void {
    const stage = canvas.getStage();
    if (!stage) {
      setTimeout(bindWhenReady, 500);
      return;
    }
    _bound = true;

    const drag: DragState = {
      active: false,
      mode: null,
      modifier: null,
      startX: 0,
      startY: 0,
      points: [],
    };

    stage.on("mousedown touchstart", function (e) {
      if (!isSelectTool()) return;
      if (e.evt.button !== 0) return;
      const targetName = e.target.name ? e.target.name() : "";
      const onBackground =
        e.target === stage || targetName === "bg" || targetName === "";
      if (!onBackground) return;
      if (!state.getActivePage()) return;
      const pos = stage.getPointerPosition();
      if (!pos) return;
      e.cancelBubble = true;

      // Plain drag = single selection: starting on empty canvas drops any
      // existing selections right away (Shift/Alt keep them for merge/cut).
      const modifier: Modifier = e.evt.shiftKey
        ? "add"
        : e.evt.altKey
          ? "subtract"
          : null;
      if (!modifier && !topmostSelectionAt(pos.x, pos.y)) {
        clearSelections();
        refreshOverlay();
        hideContextBar();
      }

      drag.active = true;
      drag.mode = state.activeTool as "lasso" | "rect";
      drag.modifier = modifier;
      drag.startX = pos.x;
      drag.startY = pos.y;
      drag.points = [{ x: pos.x, y: pos.y }];
      updatePreview(drag.mode, drag.points, pos.x, pos.y);

      const getXY = function (ev: MouseEvent | TouchEvent): {
        x: number;
        y: number;
      } {
        const t =
          (ev as TouchEvent).touches || (ev as TouchEvent).changedTouches;
        if (t && t.length) return { x: t[0].clientX, y: t[0].clientY };
        const m = ev as MouseEvent;
        return { x: m.clientX, y: m.clientY };
      };

      const onMove = function (ev: MouseEvent | TouchEvent): void {
        if (!drag.active) return;
        const rect = stage.container().getBoundingClientRect();
        const xy = getXY(ev);
        const sx = xy.x - rect.left;
        const sy = xy.y - rect.top;
        if (drag.mode === "lasso") {
          const last = drag.points[drag.points.length - 1];
          const dx = sx - last.x;
          const dy = sy - last.y;
          // Throttle sampling (~6px) so huge drags stay cheap
          if (dx * dx + dy * dy >= 36) {
            drag.points.push({ x: sx, y: sy });
          }
          updatePreview("lasso", drag.points, sx, sy);
        } else {
          updatePreview("rect", drag.points, sx, sy);
        }
      };

      const onUp = function (ev: MouseEvent | TouchEvent): void {
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
        window.removeEventListener("touchmove", onMove);
        window.removeEventListener("touchend", onUp);
        if (!drag.active) return;
        drag.active = false;
        clearPreview();
        const rect = stage.container().getBoundingClientRect();
        const xy = getXY(ev);
        const px = xy.x - rect.left;
        const py = xy.y - rect.top;
        const moved = Math.hypot(px - drag.startX, py - drag.startY);

        if (moved < 5) {
          // Click: activate selection under cursor; Alt+click removes it;
          // plain click on empty clears; Shift/Alt click on empty keeps.
          const hit = topmostSelectionAt(px, py);
          if (hit) {
            if (drag.modifier === "subtract") removeSelection(hit.id);
            else setActiveId(hit.id);
            refreshOverlay();
            syncContextBar();
          } else if (!drag.modifier) {
            clearSelections();
            refreshOverlay();
            hideContextBar();
            // Click-empty deselect is undoable too (reselects on Ctrl+Z).
            history.snapshot({ dirty: false });
          }
          return;
        }

        let shape: SelectionShape;
        if (drag.mode === "rect") {
          const a = stageToImg(drag.startX, drag.startY);
          const b = stageToImg(px, py);
          if (Math.abs(b.x - a.x) < 6 || Math.abs(b.y - a.y) < 6) return;
          shape = {
            kind: "rect",
            x: Math.min(a.x, b.x),
            y: Math.min(a.y, b.y),
            w: Math.abs(b.x - a.x),
            h: Math.abs(b.y - a.y),
          };
        } else {
          // Close the polygon with the release point
          const pts = drag.points.map(function (p) {
            return stageToImg(p.x, p.y);
          });
          const end = stageToImg(px, py);
          pts.push(end);
          if (pts.length < 3) return;
          shape = { kind: "polygon", points: pts };
        }

        if (drag.modifier === "add") addOrMerge(shape);
        else if (drag.modifier === "subtract") subtractFromSelections(shape);
        else {
          clearSelections();
          addSelection(shape);
        }
      };

      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
      window.addEventListener("touchmove", onMove, { passive: false });
      window.addEventListener("touchend", onUp);
    });
  };
  bindWhenReady();
}
