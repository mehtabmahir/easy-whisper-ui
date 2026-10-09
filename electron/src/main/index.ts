import { app, BrowserWindow, dialog, ipcMain, nativeImage, nativeTheme, screen, shell } from "electron";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { CompileOptions, CompileResult, LiveRequest, TranscriptionRequest } from "../types/easy-whisper";
import { CompileManager } from "./services/compileManager";
import { LiveManager } from "./services/liveManager";
import { TranscriptionManager } from "./services/transcriptionManager";
import { getUninstallInfo, launchUninstaller } from "./services/uninstallManager";
import { showWhisperHelp } from "./services/whisperHelp";
import { listDownloadedModels, deleteDownloadedModel } from "./services/modelStorage";
import { getHardwareInfo } from "./services/hardwareInfo";
import { checkGpuReadiness } from "./services/gpuReadiness";

import { getClearAudioCacheOnExit, setClearAudioCacheOnExit, openWorkspaceFolder, showSetupLog } from "./services/appSettings";

const isDev = process.env.NODE_ENV === "development";
// Electron's native Acrylic backdrop requires Windows 11 22H2 (build 22621).
const supportsWindowsBackdrop = process.platform === "win32" && Number(os.release().split(".")[2]) >= 22621;
const usesNativeBackdrop = process.platform === "darwin" || supportsWindowsBackdrop;

function windowBackgroundColor(): string {
  return usesNativeBackdrop ? "#00000000" : nativeTheme.shouldUseDarkColors ? "#101113" : "#efeeec";
}

const preloadPath = path.join(__dirname, "../preload/index.js");
const rendererHtmlPath = path.join(__dirname, "../renderer/index.html");

const compileManager = new CompileManager();
const transcriptionManager = new TranscriptionManager();
const liveManager = new LiveManager();
let setupBusy = false;
let reinstalling = false;
let transcriptionBusy = false;
let liveBusy = false;
let helpBusy = false;
let quitting = false;
let quitCleanupDone = false;


async function runSetup(action: () => Promise<CompileResult>): Promise<CompileResult> {
  if (quitting || setupBusy || transcriptionBusy || liveBusy || helpBusy) {
    return { success: false, error: "Wait for setup or transcription to finish before changing the installation." };
  }
  setupBusy = true;
  try {
    return await action();
  } catch (error) {
    return { success: false, error: (error as Error).message };
  } finally {
    setupBusy = false;
  }
}

const SUPPORTED_OPEN_EXTENSIONS = new Set([
  "mp3",
  "mp4",
  "m4a",
  "mkv",
  "m4v",
  "wav",
  "mov",
  "avi",
  "ogg",
  "flac",
  "aac",
  "wma",
  "opus"
]);

let mainWindow: BrowserWindow | null = null;
let rendererReady = false;
const pendingExternalFiles: string[] = [];

const gotInstanceLock = app.requestSingleInstanceLock();
if (!gotInstanceLock) {
  app.quit();
  process.exit(0);
}

app.on("before-quit", (event) => {
  if (quitCleanupDone) return;
  event.preventDefault();
  if (quitting) return;
  quitting = true;
  void transcriptionManager.shutdown(getClearAudioCacheOnExit()).catch((error) => {
    console.error("Audio cache cleanup on quit failed:", error);
  }).finally(() => {
    quitCleanupDone = true;
    app.quit();
  });
});

app.on("open-file", (event, filePath) => {
  event.preventDefault();
  broadcastExternalFiles(getSupportedFiles([filePath]));
  const targetWindow = mainWindow ?? BrowserWindow.getAllWindows()[0];
  if (targetWindow) {
    if (targetWindow.isMinimized()) {
      targetWindow.restore();
    }
    targetWindow.show();
    targetWindow.focus();
  }
});

app.on("second-instance", (_event, argv) => {
  const files = getSupportedFiles(argv);
  broadcastExternalFiles(files);
  const existingWindow = mainWindow ?? BrowserWindow.getAllWindows()[0];
  if (existingWindow) {
    if (existingWindow.isMinimized()) {
      existingWindow.restore();
    }
    existingWindow.focus();
  }
});

app.setName("EasyWhisperUI");

if (process.platform === "win32") {
  app.setAppUserModelId("com.easywhisper.ui");
}

function resolveAppIcon(): string | undefined {
  const resourceRoot = app.isPackaged ? process.resourcesPath : path.join(__dirname, "../../../resources");
  const candidates: string[] = [];

  if (process.platform === "win32") {
    candidates.push("icon.ico", "icon.png");
  } else if (process.platform === "darwin") {
    candidates.push("icon.icns", "icon.png");
  } else {
    candidates.push("icon.png");
  }

  for (const fileName of candidates) {
    const candidatePath = path.join(resourceRoot, fileName);
    if (fs.existsSync(candidatePath)) {
      return candidatePath;
    }
  }
  return undefined;
}

