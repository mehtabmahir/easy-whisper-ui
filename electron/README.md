# EasyWhisperUI (Electron)

Electron-based desktop app for **EasyWhisperUI**, built with:

* **Main**: Electron main process (privileged work + IPC handlers)
* **Preload**: `contextBridge` exposing `window.easyWhisper`
* **Renderer**: React + Vite (UI only; no direct Node access)

## Workspace layout (per-user)

The app manages a per-user workspace under Electron `userData`:

* `.../EasyWhisperUI/whisper-workspace/bin` — staged executables
* `.../EasyWhisperUI/whisper-workspace/models` — downloaded `ggml-*.bin` models
* `.../EasyWhisperUI/whisper-workspace/toolchain` — Windows toolchain (MSYS2 + FFmpeg)
* `.../EasyWhisperUI/whisper-workspace/downloads` — Windows cached archives

`whisper-workspace` is the expected workspace root name used by the main-process services. ([GitHub][1])

---

## Repo structure

### Top-level config

* `package.json` — scripts + `electron-builder` config
* `vite.config.ts` — renderer build: root `src/renderer`, output `dist/renderer`, `base: "./"`, `publicDir` points to repo `resources`
* `tsconfig.main.json` — builds **main** → `dist/main` (CJS)
* `tsconfig.preload.json` — builds **preload** → `dist/preload` (CJS)
* `tsconfig.renderer.json` — typecheck only (`noEmit`)
* `.eslintrc.json`, `.gitignore`

### Source

#### Main (`src/main`)

* `src/main/index.ts`

  * Creates the main `BrowserWindow`
  * Registers IPC handlers via `ipcMain.handle(...)`
  * Pushes async events to renderer via `webContents.send(...)`

* `src/main/services/compileManager.ts`

  * Windows: installs toolchain components and builds whisper binaries into the workspace
  * macOS: stages prebuilt app-bundled binaries into the workspace (see macOS section) ([GitHub][1])

* `src/main/services/binaryResolver.ts`

  * Resolves runtime executables.
  * `ffmpeg` resolution:

    * Prefer workspace toolchain `.../toolchain/ffmpeg/bin/ffmpeg(.exe)`
    * Otherwise fallback to system `ffmpeg` (validated via `-version` check) ([GitHub][2])

* `src/main/services/transcriptionManager.ts`

  * Queue-based batch transcription (ffmpeg → whisper-cli)
  * Downloads models (Hugging Face `ggerganov/whisper.cpp`) into workspace models folder
  * Emits console + queue events

* `src/main/services/liveManager.ts`

  * Starts/stops `whisper-stream`
  * Forwards stdout lines to renderer as live text events
  * Ensures model artifacts exist (same model flow as batch)

#### Preload (`src/preload`)

* `src/preload/index.ts`

  * Exposes `window.easyWhisper` via `contextBridge.exposeInMainWorld`
  * Forwards renderer calls to main IPC (`ipcRenderer.invoke`) and subscribes to main push events

#### Renderer (`src/renderer`)

* `src/renderer/App.tsx` — main UI + settings + queue/log rendering
* `src/renderer/FirstLaunchLoader.tsx` — first-run overlay
* `src/renderer/styles/*` — CSS modules + global styles

The first-launch overlay uses a localStorage flag (`easy-whisper-ui.first-launch`) and is wired into `App.tsx`. ([GitHub][3])

#### Shared types (`src/types`)

* `src/types/easy-whisper.d.ts`

  * Strongly typed contract shared across renderer / preload / main
  * Defines the `EasyWhisperApi` surface on `window`

---

## Development

From the `electron/` folder:

### Dev mode

```bash
npm run dev
```

Runs main + preload `tsc -w`, Vite dev server, then launches Electron.

### Production build

```bash
npm run build
```

* Builds main/preload to `dist/main` and `dist/preload`
* Bundles renderer to `dist/renderer`

### Packaging

```bash
npm run dist
```

Packages with `electron-builder` into `../build/electron-dist`.

---

## Packaging details

* Uses `asar: true`
* Packages built outputs under:

  * `dist/main/**/*`
  * `dist/preload/**/*`
  * `dist/renderer/**/*`
  * `package.json`

### macOS bundled binaries

