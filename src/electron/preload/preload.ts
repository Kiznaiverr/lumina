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
  downloadModel: () => ipcRenderer.invoke("download-model"),
  getFonts: () => ipcRenderer.invoke("get-fonts"),
  loadTranslations: () => ipcRenderer.invoke("load-translations"),
});
