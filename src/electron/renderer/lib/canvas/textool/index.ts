/* ── Text Tool — public entry point ──
 * Photoshop-style text tool:
 *   - Point text  : single click → default box, grows with content
 *   - Paragraph   : click-drag marquee → fixed box, wrapped text
 *   - Transformer : move (drag), resize (side anchors), scale font (corners)
 *   - In-place edit: textarea overlaid exactly on the text box
 *
 * Module layout:
 *   shared.ts       — node list, editor state, coordinate helpers
 *   nodeFactory.ts  — Konva.Text factory (auto-fit)
 *   nodes.ts        — node lifecycle + event wiring (renderLayerTextNodes)
 *   transformer.ts  — Konva.Transformer (move/resize/scale)
 *   editor.ts       — in-place textarea editing
 *   create.ts       — free text layer creation
 *   interactions.ts — stage marquee/click bindings
 */
import { getEditor } from "./shared";
import { removeEditor } from "./editor";
import { bindStageInteractions } from "./interactions";

let _bound = false;

export function bindTextTool(): void {
  if (_bound) return;
  _bound = true;

  // Commit open editor when clicking anywhere outside it,
  // EXCEPT when clicking form controls (sidebar dropdowns/inputs).
  document.addEventListener("mousedown", function (e) {
    const ta = getEditor();
    if (!ta) return;
    const target = e.target as HTMLElement;
    // Don't commit if clicking a form element outside the editor itself —
    // user is just navigating the sidebar (font/size/color pickers etc.)
    if (target !== ta && target.closest("select, input, textarea, button")) {
      return;
    }
    ta.blur();
  });

  bindStageInteractions();
}

export { renderLayerTextNodes } from "./nodes";

export const textTool = {
  get editing(): boolean {
    return getEditor() !== null;
  },
  cancelEdit(): void {
    removeEditor(true);
  },
};
