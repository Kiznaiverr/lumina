interface LuminaBridge {
  importImage: () => Promise<string | null>;
  importImages: () => Promise<string[]>;
  runPipeline: (imagePath: string) => Promise<{
    success: boolean;
    originalImagePath?: string;
    cleanedImagePath?: string;
    bubbles?: Array<{
      bbox: { x: number; y: number; w: number; h: number };
      type: string;
      backgroundType: string;
      originalText: string;
      translatedText: string;
      confidence: number;
    }>;
    error?: string;
  }>;
  onProgress: (cb: (msg: { step: string; detail?: string }) => void) => void;
  apiPost: (endpoint: string, body: unknown) => Promise<unknown>;
  checkModel: () => Promise<{ cached: boolean }>;
  downloadModel: () => Promise<{ status?: string; error?: string }>;
  getFonts: () => Promise<string[]>;
  loadTranslations: () => Promise<Record<string, Record<string, string>>>;
}

interface Window {
  lumina: LuminaBridge;
}