macOS builds include `buildResources/mac-bin` inside the packaged app via `electron-builder` `extraResources`, copied into the app’s resources as `mac-bin`. ([GitHub][1])

At runtime on macOS, the main process stages these prebuilt binaries into the per-user workspace. ([GitHub][1])

---

## Platform behavior

### Windows

* `ensureDependencies()` / `compileWhisper()` manage toolchain + builds into the workspace.
* `ffmpeg` is expected under the workspace toolchain path when installed; system `ffmpeg` is used only as a fallback. ([GitHub][2])

### macOS

* Packaged app ships prebuilt binaries under `mac-bin` and stages them into the workspace during install/compile flow. ([GitHub][1])
* `checkInstall()` considers both workspace binaries and the bundled mac-bin directory. ([GitHub][1])
* Uninstall removes the workspace and also attempts to remove the `.app` from `/Applications` (prefers moving it to Trash). ([GitHub][4])

### Linux

* Not implemented (returns a platform not supported message for install/compile flows).

---

## IPC + preload API

Renderer never calls Node/Electron APIs directly. Everything privileged goes through `window.easyWhisper`.

### IPC channels

Renderer → Main (`ipcRenderer.invoke` / `ipcMain.handle`):

* `easy-whisper:open-dialog`
* `easy-whisper:ensure-deps`
* `easy-whisper:compile`
* `easy-whisper:check-install`
* `easy-whisper:uninstall`
* `easy-whisper:enqueue`
* `easy-whisper:cancel-all`
* `easy-whisper:start-live`
* `easy-whisper:stop-live`
* `window:close`
* `window:minimize`
* `window:toggle-maximize`
* `window:get-state`

Main → Renderer (push via `webContents.send`, subscribe via `ipcRenderer.on`):

* `easy-whisper:compile-progress`
* `easy-whisper:console`
* `easy-whisper:queue`
* `easy-whisper:live-text`
* `easy-whisper:live-state`
* `window:maximize-state`

### Window controls (frameless)

The app supports a frameless window with custom titlebar controls exposed over IPC (close/minimize/toggle maximize + state). ([GitHub][5])

---

## Runtime flows

### First launch / install

1. Renderer shows `FirstLaunchLoader`
2. Calls `ensureDependencies({ force: false })` (Windows)
3. Calls `compileWhisper()` (Windows; macOS stages bundled binaries)
4. Subscribes to compile progress + console events
5. Confirms install via `checkInstall()`

### Batch transcription

1. `openAudioFiles()` → native file picker
2. `enqueueTranscriptions({ files, settings })`
3. Main converts to WAV via `ffmpeg` (if needed)
4. Main ensures model is downloaded
5. Main runs `whisper-cli` and streams logs + queue state

### Live transcription

1. `startLiveTranscription({ settings, stepMs, lengthMs })`
2. Main ensures model is present
3. Main runs `whisper-stream`
4. stdout is forwarded as `easy-whisper:live-text`

[1]: https://github.com/mehtabmahir/easy-whisper-ui/commit/caede5b7298e0709f213271da1e5a862befe82f4 "Prepare binaries for macOS · mehtabmahir/easy-whisper-ui@caede5b · GitHub"
[2]: https://github.com/mehtabmahir/easy-whisper-ui/commit/49ff811dca027a1072ff01bf637c2911c8078d72 "fix several issues with dependencies · mehtabmahir/easy-whisper-ui@49ff811 · GitHub"
[3]: https://github.com/mehtabmahir/easy-whisper-ui/commit/e8ae9337ffdac71eb9c0a2d72aee5be1afe4fc00 "First time installer implementation · mehtabmahir/easy-whisper-ui@e8ae933 · GitHub"
[4]: https://github.com/mehtabmahir/easy-whisper-ui/commit/627781156e8c3905917ed0bb13bcccac23cc5e3b "disable compiling and fix uninstall on macOS · mehtabmahir/easy-whisper-ui@6277811 · GitHub"
[5]: https://github.com/mehtabmahir/easy-whisper-ui/commit/2dcfc81d3e201a3eefc8e523108194971dfc3c45 "frameless window · mehtabmahir/easy-whisper-ui@2dcfc81 · GitHub"
