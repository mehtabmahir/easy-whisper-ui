# EasyWhisperUI

<img src="resources/icon.png" alt="EasyWhisperUI logo" width="140" />

A fast, local desktop app for transcribing **audio/video** with **Whisper (whisper.cpp)** — with **GPU acceleration** where available.

![Windows preview](https://github.com/mehtabmahir/easy-whisper-ui/blob/main/resources/preview.png)

---

## Electron migration (React + Electron + IPC, TypeScript)

EasyWhisperUI has been migrated to an **Electron architecture (React + Electron + IPC)** built with **TypeScript** to provide a **consistent cross-platform UI** (Windows + macOS, Linux planned) and a **faster, more reliable development workflow** going forward.

### What changed / why it matters

- **Unified UI across platforms** with consistent layout + behavior
- **Faster iteration** (React + Vite, easier UI/feature work)
- **TypeScript codebase** for safer refactors and more reliable IPC/renderer/main boundaries
- **Safer process boundaries**
  - Renderer UI has no direct Node access
  - Privileged operations live in the Electron main process
  - A narrow preload bridge (`window.easyWhisper`) handles IPC safely
- **Cleaner installs + predictable storage**
  - Per-user workspace (app data) keeps binaries/models/downloads organized
- **Better foundation for long-term UX improvements**

This rewrite required reworking core UI flows, IPC, and install/dependency handling. The Electron build has been tested multiple times on a fresh Windows system to validate clean installs and end-to-end transcription.

---

## Features

- **Live transcription** (beta)
- **Batch transcription queue** (multiple files processed sequentially)
- **Translation** support for 100+ languages
- Output formats:
  - `.txt`
  - `.srt` (timestamps)
- Drag & drop + **Open With** integration
- Automatically converts media to the required format via **FFmpeg**
- Model selection (e.g. `tiny`, `medium-en`, `large-v3`)
- Language selection (e.g. `en`)
- Optional “additional arguments” textbox
- Automatically downloads models when missing
- Console output view during processing
- **Custom model support**: select a local whisper.cpp-compatible model file directly via a file picker

---

## Acceleration

- **Windows**: Vulkan acceleration (supported GPUs)
- **macOS (Apple Silicon)**: Metal acceleration

> If GPU acceleration isn’t available, EasyWhisperUI will still run using CPU.

---

## Custom model support

EasyWhisperUI supports **custom Whisper models** now!

### Use a custom model

1. Open the **Model** selector in EasyWhisperUI
2. Choose **Browse / Select model file**
3. Pick your local model file (`.gguf` / `.ggml`)
4. Start transcribing

---

## Requirements

### Windows 10/11
- AMD / Intel / NVIDIA GPU with **Vulkan** support  
  *(Most modern discrete + integrated GPUs work.)*
- Virtual machines require Vulkan support (e.g., GPU passthrough)

### macOS
- Apple Silicon (M1 / M2 / M3 / M4 / M5)

### Linux
- Not supported yet (install/compile flow not implemented)

---

## Install

### Windows
1. Download the latest **Windows installer** from **Releases**
2. Run it (installs per-user under app data)
3. Desktop + Start Menu shortcuts are created

### macOS
1. Download the `.dmg` from **Releases**
2. Open it and drag **EasyWhisperUI** into **Applications**

---

## Donate

Thanks to supporters ❤️

- Craig H: $50  
- Minh P: $5  
- Rödvarg R: $2  

This project takes a lot of time to maintain and test across systems. If EasyWhisperUI helped you, consider supporting development:

👉 **Donate via PayPal**  
https://www.paypal.com/donate/?business=5FM6Y27A3CK58&no_recurring=0&currency_code=USD

---

## Credits

- [whisper.cpp](https://github.com/ggerganov/whisper.cpp) by Georgi Gerganov
- [FFmpeg](https://ffmpeg.org)
- Windows FFmpeg builds: [gyan.dev](https://www.gyan.dev/ffmpeg/)
- Packaging: `electron-builder`

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
[https://github.com/ggerganov/whisper.cpp](https://github.com/ggerganov/whisper.cpp)

---

FFmpeg
License: LGPL 2.1
[https://ffmpeg.org](https://ffmpeg.org)
Windows builds by: [https://www.gyan.dev/ffmpeg/](https://www.gyan.dev/ffmpeg/)

The FFmpeg binary is provided as a separate file and may be replaced with a compatible version.

````

---

## Build steps (for developers)

### Electron app (TypeScript)

From the `electron/` folder:

```bash
npm install
npm run dev
````

Production build:

```bash
npm run build
```

Package (generates installer artifacts):

```bash
npm run dist
```

Build output:

* `build/electron-dist`


