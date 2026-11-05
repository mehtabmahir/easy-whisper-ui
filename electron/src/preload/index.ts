import { contextBridge, ipcRenderer } from "electron";
import type { EasyWhisperApi } from "../types/easy-whisper";

const api: EasyWhisperApi = {
  runTranscriptAction: (id, preferences, action) => ipcRenderer.invoke("easy-whisper:transcript-action", id, preferences, action),
  cancelTranscriptAction: () => ipcRenderer.invoke("easy-whisper:cancel-transcript-action"),
  listCleanupModels: () => ipcRenderer.invoke("easy-whisper:list-cleanup-models"),
  deleteCleanupModel: id => ipcRenderer.invoke("easy-whisper:delete-cleanup-model", id),
  downloadCleanupModel: id => ipcRenderer.invoke("easy-whisper:download-cleanup-model", id),
  cancelCleanupDownload: () => ipcRenderer.invoke("easy-whisper:cancel-cleanup-download"),
  onCleanupDownload: callback => {
    const handler = (_event: Electron.IpcRendererEvent, message: string) => callback(message);
    ipcRenderer.on("easy-whisper:cleanup-download", handler);
    return () => ipcRenderer.removeListener("easy-whisper:cleanup-download", handler);
  },
  openCleanupModelFile: () => ipcRenderer.invoke("easy-whisper:open-cleanup-model"),
  setCleanupApiKey: key => ipcRenderer.invoke("easy-whisper:set-cleanup-key", key),
  hasCleanupApiKey: () => ipcRenderer.invoke("easy-whisper:has-cleanup-key"),
  getCleanupResults: () => ipcRenderer.invoke("easy-whisper:cleanup-results"),
  revealCleanupFile: id => ipcRenderer.invoke("easy-whisper:reveal-cleanup", id),
  onCleanup: callback => {
    const channel = "easy-whisper:cleanup";
    const handler = (_event: Electron.IpcRendererEvent, data: Parameters<typeof callback>[0]) => callback(data);
    ipcRenderer.on(channel, handler);
    return () => ipcRenderer.removeListener(channel, handler);
  },
  checkGpuReadiness: () => ipcRenderer.invoke("easy-whisper:gpu-readiness"),
  getHardwareInfo: () => ipcRenderer.invoke("easy-whisper:hardware-info"),
  listDownloadedModels: () => ipcRenderer.invoke("easy-whisper:list-models"),
  downloadModel: (model) => ipcRenderer.invoke("easy-whisper:download-model", model),
  onModelDownloadProgress: (callback) => {
    const channel = "easy-whisper:model-download-progress";
    const handler = (_event: Electron.IpcRendererEvent, data: Parameters<typeof callback>[0]) => callback(data);
    ipcRenderer.on(channel, handler);
    return () => ipcRenderer.removeListener(channel, handler);
  },
  deleteDownloadedModel: (file) => ipcRenderer.invoke("easy-whisper:delete-model", file),
  setTheme: (theme) => ipcRenderer.invoke("easy-whisper:set-theme", theme),
  platform: () => process.platform,
  arch: () => process.arch,
  openAudioFiles: () => ipcRenderer.invoke("easy-whisper:open-dialog"),
  rendererReady: () => ipcRenderer.invoke("easy-whisper:renderer-ready"),
  compileWhisper: (options) => ipcRenderer.invoke("easy-whisper:compile", options),
  getClearAudioCacheOnExit: () => ipcRenderer.invoke("easy-whisper:get-cache-on-exit"),
  setClearAudioCacheOnExit: (value) => ipcRenderer.invoke("easy-whisper:set-cache-on-exit", value),
  getAudioCacheSize: () => ipcRenderer.invoke("easy-whisper:audio-cache-size"),
  openAudioCacheFolder: () => ipcRenderer.invoke("easy-whisper:open-audio-cache"),
  openWorkspaceFolder: () => ipcRenderer.invoke("easy-whisper:open-workspace-folder"),
  showSetupLog: () => ipcRenderer.invoke("easy-whisper:show-setup-log"),
  clearAudioCache: () => ipcRenderer.invoke("easy-whisper:clear-audio-cache"),
  cleanReinstall: () => ipcRenderer.invoke("easy-whisper:clean-reinstall"),
  getUninstallInfo: () => ipcRenderer.invoke("easy-whisper:uninstall-info"),
  uninstallFully: () => ipcRenderer.invoke("easy-whisper:uninstall-fully"),
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
  removeQueueItem: (id) => ipcRenderer.invoke("easy-whisper:remove-queue-item", id),
  retryQueueItem: (id, settings) => ipcRenderer.invoke("easy-whisper:retry-queue-item", id, settings),
  skipCurrent: () => ipcRenderer.invoke("easy-whisper:skip-current"),
  showHelp: () => ipcRenderer.invoke("easy-whisper:help"),
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
  openModelFile: () => ipcRenderer.invoke("easy-whisper:open-model-file"),
  onExternalFiles: (callback) => {
    const channel = "easy-whisper:external-files";
    const handler = (_event: Electron.IpcRendererEvent, files: string[]) => callback(files);
    ipcRenderer.on(channel, handler);
    return () => ipcRenderer.removeListener(channel, handler);
  }
};

contextBridge.exposeInMainWorld("easyWhisper", api);
