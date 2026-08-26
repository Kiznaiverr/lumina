/* ── Lumina Shared Types ── */

export type DetectionStatus = "auto" | "adjusted" | "rejected";

export type TextType = "bubble" | "text_bubble" | "text_free" | string;

export interface BBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface BaseDetection {
  id: string;
  bbox: BBox;
  confidence: number;
  status: DetectionStatus;
}

export interface TextDetection extends BaseDetection {
  type?: TextType;
  /** OCR result (Japanese) — empty until OCR runs */
  text?: string;
  /** Translation result — empty until translate runs */
  translated?: string;
}

export interface BubbleDetection extends BaseDetection {}

/* ── Unified layer model (koharu-style) ──
 * Detection results become text-dialogue layers; the text tool creates
 * text-free layers. Rendered over the cleaned image in cleaned view.
 */
export type LayerType = "text-dialogue" | "text-free" | "cleanup" | "image";

export interface Typography {
  fontFamily: string | null; // null = default
  fontSize: number | null; // null = auto-fit to bbox
  fontWeight: number; // 100-900
  fontStyle: "normal" | "italic";
  align: "left" | "center" | "right";
  color: string; // hex
  strokeColor: string | null; // outline, null = off
  strokeWidth: number;
}

export function defaultTypography(): Typography {
  return {
    fontFamily: null,
    fontSize: null,
    fontWeight: 400,
    fontStyle: "normal",
    align: "center",
    color: "#111111",
    strokeColor: null,
    strokeWidth: 0,
  };
}

/* ── Global type defaults (Photoshop-style) ──
 * The TypeSection is always active: with no layer selected it edits these
 * global defaults, which new text layers inherit. Persisted to localStorage.
 * Selecting a layer switches the panel back to per-layer editing (override).
 */
const GLOBAL_TYPE_KEY = "lumina-global-type";

export function loadGlobalTypography(): Typography {
  try {
    const raw = localStorage.getItem(GLOBAL_TYPE_KEY);
    if (raw) return Object.assign(defaultTypography(), JSON.parse(raw));
  } catch {
    /* corrupted — fall through */
  }
  return defaultTypography();
}

export function saveGlobalTypography(t: Typography): void {
  try {
    localStorage.setItem(GLOBAL_TYPE_KEY, JSON.stringify(t));
  } catch {
    /* storage full/blocked — non-fatal */
  }
}

export interface PageLayer {
  id: string;
  type: LayerType;
  bbox: BBox;
  /** OCR source text (dialogue layers) */
  source?: string;
  /** Translated text — rendered on canvas when present */
  translation?: string;
  typography: Typography;
  visible: boolean;
  opacity: number; // 0-1
  /** Result of the last auto-fit — drives the "needs review" badge */
  fitStatus?: "ok" | "overflow-tolerated" | "forced-minimum";
  /** White rounded-rect backing behind text (for flat caption boxes) */
  backgroundPatch?: boolean;
}

export interface Page {
  filePath: string;
  fileName: string;
  image: HTMLImageElement;
  naturalWidth: number;
  naturalHeight: number;
  textDetections: TextDetection[];
  /** Unified editable layers (derived from detections + text tool) */
  layers: PageLayer[];
  cleanedImage: HTMLImageElement | null;
  _selectedTextIdx: number | null;
  /** Selected layer id in the unified layer model */
  _selectedLayerId: string | null;
  /** Per-page viewport — each page keeps its own zoom/pan */
  _zoomLevel?: number;
  _panX?: number;
  _panY?: number;
}

export type ViewMode = "original" | "cleaned";
export type ToolId = "select" | "lasso" | "text";

/** Response shape from POST /detect */
export interface DetectResult {
  textDetections?: Array<{
    bbox: BBox;
    type?: TextType;
    confidence?: number;
  }>;
  /* bubbleDetections intentionally ignored by the FE — inpaint & OCR only
   * need text boxes. Backend still returns them for future use. */
  error?: string;
  detail?: string;
}

export interface DownloadProgress {
  running: boolean;
  progress: number;
  downloaded: number;
  total: number;
  done: boolean;
  error?: string | null;
  /** Which model is downloading: "detect" | "ocr" */
  model?: string;
}

export interface ModelCheck {
  cached: boolean;
}

/** One entry of POST /ocr response */
export interface OcrResult {
  index: number;
  text: string;
}

/** window.lumina API exposed by preload.ts */
export interface LuminaAPI {
  importImage(): Promise<string | null>;
  importImages(): Promise<string[] | null>;
  runPipeline(imagePath: string): Promise<unknown>;
  onProgress(cb: (msg: { step: string; detail?: string }) => void): void;
  apiPost<T = unknown>(endpoint: string, body: unknown): Promise<T>;
  checkModel(): Promise<ModelCheck>;
  downloadModel(): Promise<void>;
  onDownloadProgress(cb: (msg: DownloadProgress) => void): void;
  getFonts(): Promise<
    Array<{ family: string; path: string; weight: number; italic: boolean }>
  >;
  loadTranslations(): Promise<Record<string, Record<string, string>>>;
  loadDefaultInstruction(): Promise<string>;
  setSecret(key: string, value: string): Promise<void>;
  getSecret(key: string): Promise<string | null>;
  deleteSecret(key: string): Promise<void>;
}

declare global {
  interface Window {
    lumina: LuminaAPI;
  }
}
