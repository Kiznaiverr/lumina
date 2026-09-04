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
  cancelDownload: () => ipcRenderer.invoke(IPC.cancelDownload),
  onDownloadProgress: (cb) => {
    ipcRenderer.on(IPC.modelDownloadProgress, (_e, msg) => cb(msg));
  },
  getFonts: () => ipcRenderer.invoke(IPC.getFonts),
  loadTranslations: () => ipcRenderer.invoke(IPC.loadTranslations),
  loadDefaultInstruction: () => ipcRenderer.invoke(IPC.loadDefaultInstruction),
  setSecret: (key: string, value: string) =>
    ipcRenderer.invoke(IPC.secretsSet, key, value),
  getSecret: (key: string) => ipcRenderer.invoke(IPC.secretsGet, key),
  getSecrets: (keys: string[]) => ipcRenderer.invoke(IPC.secretsGetMany, keys),
  deleteSecret: (key: string) => ipcRenderer.invoke(IPC.secretsDelete, key),
  getModelsPath: () => ipcRenderer.invoke(IPC.modelsPathGet),
  setModelsPath: (value: string) =>
    ipcRenderer.invoke(IPC.modelsPathSet, value),
  chooseModelsPath: () => ipcRenderer.invoke(IPC.modelsPathChoose),
  saveProject: (payload) => ipcRenderer.invoke(IPC.saveProject, payload),
  openProject: (path?: string) =>
    ipcRenderer.invoke(IPC.openProject, path ?? undefined),
  getPendingOpenPath: () => ipcRenderer.invoke(IPC.pendingOpenPath),
  getRecents: () => ipcRenderer.invoke(IPC.recentsList),
  removeRecent: (path: string) => ipcRenderer.invoke(IPC.recentsRemove, path),
  onOpenProjectRequest: (cb: (path: string) => void) => {
    ipcRenderer.on(IPC.openProjectRequest, (_e, p: string) => cb(p));
  },
  confirmDiscard: (message: string) =>
    ipcRenderer.invoke(IPC.confirmDiscard, message),
  onRequestCloseCheck: (cb: () => void) => {
    ipcRenderer.on(IPC.requestCloseCheck, () => cb());
  },
  confirmClose: (ok: boolean) => ipcRenderer.invoke(IPC.confirmClose, ok),
  exportImages: (payload) => ipcRenderer.invoke(IPC.exportImages, payload),
  writeTempPng: (payload) => ipcRenderer.invoke(IPC.writeTempPng, payload),
  checkForUpdates: () => ipcRenderer.invoke(IPC.checkForUpdates),
  downloadUpdate: () => ipcRenderer.invoke(IPC.downloadUpdate),
  installUpdate: () => ipcRenderer.invoke(IPC.installUpdate),
  onUpdateProgress: (cb) => {
    ipcRenderer.on(IPC.updateProgress, (_e, msg) => cb(msg));
  },
  openUpdateUrl: (url: string) => ipcRenderer.invoke(IPC.openUpdateUrl, url),
};

contextBridge.exposeInMainWorld("lumina", api);