function getSupportedFiles(paths: string[]): string[] {
  return paths
    .map((p) => path.resolve(p))
    .filter((p) => !p.startsWith("-"))
    .filter((p) => fs.existsSync(p))
    .filter((p) => SUPPORTED_OPEN_EXTENSIONS.has(path.extname(p).toLowerCase().replace(/^\./, "")));
}

function broadcastExternalFiles(files: string[]): void {
  if (files.length === 0) {
    return;
  }

  const unique = Array.from(new Set(files));

  if (!rendererReady) {
    pendingExternalFiles.push(...unique);
    return;
  }

  broadcast("easy-whisper:external-files", unique);
}

function flushPendingExternalFiles(): void {
  if (!rendererReady || pendingExternalFiles.length === 0) {
    return;
  }

  const files = pendingExternalFiles.splice(0, pendingExternalFiles.length);
  broadcast("easy-whisper:external-files", Array.from(new Set(files)));
}

async function createMainWindow(): Promise<void> {
  // The renderer restores the saved appearance after loading.
  nativeTheme.themeSource = "system";

  const { workAreaSize } = screen.getPrimaryDisplay();
  const targetWidth = Math.min(1120, workAreaSize.width);
  const targetHeight = Math.min(800, workAreaSize.height);

  mainWindow = new BrowserWindow({
    width: targetWidth,
    height: targetHeight,
    minWidth: targetWidth,
    minHeight: targetHeight,
    title: "EasyWhisperUI",
    frame: process.platform === "darwin",
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    backgroundColor: windowBackgroundColor(),
    ...(supportsWindowsBackdrop ? { backgroundMaterial: "acrylic" as const } : {}),
    ...(process.platform === "darwin" ? {
      trafficLightPosition: { x: 16, y: 15 },
      transparent: true,
      vibrancy: "under-window" as const,
      visualEffectState: "active" as const
    } : {}),
    icon: resolveAppIcon(),
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      zoomFactor: 1
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    // Web links belong in the user's browser, not a new Electron window.
    if (URL.canParse(url) && ["https:", "http:"].includes(new URL(url).protocol)) {
      void shell.openExternal(url).catch((error) => {
        console.error("Could not open link in the default browser:", error);
      });
    }
    return { action: "deny" };
  });

  const emitWindowState = (): void => {
    if (!mainWindow) return;
    broadcast("window:maximize-state", { maximized: mainWindow.isMaximized() });
  };

  mainWindow.on("maximize", emitWindowState);
  mainWindow.on("unmaximize", emitWindowState);
  mainWindow.on("enter-full-screen", emitWindowState);
  mainWindow.on("leave-full-screen", emitWindowState);

  if (process.platform === "darwin") {
    mainWindow.setWindowButtonVisibility(true);
  }

  // Hide native menu so the custom chrome looks consistent across platforms.
  mainWindow.setMenuBarVisibility(false);

  if (isDev && process.env.VITE_DEV_SERVER_URL) {
    await mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    mainWindow.webContents.openDevTools({ mode: "detach" });
  } else {
    await mainWindow.loadFile(rendererHtmlPath);
  }

  // Reset any zoom retained from earlier versions of the app.
  mainWindow.webContents.setZoomFactor(1);

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  emitWindowState();
}

function broadcast(channel: string, payload: unknown): void {
  BrowserWindow.getAllWindows().forEach((window) => {
    window.webContents.send(channel, payload);
  });
}

