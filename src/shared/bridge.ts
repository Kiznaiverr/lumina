/* ── Lumina IPC contract — single source of truth ──
 * Imported by main (handlers), preload (invoke), and renderer (types).
 * Keeping the channel strings and payload types here prevents drift
 * between the three worlds.
 */

export const IPC = {
  importImage: "import-image",
  importImages: "import-images",
  runPipeline: "run-pipeline",
  pipelineProgress: "pipeline-progress",
  apiPost: "api-post",
  checkModel: "check-model",
  downloadModel: "download-model",
  modelDownloadProgress: "model-download-progress",
  getFonts: "get-fonts",
  loadTranslations: "load-translations",
  loadDefaultInstruction: "load-default-instruction",
  secretsSet: "secrets-set",
  secretsGet: "secrets-get",
  secretsDelete: "secrets-delete",
} as const;

/* ── Model registry ── */

export interface ModelInfo {
  id: string;
  name: string;
  kind: string; // "detect" | "ocr" | "inpaint"
  ready: boolean;
  size: number | null;
  /** Filled from the renderer description registry — backend doesn't send it. */
  description?: string;
}

export interface ModelCheck {
  cached: boolean;
  models: ModelInfo[];
}

export interface DownloadProgress {
  running: boolean;
  progress: number;
  downloaded: number;
  total: number;
  done: boolean;
  error?: string | null;
  /** Which model is downloading: "detect" | "ocr" | "inpaint" */
  model?: string | null;
}

/* ── Fonts ── */

export interface FontInfo {
  family: string;
  path: string;
  weight: number;
  italic: boolean;
}

/* ── window.lumina API exposed by preload.ts ── */

export interface LuminaAPI {
  importImage(): Promise<string | null>;
  importImages(): Promise<string[] | null>;
  runPipeline(imagePath: string): Promise<unknown>;
  onProgress(cb: (msg: { step: string; detail?: string }) => void): void;
  apiPost<T = unknown>(endpoint: string, body: unknown): Promise<T>;
  checkModel(): Promise<ModelCheck>;
  downloadModel(models?: string[]): Promise<void>;
  onDownloadProgress(cb: (msg: DownloadProgress) => void): void;
  getFonts(): Promise<FontInfo[]>;
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
