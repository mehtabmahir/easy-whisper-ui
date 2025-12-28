import { app, BrowserWindow, dialog, ipcMain, nativeTheme } from "electron";
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

async function createMainWindow(): Promise<void> {
  // Ensure high contrast themes match OS defaults for readability.
  nativeTheme.themeSource = "system";

  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1100,
    minHeight: 700,
    title: "EasyWhisper UI",
    frame: false,
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    backgroundColor: "#0f172a",
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  // Hide native menu so the custom chrome looks consistent across platforms.
  mainWindow.setMenuBarVisibility(false);

  if (isDev && process.env.VITE_DEV_SERVER_URL) {
    await mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    mainWindow.webContents.openDevTools({ mode: "detach" });
  } else {
    await mainWindow.loadFile(rendererHtmlPath);
  }
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
