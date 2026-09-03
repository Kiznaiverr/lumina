/* ── Auto text normalization ──
 * OCR/LLM output is treated as ONE line per box — newlines coming from a
 * model are layout artifacts (the bubble was split into lines), not real
 * line breaks: this project models one box = one line. Manual edits typed
 * in the layer editor are never passed through this.
 */
export function normalizeAutoText(text: string): string {
  // Collapse every whitespace run (incl. \n, \r, \t, ideographic space)
  // into a single regular space, then trim.
  return text.replace(/[\s\u3000]+/g, " ").trim();
}
