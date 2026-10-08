export type CompileStepState = "pending" | "running" | "success" | "error";

export interface CompileProgressEvent {
  step: string;
  message: string;
  progress: number;
  state: CompileStepState;
  error?: string;
}

export interface CompileResult {
  success: boolean;
  canceled?: boolean;
  outputDir?: string;
  error?: string;
}

export interface CompileOptions {
  force?: boolean;
}

export interface UninstallInfo {
  available: boolean;
  reason?: string;
}

export interface DownloadedModel {
  file: string;
  name: string;
  bytes: number;
}

export interface ModelSettings {
  model: string;
  language: string;
  cpuOnly: boolean;
  outputTxt: boolean;
  outputSrt: boolean;
  openAfterComplete: boolean;
  extraArgs: string;
  customModelPath?: string;
}

export interface TranscriptionRequest {
  files: string[];
  settings: ModelSettings;
}

export interface QueueState {
  awaiting: string[];
  processing?: string;
  isProcessing: boolean;
}

export interface ConsoleEvent {
  source: "compile" | "transcription" | "live" | "system";
  message: string;
}

export interface LiveRequest {
  settings: ModelSettings;
  stepMs: number;
  lengthMs: number;
}

export type LiveState = "started" | "stopped";

export interface ModelDownloadProgress {
  model: string;
  receivedBytes: number;
  totalBytes?: number;
  bytesPerSecond: number;
  state: "downloading" | "complete" | "error";
}

export type EasyWhisperApi = {
  setTheme: (theme: "auto" | "light" | "dark") => Promise<void>;
  platform: () => NodeJS.Platform;
  arch: () => string;
  openAudioFiles: () => Promise<string[]>;
  rendererReady: () => Promise<void>;
  compileWhisper: (options?: CompileOptions) => Promise<CompileResult>;
  cleanReinstall: () => Promise<CompileResult>;
  getClearAudioCacheOnExit: () => Promise<boolean>;
  setClearAudioCacheOnExit: (value: boolean) => Promise<void>;
  openWorkspaceFolder: () => Promise<CompileResult>;
  showSetupLog: () => Promise<CompileResult>;
  clearAudioCache: () => Promise<CompileResult>;
  listDownloadedModels: () => Promise<DownloadedModel[]>;
  downloadModel: (model: string) => Promise<CompileResult>;
  onModelDownloadProgress: (callback: (event: ModelDownloadProgress) => void) => () => void;
  deleteDownloadedModel: (file: string) => Promise<CompileResult>;
  getUninstallInfo: () => Promise<UninstallInfo>;
  uninstallFully: () => Promise<CompileResult>;
  ensureDependencies: (options?: CompileOptions) => Promise<CompileResult>;
  openModelFile: () => Promise<string | undefined>;
  onCompileProgress: (callback: (event: CompileProgressEvent) => void) => () => void;
  enqueueTranscriptions: (request: TranscriptionRequest) => void;
  cancelAll: () => Promise<void>;
  skipCurrent: () => Promise<void>;
  showHelp: () => Promise<CompileResult & { output?: string }>;
  onQueueState: (callback: (state: QueueState) => void) => () => void;
  onConsoleEvent: (callback: (event: ConsoleEvent) => void) => () => void;
  startLiveTranscription: (request: LiveRequest) => Promise<void>;
  stopLiveTranscription: () => Promise<void>;
  onLiveText: (callback: (text: string) => void) => () => void;
  onLiveState: (callback: (state: LiveState) => void) => () => void;
  closeWindow: () => Promise<void>;
  minimizeWindow: () => Promise<void>;
  toggleMaximizeWindow: () => Promise<boolean>;
  onWindowState: (callback: (state: { maximized: boolean }) => void) => () => void;
  getWindowState: () => Promise<{ maximized: boolean }>;
  checkInstall: () => Promise<{ installed: boolean; outputDir?: string }>;
  onExternalFiles: (callback: (files: string[]) => void) => () => void;
};

declare global {
  interface Window {
    easyWhisper?: EasyWhisperApi;
  }
}
