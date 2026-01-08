import { app, BrowserWindow, dialog, ipcMain, nativeImage, nativeTheme, screen, shell } from "electron";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { CompileOptions, LiveRequest, TranscriptionRequest } from "../types/easy-whisper";
import { CompileManager } from "./services/compileManager";
import { LiveManager } from "./services/liveManager";
import { TranscriptionManager } from "./services/transcriptionManager";

const isDev = process.env.NODE_ENV === "development";

const preloadPath = path.join(__dirname, "../preload/index.js");
const rendererHtmlPath = path.join(__dirname, "../renderer/index.html");

const compileManager = new CompileManager();
const transcriptionManager = new TranscriptionManager();
const liveManager = new LiveManager();

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

async function createMainWindow(): Promise<void> {
  // Ensure high contrast themes match OS defaults for readability.
  nativeTheme.themeSource = "system";

  const { workAreaSize } = screen.getPrimaryDisplay();
  const targetWidth = 1000;
  const targetHeight = 700;

  const mainWindow = new BrowserWindow({
    width: targetWidth,
    height: targetHeight,
    minWidth: targetWidth,
    minHeight: targetHeight,
    title: "EasyWhisperUI",
    frame: false,
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    backgroundColor: "#0f172a",
    icon: resolveAppIcon(),
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      zoomFactor: 0.80
    }
  });

    const emitWindowState = (): void => {
      broadcast("window:maximize-state", { maximized: mainWindow.isMaximized() });
    };

    mainWindow.on("maximize", emitWindowState);
    mainWindow.on("unmaximize", emitWindowState);
    mainWindow.on("enter-full-screen", emitWindowState);
    mainWindow.on("leave-full-screen", emitWindowState);

  if (process.platform === "darwin") {
    mainWindow.setWindowButtonVisibility(false);
  }

  // Hide native menu so the custom chrome looks consistent across platforms.
  mainWindow.setMenuBarVisibility(false);

  if (isDev && process.env.VITE_DEV_SERVER_URL) {
    await mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    mainWindow.webContents.openDevTools({ mode: "detach" });
  } else {
    await mainWindow.loadFile(rendererHtmlPath);
  }

    emitWindowState();
}

function broadcast(channel: string, payload: unknown): void {
  BrowserWindow.getAllWindows().forEach((window) => {
    window.webContents.send(channel, payload);
  });
}

function registerIpcChannels(): void {
  ipcMain.handle("easy-whisper:compile", async (_event, options: CompileOptions | undefined) => {
    return compileManager.compile(options ?? {});
  });

  ipcMain.handle("easy-whisper:check-install", async () => {
    return compileManager.hasExistingBinaries();
  });

  ipcMain.handle("easy-whisper:ensure-deps", async (_event, options) => {
    return compileManager.ensureDependencies(options ?? {});
  });

  ipcMain.handle("easy-whisper:uninstall", async () => {
    const result = await compileManager.uninstall();

    // On macOS, also attempt to remove the installed .app bundle from /Applications
    if (process.platform === "darwin") {
      try {
        const bundleName = `${app.getName()}.app`;
        const primaryPath = path.join("/Applications", bundleName);
        const execBundle = path.resolve(process.execPath, "../../..");
        let bundlePath: string | null = null;

        if (fs.existsSync(primaryPath)) {
          bundlePath = primaryPath;
        } else if (fs.existsSync(execBundle)) {
          bundlePath = execBundle;
        }

        if (bundlePath) {
          // Prefer moving to Trash for safety; fall back to forced removal.
          let trashed = false;
          try {
            await shell.trashItem(bundlePath);
            trashed = true;
            console.log("Moved app bundle to Trash:", bundlePath);
          } catch (trashError) {
            console.warn("Failed to move app bundle to Trash, falling back to rm:", trashError);
          }

          if (!trashed) {
            await fsp.rm(bundlePath, { recursive: true, force: true });
            console.log("Removed app bundle:", bundlePath);
          }
        } else {
          console.log("App bundle not found for removal.");
        }
      } catch (err) {
        console.error("Failed to remove macOS app bundle:", err);
        return {
          success: false,
          error: `Failed to remove app bundle: ${(err as Error).message}`
        };
      }
    }

    return result;
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

  ipcMain.handle("easy-whisper:open-model-dialog", async () => {
    const result = await dialog.showOpenDialog({
      title: "Select Whisper Model File",
      properties: ["openFile"],
      filters: [
        {
          name: "Model Files",
          extensions: ["bin", "ggml"]
        },
        { name: "All Files", extensions: ["*"] }
      ]
    });
    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }
    return result.filePaths[0];
  });

  ipcMain.handle("easy-whisper:enqueue", async (_event, request: TranscriptionRequest) => {
    transcriptionManager.enqueue(request);
  });

  ipcMain.handle("easy-whisper:cancel-all", async () => {
    await transcriptionManager.cancelAll();
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
    await liveManager.start(request);
  });

  ipcMain.handle("easy-whisper:stop-live", async () => {
    await liveManager.stop();
  });

  compileManager.on("progress", (event) => {
    broadcast("easy-whisper:compile-progress", event);
  });

  compileManager.on("console", (event) => {
    broadcast("easy-whisper:console", event);
  });

  transcriptionManager.on("console", (event) => {
    broadcast("easy-whisper:console", event);
  });

  transcriptionManager.on("queue", (event) => {
    broadcast("easy-whisper:queue", event);
  });

  liveManager.on("console", (event) => {
    broadcast("easy-whisper:console", event);
  });

  liveManager.on("text", (message) => {
    broadcast("easy-whisper:live-text", message);
  });

  liveManager.on("state", (state) => {
    broadcast("easy-whisper:live-state", state);
  });
}

app.whenReady().then(() => {
  if (process.platform === "darwin") {
    const iconPath = resolveAppIcon();
    if (iconPath) {
      const dockImage = nativeImage.createFromPath(iconPath);
      if (!dockImage.isEmpty()) {
        app.dock.setIcon(dockImage);
      }
    }
  }

  registerIpcChannels();
  console.log("userData path:", app.getPath("userData"));
  return createMainWindow();
}).catch((error) => {
  console.error("Failed to create main window", error);
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    void createMainWindow();
  }
});
