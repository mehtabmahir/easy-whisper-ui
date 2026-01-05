# EasyWhisperUI (Electron)

This folder contains the **Electron-based desktop app** for EasyWhisperUI.

## Overview

The app is split into three layers:

* **Renderer (React + Vite)**: UI only (no Node/Electron privileged access)
* **Preload (contextBridge)**: exposes a small `window.easyWhisper` API
* **Main (Electron main process)**: owns all privileged work (dialogs, window controls, installing/building/staging binaries, spawning FFmpeg/Whisper, streaming logs/events)

## Per-user workspace

At runtime the app manages a per-user workspace under Electron’s `userData` directory:

* `.../EasyWhisperUI/whisper-workspace/bin` — staged executables
* `.../EasyWhisperUI/whisper-workspace/models` — downloaded `ggml-*.bin` model files
* `.../EasyWhisperUI/whisper-workspace/toolchain` — **Windows only**: MSYS2 + FFmpeg toolchain
* `.../EasyWhisperUI/whisper-workspace/downloads` — **Windows only**: cached archives

## Project layout

### Config

* `package.json`

  * npm scripts for dev/build/dist
  * `electron-builder` config under `build`
* `vite.config.ts`

  * renderer root `src/renderer`
  * output `dist/renderer`
  * `base: "./"`
  * `publicDir` points at repo top-level `resources`
* `tsconfig.main.json` → builds Electron **main** → `dist/main` (CommonJS)
* `tsconfig.preload.json` → builds **preload** → `dist/preload` (CommonJS)
* `tsconfig.renderer.json` → typecheck only (`noEmit`) because Vite bundles
* `.eslintrc.json`, `.gitignore`

### Main process (`src/main`)

* `src/main/index.ts`

  * creates the `BrowserWindow` (security-focused settings)
  * registers IPC handlers via `ipcMain.handle(...)`
  * pushes async events to renderer via `webContents.send(...)`
* `src/main/services/compileManager.ts`

  * dependency workflow (Windows) + compilation/staging orchestration
  * emits progress + console events
* `src/main/services/binaryResolver.ts`

  * locates `ffmpeg`, `whisper-cli`, `whisper-stream`
  * prefers staged workspace binaries; can fall back to packaged resources / PATH (ffmpeg)
* `src/main/services/transcriptionManager.ts`

  * queue-based batch transcription
  * converts inputs to WAV via `ffmpeg` when needed
  * downloads models from Hugging Face (`ggerganov/whisper.cpp`)
  * runs `whisper-cli` and streams logs + queue state
* `src/main/services/liveManager.ts`

  * starts/stops live transcription using `whisper-stream`
  * forwards stdout lines to renderer as live text events
  * ensures the selected model exists

### Preload (`src/preload`)

* `src/preload/index.ts`

  * exposes `window.easyWhisper` using `contextBridge.exposeInMainWorld`
  * forwards calls to main via IPC

### Renderer (`src/renderer`)

* `src/renderer/App.tsx`

  * main UI + settings stored in `localStorage`
  * custom titlebar buttons call `window.easyWhisper.*Window()`
  * first-launch loader that runs install/compile checks and subscribes to progress
  * queue UI + console output UI
* `src/renderer/FirstLaunchLoader.tsx`

  * full-screen setup overlay (install/compile progress)
* `src/renderer/styles/*`

  * CSS modules + global styles

### Shared types

* `src/types/easy-whisper.d.ts`

  * typed contract for renderer ↔ preload ↔ main
  * defines `CompileProgressEvent`, `QueueState`, `LiveRequest`, and `EasyWhisperApi`

## IPC + `window.easyWhisper` API

Renderer calls privileged operations through `window.easyWhisper` (preload), which forwards to main via IPC.

### Renderer → Main (invoke/handle)

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

### Main → Renderer (push events)

* `easy-whisper:compile-progress`
* `easy-whisper:console`
* `easy-whisper:queue`
* `easy-whisper:live-text`
* `easy-whisper:live-state`
* `window:maximize-state`

## Dev / Build / Package

### Dev mode (`npm run dev`)

Runs four processes:

1. `dev:main` → `tsc -w -p tsconfig.main.json`
2. `dev:preload` → `tsc -w -p tsconfig.preload.json`
3. `dev:renderer` → `vite` dev server (`http://localhost:5173`)
4. `dev:electron` → waits for outputs + dev server, then launches Electron via `electronmon`

In dev, the main process loads the renderer via `VITE_DEV_SERVER_URL`.

### Production build (`npm run build`)

* `tsc` builds main/preload → `dist/main`, `dist/preload`
* `vite build` bundles renderer → `dist/renderer`

### Packaging (`npm run dist`)

* runs the production build
* packages via `electron-builder` to `../build/electron-dist`

## Runtime flows

### 1) First-launch setup / install

**Windows**

1. Renderer shows the loader overlay
2. Runs `ensureDependencies({ force: false })`
3. Runs `compileWhisper({ force: false })`
4. Subscribes to compile progress events and updates UI
5. Verifies installation with `checkInstall()`

**macOS**

* Works out of the box (binaries are bundled/staged; no dependency install step)

**Linux**

* Dependency installation / compilation flows are currently not implemented

### 2) Batch transcription

**Windows / macOS**

1. Renderer clicks **Open** → `openAudioFiles()`
2. Renderer calls `enqueueTranscriptions({ files, settings })`
3. Main converts to `.wav` via `ffmpeg` (if needed)
4. Main downloads the selected model if missing
5. Main runs `whisper-cli` and streams console + queue events

**Linux**

* Not implemented (install/compile and binary execution are not supported yet)

### 3) Live transcription

**Windows / macOS**

1. Renderer clicks **Live** → `startLiveTranscription({ settings, stepMs, lengthMs })`
2. Main downloads the selected model if missing
3. Main runs `whisper-stream`
4. Renderer receives text via `easy-whisper:live-text` and state via `easy-whisper:live-state`

**Linux**

* Not implemented

---


### 2) Batch transcription

1. Renderer clicks **Open** → `openAudioFiles()`
2. Renderer calls `enqueueTranscriptions({ files, settings })`
3. Main processes sequentially:

   * convert to `.wav` via `ffmpeg` (if needed)
   * download `ggml-<model>.bin` if missing
   * run `whisper-cli`
4. Renderer receives:

   * console logs via `easy-whisper:console`
   * queue state via `easy-whisper:queue`

### 3) Live transcription

1. Renderer clicks **Live** → `startLiveTranscription({ settings, stepMs, lengthMs })`
2. Main ensures the model exists and spawns `whisper-stream`
3. Renderer receives:

   * text lines via `easy-whisper:live-text`
   * start/stop state via `easy-whisper:live-state`