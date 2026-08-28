/* ── Lumina Canvas — Konva group registry (shared state) ──
 * Holds the per-render text/bubble groups and transformers so the split
 * modules (groups/selection/mutations/layers) can share them without
 * circular imports.
 */
import Konva from "konva";

const _textGroups: Konva.Group[] = [];
const _bubbleGroups: Konva.Group[] = [];
let _textTransformer: Konva.Transformer | null = null;
let _bubbleTransformer: Konva.Transformer | null = null;

export const groupRegistry = {
  textGroups(): Konva.Group[] {
    return _textGroups;
  },
  bubbleGroups(): Konva.Group[] {
    return _bubbleGroups;
  },
  textTransformer(): Konva.Transformer | null {
    return _textTransformer;
  },
  bubbleTransformer(): Konva.Transformer | null {
    return _bubbleTransformer;
  },
  setTextTransformer(t: Konva.Transformer | null): void {
    _textTransformer = t;
  },
  setBubbleTransformer(t: Konva.Transformer | null): void {
    _bubbleTransformer = t;
  },
  pushTextGroup(g: Konva.Group): void {
    _textGroups.push(g);
  },
  pushBubbleGroup(g: Konva.Group): void {
    _bubbleGroups.push(g);
  },
  clear(): void {
    _textGroups.length = 0;
    _bubbleGroups.length = 0;
    _textTransformer = null;
    _bubbleTransformer = null;
  },
};
