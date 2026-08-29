/* ── Model description registry ──
 * Bilingual (en/id) copy per model id. Merge of category files; the
 * renderer fills `ModelInfo.description` from here in models.check(), so
 * the backend no longer ships descriptions.
 */
export interface ModelDesc {
  en: string;
  id: string;
}

export type ModelDescMap = Record<string, ModelDesc>;

import { DETECT_DESCS } from "./detect";
import { OCR_DESCS } from "./ocr";
import { INPAINT_DESCS } from "./inpaint";

const ALL: ModelDescMap = {
  ...DETECT_DESCS,
  ...OCR_DESCS,
  ...INPAINT_DESCS,
};

/** Description for a model id in the given language; "" when unknown. */
export function describe(id: string, lang: string): string {
  const d = ALL[id];
  if (!d) return "";
  if (lang === "id") return d.id;
  return d.en;
}

/** Recommended model per kind — badge in the UI + default pick. */
export const RECOMMENDED: Record<string, string> = {
  detect: "rtdetr",
  ocr: "baberu",
  inpaint: "lama_manga",
};

/** Recommended model id for a kind; "" when none. */
export function recommendedFor(kind: string): string {
  return RECOMMENDED[kind] || "";
}
