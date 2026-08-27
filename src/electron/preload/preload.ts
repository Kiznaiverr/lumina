import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("lumina", {
  importImage: () => ipcRenderer.invoke("import-image"),
  importImages: () => ipcRenderer.invoke("import-images"),
  runPipeline: (imagePath: string) =>
    ipcRenderer.invoke("run-pipeline", imagePath),
  onProgress: (cb: (msg: { step: string; detail?: string }) => void) => {
    ipcRenderer.on("pipeline-progress", (_e, msg) => cb(msg));
  },
  apiPost: (endpoint: string, body: unknown) =>
    ipcRenderer.invoke("api-post", endpoint, body),
  checkModel: () => ipcRenderer.invoke("check-model"),
  downloadModel: (models?: string[]) =>
    ipcRenderer.invoke("download-model", models ?? []),
  onDownloadProgress: (
    cb: (msg: {
      running: boolean;
      progress: number;
      downloaded: number;
      total: number;
      done: boolean;
      error?: string | null;
      model?: string | null;
    }) => void,
  ) => {
    ipcRenderer.on("model-download-progress", (_e, msg) => cb(msg));
  },
  getFonts: () => ipcRenderer.invoke("get-fonts"),
  loadTranslations: () => ipcRenderer.invoke("load-translations"),
  loadDefaultInstruction: () => ipcRenderer.invoke("load-default-instruction"),
  setSecret: (key: string, value: string) =>
    ipcRenderer.invoke("secrets-set", key, value),
  getSecret: (key: string) => ipcRenderer.invoke("secrets-get", key),
  deleteSecret: (key: string) => ipcRenderer.invoke("secrets-delete", key),
});
