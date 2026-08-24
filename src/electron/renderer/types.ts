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
}

export interface BubbleDetection extends BaseDetection {}

export interface Page {
  filePath: string;
  fileName: string;
  image: HTMLImageElement;
  naturalWidth: number;
  naturalHeight: number;
  textDetections: TextDetection[];
  bubbleDetections: BubbleDetection[];
  cleanedImage: HTMLImageElement | null;
  _selectedTextIdx: number | null;
  _selectedBubbleIdx: number | null;
  /** Per-page viewport — each page keeps its own zoom/pan */
  _zoomLevel?: number;
  _panX?: number;
  _panY?: number;
}

export type ViewMode = "original" | "cleaned";
export type ToolId = "select" | "lasso";

/** Response shape from POST /detect */
export interface DetectResult {
  textDetections?: Array<{
    bbox: BBox;
    type?: TextType;
    confidence?: number;
  }>;
  bubbleDetections?: Array<{
    bbox: BBox;
    confidence?: number;
  }>;
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
}

export interface ModelCheck {
  cached: boolean;
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
  getFonts(): Promise<string[]>;
  loadTranslations(): Promise<Record<string, Record<string, string>>>;
}

declare global {
  interface Window {
    lumina: LuminaAPI;
  }
}
