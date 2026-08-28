/* ── Text Tool — stage interactions: marquee (paragraph) + click (point) ── */
import { state } from "../../state";
import { canvas } from "../index";
import { stageToImg, cleanedViewReady, getEditor } from "./shared";
import { createAndEdit } from "./create";

interface DragState {
  startX: number;
  startY: number;
  active: boolean;
}

let marquee: HTMLDivElement | null = null;

function removeMarquee(): void {
  if (marquee) {
    marquee.remove();
    marquee = null;
  }
}

function updateMarquee(x1: number, y1: number, x2: number, y2: number): void {
  if (!marquee) return;
  marquee.style.left = Math.min(x1, x2) + "px";
  marquee.style.top = Math.min(y1, y2) + "px";
  marquee.style.width = Math.abs(x2 - x1) + "px";
  marquee.style.height = Math.abs(y2 - y1) + "px";
}

export function bindStageInteractions(): void {
  const bindWhenReady = function (): void {
    const stage = canvas.getStage();
    if (!stage) {
      setTimeout(bindWhenReady, 500);
      return;
    }
    const container = stage.container();
    const drag: DragState = { startX: 0, startY: 0, active: false };

    stage.on("mousedown touchstart", function (e) {
      if (state.activeTool !== "text") return;
      if (e.evt.button !== 0) return;
      const targetName = e.target.name ? e.target.name() : "";
      const onBackground =
        e.target === stage || targetName === "bg" || targetName === "";
      if (!onBackground) return;
      if (!cleanedViewReady()) return;

      const pos = stage.getPointerPosition();
      if (!pos) return;
      e.cancelBubble = true;

      drag.startX = pos.x;
      drag.startY = pos.y;
      drag.active = true;

      // Rubber-band marquee div
      removeMarquee();
      const div = document.createElement("div");
      div.id = "text-tool-marquee";
      div.style.position = "absolute";
      div.style.border = "1px dashed #e94560";
      div.style.background = "rgba(233,69,96,0.08)";
      div.style.pointerEvents = "none";
      div.style.zIndex = "40";
      container.appendChild(div);
      marquee = div;
    });

    stage.on("mousemove touchmove", function () {
      if (!drag.active) return;
      const pos = stage.getPointerPosition();
      if (pos) updateMarquee(drag.startX, drag.startY, pos.x, pos.y);
    });

    stage.on("mouseup touchend", function () {
      if (!drag.active) return;
      drag.active = false;
      const pos = stage.getPointerPosition();
      const px = pos ? pos.x : drag.startX;
      const py = pos ? pos.y : drag.startY;
      const dx = px - drag.startX;
      const dy = py - drag.startY;
      removeMarquee();
      if (!cleanedViewReady()) return;

      if (Math.abs(dx) > 12 && Math.abs(dy) > 6) {
        // Paragraph text: marquee defines the box
        const a = stageToImg(drag.startX, drag.startY);
        const b = stageToImg(px, py);
        createAndEdit({
          x: Math.min(a.x, b.x),
          y: Math.min(a.y, b.y),
          w: Math.abs(b.x - a.x),
          h: Math.abs(b.y - a.y),
        });
      } else {
        // Point text: default-size box at the click position
        const img = stageToImg(drag.startX, drag.startY);
        createAndEdit({ x: img.x, y: img.y, w: 200, h: 44 });
      }
    });
  };
  bindWhenReady();
}
