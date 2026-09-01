import { contextBridge, ipcRenderer } from "electron";
import { IPC } from "./shared/bridge";
import type { LuminaAPI } from "./shared/bridge";

const api: LuminaAPI = {
  importImage: () => ipcRenderer.invoke(IPC.importImage),
  importImages: () => ipcRenderer.invoke(IPC.importImages),
  runPipeline: (imagePath: string) =>
    ipcRenderer.invoke(IPC.runPipeline, imagePath),
  onProgress: (cb: (msg: { step: string; detail?: string }) => void) => {
    ipcRenderer.on(IPC.pipelineProgress, (_e, msg) => cb(msg));
  },
  apiPost: <T = unknown>(endpoint: string, body: unknown) =>
    ipcRenderer.invoke(IPC.apiPost, endpoint, body) as Promise<T>,
  getDevice: () => ipcRenderer.invoke(IPC.device),
  setUseGpu: (useGpu: boolean) =>
    ipcRenderer.invoke(IPC.deviceConfigure, useGpu),
  checkModel: () => ipcRenderer.invoke(IPC.checkModel),
  downloadModel: (models?: string[]) =>
    ipcRenderer.invoke(IPC.downloadModel, models ?? []),
  onDownloadProgress: (cb) => {
    ipcRenderer.on(IPC.modelDownloadProgress, (_e, msg) => cb(msg));
  },
  getFonts: () => ipcRenderer.invoke(IPC.getFonts),
  loadTranslations: () => ipcRenderer.invoke(IPC.loadTranslations),
  loadDefaultInstruction: () => ipcRenderer.invoke(IPC.loadDefaultInstruction),
  setSecret: (key: string, value: string) =>
    ipcRenderer.invoke(IPC.secretsSet, key, value),
  getSecret: (key: string) => ipcRenderer.invoke(IPC.secretsGet, key),
  deleteSecret: (key: string) => ipcRenderer.invoke(IPC.secretsDelete, key),
  getModelsPath: () => ipcRenderer.invoke(IPC.modelsPathGet),
  setModelsPath: (value: string) =>
    ipcRenderer.invoke(IPC.modelsPathSet, value),
  chooseModelsPath: () => ipcRenderer.invoke(IPC.modelsPathChoose),
  saveProject: (payload) => ipcRenderer.invoke(IPC.saveProject, payload),
  openProject: () => ipcRenderer.invoke(IPC.openProject),
  confirmDiscard: (message: string) =>
    ipcRenderer.invoke(IPC.confirmDiscard, message),
  onRequestCloseCheck: (cb: () => void) => {
    ipcRenderer.on(IPC.requestCloseCheck, () => cb());
  },
  confirmClose: (ok: boolean) => ipcRenderer.invoke(IPC.confirmClose, ok),
  exportImages: (payload) => ipcRenderer.invoke(IPC.exportImages, payload),
};

contextBridge.exposeInMainWorld("lumina", api);
