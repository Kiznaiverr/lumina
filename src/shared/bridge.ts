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
  device: "device",
  deviceConfigure: "device-configure",
  checkModel: "check-model",
  downloadModel: "download-model",
  cancelDownload: "cancel-download",
  modelDownloadProgress: "model-download-progress",
  getFonts: "get-fonts",
  loadTranslations: "load-translations",
  loadDefaultInstruction: "load-default-instruction",
  secretsSet: "secrets-set",
  secretsGet: "secrets-get",
  secretsDelete: "secrets-delete",
  modelsPathGet: "models-path-get",
  modelsPathSet: "models-path-set",
  modelsPathChoose: "models-path-choose",
  saveProject: "save-project",
  openProject: "open-project",
  /** Renderer pulls the .lmi path that launched (or was passed to) the app */
  pendingOpenPath: "pending-open-path",
  /** Main pushes a .lmi path to an already-running app (second instance) */
  openProjectRequest: "open-project-request",
  confirmDiscard: "confirm-discard",
  requestCloseCheck: "request-close-check",
  confirmClose: "confirm-close",
  exportImages: "export-images",
  checkForUpdates: "check-for-updates",
  openUpdateUrl: "open-update-url",
} as const;

/* ── Model registry ── */

export interface ModelInfo {
  id: string;
  name: string;
  kind: string; // "detect" | "ocr" | "inpaint"
  status?: string; // "ready" | "dev" — dev = in development, still usable
  ready: boolean;
  size: number | null;
  /** Filled from the renderer description registry — backend doesn't send it. */
  description?: string;
  /** GPU-acceleration note from the renderer registry — hidden when empty. */
  gpu?: string;
  /** Backend EP preference ("auto" | "cuda" | "cpu"); absent for multi-session OCR. */
  prefer?: string;
}

export interface ModelCheck {
  cached: boolean;
  models: ModelInfo[];
}

/* ── Device / GPU info (GET /device) ── */

export interface DeviceInfo {
  /** "cuda" | "dml" | "cpu" */
  provider: string;
  /** Full ORT provider name, e.g. "DmlExecutionProvider" */
  ep: string;
  gpus: string[];
  gpuName: string | null;
  onnxRuntime: string | null;
  /** GPU EP available in this wheel — actual per-session success is lazy */
  accelerated: boolean;
}

export interface DownloadProgress {
  running: boolean;
  progress: number;
  downloaded: number;
  total: number;
  done: boolean;
  error?: string | null;
  /** True when the user cancelled the in-flight download */
  cancelled?: boolean;
  /** Which model is downloading: "detect" | "ocr" | "inpaint" */
  model?: string | null;
}

/* ── Models directory (Settings → Models → location) ── */

/** Resolved state for the models directory UI. */
export interface ModelsPathState {
  /** Effective directory: env override > saved config > userData/models */
  path: string;
  /** Whether the effective path comes from the LUMINA_MODEL_DIR env var */
  envOverride: boolean;
}

/* ── Project save/open (.lmi = zip) ── */

export interface ProjectMaskData {
  id: string;
  bbox: { x: number; y: number; w: number; h: number };
  /** Abs path of the patch PNG — rewritten to a zip entry by main on save */
  imagePath: string;
  visible: boolean;
  opacity: number;
}

export interface ProjectPageData {
  fileName: string;
  /** Abs path of the source image — rewritten to a zip entry by main on save */
  filePath: string;
  naturalWidth: number;
  naturalHeight: number;
  textDetections: unknown[];
  layers: unknown[];
  inpaintMasks: ProjectMaskData[];
  backgroundVisible: boolean;
  _zoomLevel?: number;
  _panX?: number;
  _panY?: number;
}

/** Non-secret translate settings embedded in the project file */
export interface ProjectSettingsData {
  provider?: string;
  sourceLang?: string;
  targetLang?: string;
  llmBaseUrl?: string;
  llmModel?: string;
  llmStyle?: string;
  llmInstruction?: string;
  openrouterModel?: string;
  grokModel?: string;
  geminiModel?: string;
}

export interface ProjectSavePayload {
  /** null → main shows the native Save dialog */
  savePath: string | null;
  project: {
    activePageIdx: number | null;
    settings: ProjectSettingsData | null;
    pages: ProjectPageData[];
  };
}

