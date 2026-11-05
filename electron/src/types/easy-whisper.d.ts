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

export interface CleanupPreferences {
  localModel?: string;
  provider: "local" | "custom" | "openai" | "compatible";
  customModelPath?: string;
  apiEndpoint?: string;
  apiModel: string;
}
export type TranscriptAction = { kind: "summary" | "custom"; request?: string };
export interface CleanupEvent {
  live?: boolean;
  action?: TranscriptAction;
  outputBase?: string;
  id: string;
  source: string;
  original: string;
  markdown: string;
  status: "working" | "complete" | "stopped" | "error";
  completed: number;
  total: number;
  message: string;
  startedAt: number;
  preserved: number;
  outputPath?: string;
}

export interface ModelSettings {
  cleanup?: CleanupPreferences;
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

export interface QueueEntry {
  id: string;
  file: string;
  status: "waiting" | "processing" | "failed";
  error?: string;
}

export interface QueueState {
  items: QueueEntry[];
  awaiting: string[];
  processing?: string;
  isProcessing: boolean;
  stage?: "transcription" | "download" | "cleanup";
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

export interface GpuInfo {
  name: string;
  memoryGiB?: number;
  memoryKind: "dedicated" | "unified" | "shared" | "unknown";
  metal?: boolean;
}

export interface GpuReadiness {
  state: "ready" | "unavailable" | "unverified";
  message: string;
}

export interface HardwareInfo {
  cpu: string;
  ramGiB: number;
  gpus: GpuInfo[];
  note?: string;
}

export type EasyWhisperApi = {
  runTranscriptAction: (id: string, preferences: CleanupPreferences, action: TranscriptAction) => Promise<void>;
  cancelTranscriptAction: () => Promise<void>;
  listCleanupModels: () => Promise<DownloadedModel[]>;
  deleteCleanupModel: (id: string) => Promise<CompileResult>;
  downloadCleanupModel: (id: string) => Promise<CompileResult>;
  cancelCleanupDownload: () => Promise<void>;
  onCleanupDownload: (callback: (message: string) => void) => () => void;
  openCleanupModelFile: () => Promise<string | undefined>;
  setCleanupApiKey: (key: string) => Promise<void>;
  hasCleanupApiKey: () => Promise<boolean>;
  getCleanupResults: () => Promise<CleanupEvent[]>;
  revealCleanupFile: (id: string) => Promise<void>;
  onCleanup: (callback: (event: CleanupEvent) => void) => () => void;
  checkGpuReadiness: () => Promise<GpuReadiness>;
  getHardwareInfo: () => Promise<HardwareInfo>;
  setTheme: (theme: "auto" | "light" | "dark") => Promise<void>;
  platform: () => NodeJS.Platform;
  arch: () => string;
  openAudioFiles: () => Promise<string[]>;
  rendererReady: () => Promise<void>;
  compileWhisper: (options?: CompileOptions) => Promise<CompileResult>;
  cleanReinstall: () => Promise<CompileResult>;
  getClearAudioCacheOnExit: () => Promise<boolean>;
  setClearAudioCacheOnExit: (value: boolean) => Promise<void>;
  getAudioCacheSize: () => Promise<number>;
  openAudioCacheFolder: () => Promise<CompileResult>;
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
  removeQueueItem: (id: string) => Promise<void>;
  retryQueueItem: (id: string, settings: ModelSettings) => Promise<void>;
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
