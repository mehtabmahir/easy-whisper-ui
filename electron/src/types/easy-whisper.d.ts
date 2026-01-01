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
  outputDir?: string;
  error?: string;
}

export interface CompileOptions {
  force?: boolean;
}

export interface ModelSettings {
  model: string;
  language: string;
  cpuOnly: boolean;
  outputTxt: boolean;
  outputSrt: boolean;
  openAfterComplete: boolean;
  extraArgs: string;
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

export type EasyWhisperApi = {
  platform: () => NodeJS.Platform;
  arch: () => string;
  openAudioFiles: () => Promise<string[]>;
  compileWhisper: (options?: CompileOptions) => Promise<CompileResult>;
  ensureDependencies: (options?: CompileOptions) => Promise<CompileResult>;
  onCompileProgress: (callback: (event: CompileProgressEvent) => void) => () => void;
  enqueueTranscriptions: (request: TranscriptionRequest) => void;
  cancelAll: () => Promise<void>;
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
  uninstallWhisper: () => Promise<CompileResult>;
};

declare global {
  interface Window {
    easyWhisper?: EasyWhisperApi;
  }
}