export interface ProjectSaveResult {
  path: string | null;
  canceled: boolean;
}

export interface OpenProjectResult {
  /** Abs path of the opened .lmi file — becomes the new save target */
  projectPath: string;
  activePageIdx: number | null;
  settings: ProjectSettingsData | null;
  /** Pages with filePath/inpaintMasks[].imagePath rewritten to extracted abs paths */
  pages: ProjectPageData[];
}

export type DiscardChoice = "save" | "discard" | "cancel";

/* ── Export ── */

/** One rendered page ready to be written to disk */
export interface ExportImageFile {
  /** Suggested file name (may be deduped by main) */
  fileName: string;
  /** PNG bytes, or JPEG bytes when format is "jpg" */
  data: Uint8Array;
}

export interface ExportPayload {
  format: "png" | "jpg";
  /** JPEG quality 1-100 (ignored for png) */
  quality: number;
  /** Files in export order (renderer reorders this list before sending) */
  files: ExportImageFile[];
}

export interface ExportResult {
  canceled: boolean;
  /** Directory written into, when not canceled */
  dir: string | null;
  count: number;
}

/* ── Fonts ── */

export interface FontInfo {
  family: string;
  path: string;
  weight: number;
  italic: boolean;
}

/* ── Update check result (minimal checker) ── */

export interface CheckUpdateResult {
  available: boolean;
  current?: string;
  latest?: string;
  url?: string;
  error?: string;
}

/* ── window.lumina API exposed by preload.ts ── */

export interface LuminaAPI {
  importImage(): Promise<string | null>;
  importImages(): Promise<string[] | null>;
  runPipeline(imagePath: string): Promise<unknown>;
  onProgress(cb: (msg: { step: string; detail?: string }) => void): void;
  apiPost<T = unknown>(endpoint: string, body: unknown): Promise<T>;
  getDevice(): Promise<DeviceInfo>;
  /** Toggle GPU acceleration (persisted per backend process; returns new state) */
  setUseGpu(useGpu: boolean): Promise<DeviceInfo>;
  checkModel(): Promise<ModelCheck>;
  downloadModel(models?: string[]): Promise<void>;
  /** Cancel the in-flight model download (temp .part files are removed) */
  cancelDownload(): Promise<void>;
  onDownloadProgress(cb: (msg: DownloadProgress) => void): void;
  getFonts(): Promise<FontInfo[]>;
  loadTranslations(): Promise<Record<string, Record<string, string>>>;
  loadDefaultInstruction(): Promise<string>;
  setSecret(key: string, value: string): Promise<void>;
  getSecret(key: string): Promise<string | null>;
  deleteSecret(key: string): Promise<void>;
  /** Resolved models directory + whether it's an env override */
  getModelsPath(): Promise<ModelsPathState>;
  /** Persist a custom models directory; returns the new state */
  setModelsPath(value: string): Promise<ModelsPathState>;
  /** Native folder picker — returns the chosen path or null */
  chooseModelsPath(): Promise<string | null>;
  saveProject(payload: ProjectSavePayload): Promise<ProjectSaveResult>;
  /** path → open directly (no dialog); omit → native Open dialog */
  openProject(path?: string): Promise<OpenProjectResult | null>;
  /** First .lmi path the app was launched with, if any (pull once) */
  getPendingOpenPath(): Promise<string | null>;
  /** Push a .lmi path from main while the app is already running */
  onOpenProjectRequest(cb: (path: string) => void): void;
  confirmDiscard(message: string): Promise<DiscardChoice>;
  /** Fired by main before the window closes — renderer must reply via confirmClose */
  onRequestCloseCheck(cb: () => void): void;
  /** Tell main it may (true) or must not (false) close the window */
  confirmClose(ok: boolean): Promise<void>;
  exportImages(payload: ExportPayload): Promise<ExportResult>;
  /** Minimal updater: GitHub latest-release check (never downloads) */
  checkForUpdates(): Promise<CheckUpdateResult>;
  /** Open the release page in the default browser */
  openUpdateUrl(url: string): Promise<void>;
}

declare global {
  interface Window {
    lumina: LuminaAPI;
  }
}
