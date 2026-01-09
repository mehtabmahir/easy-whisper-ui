import { contextBridge, ipcRenderer } from "electron";
import type { EasyWhisperApi } from "../types/easy-whisper";

const api: EasyWhisperApi = {
  platform: () => process.platform,
  arch: () => process.arch,
  openAudioFiles: () => ipcRenderer.invoke("easy-whisper:open-dialog"),
  compileWhisper: (options) => ipcRenderer.invoke("easy-whisper:compile", options),
  onCompileProgress: (callback) => {
    const channel = "easy-whisper:compile-progress";
    const handler = (_event: Electron.IpcRendererEvent, data: Parameters<typeof callback>[0]) => callback(data);
    ipcRenderer.on(channel, handler);
    return () => ipcRenderer.removeListener(channel, handler);
  },
  enqueueTranscriptions: (request) => {
    void ipcRenderer.invoke("easy-whisper:enqueue", request);
  },
  cancelAll: () => ipcRenderer.invoke("easy-whisper:cancel-all"),
  onQueueState: (callback) => {
    const channel = "easy-whisper:queue";
    const handler = (_event: Electron.IpcRendererEvent, data: Parameters<typeof callback>[0]) => callback(data);
    ipcRenderer.on(channel, handler);
    return () => ipcRenderer.removeListener(channel, handler);
  },
  onConsoleEvent: (callback) => {
    const channel = "easy-whisper:console";
    const handler = (_event: Electron.IpcRendererEvent, data: Parameters<typeof callback>[0]) => callback(data);
    ipcRenderer.on(channel, handler);
    return () => ipcRenderer.removeListener(channel, handler);
  },
  startLiveTranscription: (request) => ipcRenderer.invoke("easy-whisper:start-live", request),
  stopLiveTranscription: () => ipcRenderer.invoke("easy-whisper:stop-live"),
  onLiveText: (callback) => {
    const channel = "easy-whisper:live-text";
    const handler = (_event: Electron.IpcRendererEvent, text: string) => callback(text);
    ipcRenderer.on(channel, handler);
    return () => ipcRenderer.removeListener(channel, handler);
  },
  onLiveState: (callback) => {
    const channel = "easy-whisper:live-state";
    const handler = (_event: Electron.IpcRendererEvent, state: Parameters<typeof callback>[0]) => callback(state);
    ipcRenderer.on(channel, handler);
    return () => ipcRenderer.removeListener(channel, handler);
  },
  closeWindow: () => ipcRenderer.invoke("window:close"),
  minimizeWindow: () => ipcRenderer.invoke("window:minimize"),
  toggleMaximizeWindow: () => ipcRenderer.invoke("window:toggle-maximize"),
  onWindowState: (callback) => {
    const channel = "window:maximize-state";
    const handler = (_event: Electron.IpcRendererEvent, state: { maximized: boolean }) => callback(state);
    ipcRenderer.on(channel, handler);
    return () => ipcRenderer.removeListener(channel, handler);
  },
  getWindowState: () => ipcRenderer.invoke("window:get-state"),
  checkInstall: () => ipcRenderer.invoke("easy-whisper:check-install"),
  ensureDependencies: (options) => ipcRenderer.invoke("easy-whisper:ensure-deps", options),
  openModelFile: () => ipcRenderer.invoke("easy-whisper:open-model-file")
};

contextBridge.exposeInMainWorld("easyWhisper", api);
