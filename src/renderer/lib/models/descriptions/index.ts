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
import { OCR_DESCS, OCR_GPU } from "./ocr";
import { INPAINT_DESCS } from "./inpaint";

const ALL: ModelDescMap = {
  ...DETECT_DESCS,
  ...OCR_DESCS,
  ...INPAINT_DESCS,
};

/** GPU-acceleration overrides per model id (en/id). Only multi-session OCR
 * models that can't be expressed as one backend `prefer` value. Single-
 * preference models derive their badge from `prefer` instead. */
const ALL_GPU: ModelDescMap = {
  ...OCR_GPU,
};

/** Phrase per backend EP preference value. */
const PREFER_PHRASES: ModelDescMap = {
  auto: {
    en: `Supported via CUDA / DirectML when enabled.`,
    id: `Didukung via CUDA / DirectML saat diaktifkan.`,
  },
  cuda: {
    en: `CUDA only — DirectML unsupported.`,
    id: `Hanya CUDA — DirectML tidak didukung.`,
  },
  cpu: {
    en: `CPU only — GPU acceleration is ignored, the model stays on CPU.`,
    id: `Hanya CPU — akselerasi GPU diabaikan, model tetap berjalan di CPU.`,
  },
};

/** Description for a model id in the given language; "" when unknown. */
export function describe(id: string, lang: string): string {
  const d = ALL[id];
  if (!d) return "";
  if (lang === "id") return d.id;
  return d.en;
}

/** GPU note for a model id in the given language; "" when unknown. */
export function describeGpu(id: string, lang: string): string {
  const d = ALL_GPU[id];
  if (!d) return "";
  if (lang === "id") return d.id;
  return d.en;
}

/** GPU note derived from a backend `prefer` value; "" when unknown. */
export function describeGpuFromPrefer(prefer: string, lang: string): string {
  const d = PREFER_PHRASES[prefer];
  if (!d) return "";
  if (lang === "id") return d.id;
  return d.en;
}

/** Recommended model per kind — badge in the UI + default pick. */
export const RECOMMENDED: Record<string, string> = {
  detect: "rfdetr_seg",
  ocr: "baberu",
  inpaint: "lama_manga",
};

/** Recommended model id for a kind; "" when none. */
export function recommendedFor(kind: string): string {
  return RECOMMENDED[kind] || "";
}
