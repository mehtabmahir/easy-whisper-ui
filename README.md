# EasyWhisperUI

<img src="resources/icon.png" alt="EasyWhisperUI logo" width="140" />

##  HUGE ANNOUNCEMENT: EasyWhisperUI is now Electron-based

EasyWhisperUI has been **migrated to an Electron architecture (React + Electron + IPC)** to provide a **consistent cross-platform UI experience** (Windows + macOS **(and Linux very soon)**) and a **faster, more reliable development workflow** going forward.

### Summary of the Electron migration

* **Unified UI across platforms** (Windows + macOS **(and Linux very soon)**) with the same layout, features, and behavior.
* **Faster iteration and development** (React + Vite hot reload, cleaner UI changes, easier feature expansion).
* **Hardened process boundaries**:

  * Renderer UI is isolated (no direct Node access)
  * Privileged work lives in the Electron main process
  * A narrow preload bridge (`window.easyWhisper`) handles IPC safely
* **Cleaner installs and runtime management**:

  * App manages its own per-user workspace under AppData / userData
  * Whisper binaries, models, toolchains, and downloads are staged predictably
* **Foundation for long-term improvements** (UI polish, new tools, better UX, more consistent releases)

This migration took **countless hours of work**: rewriting core UI flows, designing a safe IPC contract, implementing dependency/install workflows, and ensuring Windows/macOS behavior stays stable and consistent.

**I heard all the feedback/complaints, this new Electron build has been rigorously tested on a fresh Windows system multiple times** to verify clean installs, dependency setup, and end-to-end transcription behavior.

---

A local, desktop app for transcribing audio/video using **Whisper (whisper.cpp)** — with GPU acceleration where available.

![Windows preview](https://github.com/mehtabmahir/easy-whisper-ui/blob/main/resources/preview.png)

---

## Features

* **Live transcription** (beta)
* **Batch transcription queue** (multiple files processed sequentially)
* **Translation** support for 100+ languages
* Outputs:

  * `.txt`
  * `.srt` (timestamps)
* Drag & drop and **Open With** support
* Automatically converts media to the required audio format using **FFmpeg**
* Model selection (e.g. `tiny`, `medium-en`, `large-v3`)
* Language selection (e.g. `en`)
* Optional “additional arguments” textbox
* Automatically downloads models when missing
* Console output view during processing

### Acceleration

* **Windows**: Vulkan acceleration (supported GPUs)
* **macOS (Apple Silicon)**: Metal acceleration

---

## Requirements

### Windows 10/11

* AMD / Intel / NVIDIA GPU with **Vulkan** support
  *(Most modern discrete + integrated GPUs work.)*
* Virtual machines require Vulkan support (e.g., GPU passthrough)

### macOS

* Apple Silicon (M1 / M2 / M3 / M4 / M5)

### Linux

* Not supported yet (install/compile flow not implemented)

---

## Install

### Windows

1. Download the latest **Windows installer** from **Releases**
2. Run it (installs per-user under AppData / LocalAppData)
3. Desktop + Start Menu shortcuts are created

### macOS

1. Download the `.dmg` from **Releases**
2. Open it and drag **EasyWhisperUI** into **Applications**

---

## Donate

THANK YOU!:

* Craig H: $50
* Minh P: $5
* Rödvarg R: $2

This project takes a lot of time to maintain and test across systems.

If EasyWhisperUI helped you, consider supporting development:

👉 [**Donate via PayPal**](https://www.paypal.com/donate/?business=5FM6Y27A3CK58&no_recurring=0&currency_code=USD)

---

## Credits

* [whisper.cpp](https://github.com/ggerganov/whisper.cpp) by Georgi Gerganov
* [FFmpeg](https://ffmpeg.org)
* Windows FFmpeg builds: [gyan.dev](https://www.gyan.dev/ffmpeg/)
* Electron packaging: `electron-builder`

---

## License

```
Copyright (c) 2025 Mehtab Mahir
All rights reserved.

This software is proprietary and the following is not allowed for commercial purposes:
it may not be copied, modified, distributed, or used without explicit permission from the author.

Those actions are permitted for personal use ONLY.

This application includes the following open-source components:

---

whisper.cpp by Georgi Gerganov
License: MIT
https://github.com/ggerganov/whisper.cpp

---

FFmpeg
License: LGPL 2.1
https://ffmpeg.org
Windows builds by: https://www.gyan.dev/ffmpeg/

The FFmpeg binary is provided as a separate file and may be replaced with a compatible version.
```

---

## Build Steps (For Developers)

### Electron app

From the `electron/` folder:

```bash
npm install
npm run dev
```

Production build:

```bash
npm run build
```

Package (generates installer artifacts):

```bash
npm run dist
```

Outputs are written to:

* `build/electron-dist`

---