function registerIpcChannels(): void {
  ipcMain.handle("easy-whisper:get-cache-on-exit", () => getClearAudioCacheOnExit());
  let hardwareInfo: ReturnType<typeof getHardwareInfo> | undefined;
  let gpuReadiness: ReturnType<typeof checkGpuReadiness> | undefined;
  ipcMain.handle("easy-whisper:gpu-readiness", () => {
    if (gpuReadiness) return gpuReadiness;
    gpuReadiness = (async () => {
      let result: import("../types/easy-whisper").GpuReadiness = { state: "unverified", message: "Waiting for the app to finish its current task." };
      await runSetup(async () => {
        broadcast("easy-whisper:console", { source: "system", message: "Testing Whisper GPU acceleration…" });
        try {
          result = await checkGpuReadiness(model => transcriptionManager.downloadModel(model, AbortSignal.timeout(120000), true));
        } catch {
          result = { state: "unverified", message: "GPU check incomplete." };
        }
        broadcast("easy-whisper:console", {
          source: "system",
          message: result.state === "ready" ? "Ready" : result.message
        });
        return { success: true };
      });
      return result;
    })();
    void gpuReadiness.then(result => { if (result.state === "unverified") gpuReadiness = undefined; }, () => { gpuReadiness = undefined; });
    return gpuReadiness;
  });
  ipcMain.handle("easy-whisper:hardware-info", () => hardwareInfo ??= getHardwareInfo());
  ipcMain.handle("easy-whisper:set-cache-on-exit", (_event, value: unknown) => setClearAudioCacheOnExit(value));
  const openSettingsPath = async (action: () => Promise<void>): Promise<CompileResult> => {
    try { await action(); return { success: true }; }
    catch (error) { return { success: false, error: (error as Error).message }; }
  };
  ipcMain.handle("easy-whisper:open-workspace-folder", () => openSettingsPath(openWorkspaceFolder));
  ipcMain.handle("easy-whisper:show-setup-log", () => openSettingsPath(showSetupLog));
  ipcMain.handle("easy-whisper:list-models", () => listDownloadedModels());
  ipcMain.handle("easy-whisper:download-model", (_event, model: unknown) => runSetup(async () => {
    await transcriptionManager.downloadModel(model);
    return { success: true };
  }));
  ipcMain.handle("easy-whisper:delete-model", (_event, file: unknown) => runSetup(async () => {
    await deleteDownloadedModel(file);
    return { success: true };
  }));
  ipcMain.handle("easy-whisper:clear-audio-cache", () => runSetup(async () => {
    await transcriptionManager.clearAudioCache();
    return { success: true };
  }));
  nativeTheme.on("updated", () => {
    mainWindow?.setBackgroundColor(windowBackgroundColor());
  });
  ipcMain.handle("easy-whisper:set-theme", (_event, theme: unknown) => {
    if (theme !== "auto" && theme !== "light" && theme !== "dark") {
      throw new Error("Invalid theme.");
    }
    nativeTheme.themeSource = theme === "auto" ? "system" : theme;
    mainWindow?.setBackgroundColor(windowBackgroundColor());
  });

  ipcMain.handle("easy-whisper:compile", async (_event, options: CompileOptions | undefined) => {
    return runSetup(() => compileManager.compile(options ?? {}));
  });

  ipcMain.handle("easy-whisper:clean-reinstall", async () => runSetup(async () => {
    const confirmation = await dialog.showMessageBox(mainWindow!, {
      type: "warning",
      title: "Clean reinstall",
      message: "Reinstall Whisper components?",
      detail: "This removes the app’s Whisper binaries, source/build files, local toolchain and download cache, then installs them again. Models, preferences, original media and transcripts are kept. Shared system dependencies are checked, not uninstalled. Internet access is required on Windows/Linux and setup may take several minutes.",
      buttons: ["Cancel", "Reinstall"], defaultId: 0, cancelId: 0, noLink: true
    });
    if (confirmation.response !== 1) return { success: false, canceled: true };
    reinstalling = true;
    try {
      const result = await compileManager.cleanReinstall();
      const installed = result.success && (await compileManager.hasExistingBinaries()).installed;
      const finalResult = installed ? result : { success: false, error: result.error ?? "Whisper binaries are still missing. Try reinstalling again." };
      broadcast("easy-whisper:compile-progress", {
        step: installed ? "completed" : "failed", progress: installed ? 100 : 0,
        state: installed ? "success" : "error",
        message: installed ? "Whisper reinstalled and ready." : "Reinstall failed.", error: finalResult.error
      });
      return finalResult;
    } finally {
      reinstalling = false;
    }
  }));

  ipcMain.handle("easy-whisper:check-install", async () => {
    return compileManager.hasExistingBinaries();
  });

  ipcMain.handle("easy-whisper:uninstall-info", () => getUninstallInfo());
  ipcMain.handle("easy-whisper:uninstall-fully", () => runSetup(async () => {
    const availability = await getUninstallInfo();
    if (!availability.available) return { success: false, error: availability.reason };
    const confirmation = await dialog.showMessageBox(mainWindow!, {
      type: "warning", title: "Uninstall EasyWhisperUI",
      message: "Remove EasyWhisperUI and all its app data?",
      detail: "This closes the app and opens its Windows uninstaller. Downloaded models, Whisper components, saved settings and app caches will be permanently deleted along with the app. Original media and exported transcripts outside the app’s data folders are kept. Shared dependencies such as Git and Vulkan SDK are not removed.",
      buttons: ["Cancel", "Uninstall fully"], defaultId: 0, cancelId: 0, noLink: true
    });
    if (confirmation.response !== 1) return { success: false, canceled: true };
    await launchUninstaller();
    app.quit();
    return { success: true };
  }));

  ipcMain.handle("easy-whisper:ensure-deps", async (_event, options) => {
    return runSetup(() => compileManager.ensureDependencies(options ?? {}));
  });

  ipcMain.handle("easy-whisper:renderer-ready", async () => {
    rendererReady = true;
    flushPendingExternalFiles();
  });

  ipcMain.handle("easy-whisper:open-dialog", async () => {
    const result = await dialog.showOpenDialog({
      title: "Open Audio/Video Files",
      properties: ["openFile", "multiSelections"],
      filters: [
        {
          name: "Audio/Video",
          extensions: [
            "mp3",
            "mp4",
            "m4a",
            "mkv",
            "m4v",
            "wav",
            "mov",
            "avi",
            "ogg",
            "flac",
            "aac",
            "wma",
            "opus"
          ]
        },
        { name: "All Files", extensions: ["*"] }
      ]
    });
    if (result.canceled) {
      return [];
    }
    return result.filePaths;
  });

  ipcMain.handle("easy-whisper:open-model-file", async () => {
    const result = await dialog.showOpenDialog({
      title: "Select Whisper Model File",
      properties: ["openFile"],
      filters: [
        { name: "Whisper Models", extensions: ["bin", "gguf", "ggml"] },
        { name: "All Files", extensions: ["*"] }
      ]
    });

    if (result.canceled || result.filePaths.length === 0) {
      return undefined;
    }

    return result.filePaths[0];
  });

  ipcMain.handle("easy-whisper:enqueue", async (_event, request: TranscriptionRequest) => {
    if (setupBusy || quitting) {
      broadcast("easy-whisper:console", { source: "system", message: "Wait for setup to finish before starting transcription." });
      return;
    }
    transcriptionManager.enqueue(request);
  });

  ipcMain.handle("easy-whisper:cancel-all", async () => {
    await transcriptionManager.cancelAll();
  });

  ipcMain.handle("easy-whisper:skip-current", () => transcriptionManager.skipCurrent());
  ipcMain.handle("easy-whisper:help", async () => {
    if (setupBusy || helpBusy) return { success: false, error: "Wait for setup or the current help request to finish." };
    helpBusy = true;
    try {
      const chunks: string[] = [];
      await showWhisperHelp((message) => chunks.push(message));
      return { success: true, output: chunks.join("") };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    } finally { helpBusy = false; }
  });

  ipcMain.handle("window:close", (event) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    window?.close();
  });

  ipcMain.handle("window:minimize", (event) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    window?.minimize();
  });

  ipcMain.handle("window:get-state", (event) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    return { maximized: window?.isMaximized() ?? false };
  });

  ipcMain.handle("window:toggle-maximize", (event) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window) {
      return false;
    }
    if (window.isMaximized()) {
      window.unmaximize();
    } else {
      window.maximize();
    }
    const maximized = window.isMaximized();
    broadcast("window:maximize-state", { maximized });
    return maximized;
  });

  ipcMain.handle("easy-whisper:start-live", async (_event, request: LiveRequest) => {
    if (setupBusy || liveBusy) throw new Error("Setup or live transcription is already running.");
    liveBusy = true;
    try { await liveManager.start(request); } catch (error) { liveBusy = false; throw error; }
  });

  ipcMain.handle("easy-whisper:stop-live", async () => {
    await liveManager.stop();
  });

  compileManager.on("progress", (event) => {
    broadcast("easy-whisper:compile-progress", reinstalling && event.state === "success" ? { ...event, state: "running" } : event);
  });

  compileManager.on("console", (event) => {
    broadcast("easy-whisper:console", event);
  });

  transcriptionManager.on("console", (event) => {
    broadcast("easy-whisper:console", event);
  });
  transcriptionManager.on("download", (event) => {
    broadcast("easy-whisper:model-download-progress", event);
  });

  transcriptionManager.on("queue", (event) => {
    transcriptionBusy = event.isProcessing || event.awaiting.length > 0;
    broadcast("easy-whisper:queue", event);
  });

  liveManager.on("console", (event) => {
    broadcast("easy-whisper:console", event);
  });

  liveManager.on("text", (message) => {
    broadcast("easy-whisper:live-text", message);
  });

  liveManager.on("state", (state) => {
    liveBusy = state === "started";
    broadcast("easy-whisper:live-state", state);
  });
}

app.whenReady().then(() => {
  if (process.platform === "darwin") {
    const iconPath = resolveAppIcon();
    if (iconPath) {
      const dockImage = nativeImage.createFromPath(iconPath);
      if (!dockImage.isEmpty()) {
        app.dock?.setIcon(dockImage);
      }
    }
  }

  registerIpcChannels();
  console.log("userData path:", app.getPath("userData"));
  return createMainWindow();
}).then(() => {
  broadcastExternalFiles(getSupportedFiles(process.argv));
}).catch((error) => {
  console.error("Failed to create main window", error);
});

app.on("window-all-closed", () => {
  app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    void createMainWindow();
  }
});
