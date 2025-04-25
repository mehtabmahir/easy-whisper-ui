# EasyWhisper UI

A fast, native desktop UI for transcribing media using Whisper — built entirely in modern C++ and Qt.

<table>
  <tr>
    <td align="center">
      <img src="https://github.com/mehtabmahir/easy-whisper-ui/blob/main/preview.png" width="400"/><br/>
      <p><strong>Windows</strong></p>
    </td>
    <td align="center">
      <img src="https://github.com/mehtabmahir/easy-whisper-ui/blob/mac/preview.png" width="400"/><br/>
      <p><strong>macOS</strong></p>
    </td>
  </tr>
</table>

## 🍎 Initial macOS Support

Thanks to the incredible contribution from [celerycoloured](https://github.com/celerycoloured), EasyWhisper UI now runs on macOS! 
Check it out on the `releases` page. 

## Features
- Supports translation for 100+ languages.
- Supports batch processing — drag in multiple files or select many at once; they transcribe one by one in a queue.
- Installer handles everything for you — from downloading dependencies to compiling/optimizing Whisper for your specific hardware.
- Choice of `.txt` files, or `.srt` files with timestamps!
- Fully C++ implementation — no Python!
- Uses Vulkan API for cross-platform GPU acceleration!
- Uses Metal API for GPU acceleration on Apple Silicon on MacOS!
- Drag & drop or use “Open With” to load media.
- Automatically converts media to `.mp3` if needed using FFmpeg.
- Dropdown menu to select the model (e.g. `tiny`, `medium-en`, `large-v3`).
- Dropdown to select language (e.g. `en` for English).
- Textbox for additional arguments.
- Automatically downloads the chosen model if missing.
- Shows all output in a console box.
- Opens final transcript in Notepad.

---

## Requirements

- Windows 10 or later
- AMD, Intel, or NVIDIA Graphics Card with Vulkan support. (99%)
   - Virtual Machines won't work unless it supports `VulkanSDK` (e.g GPU passthrough)

---

## Setup

1. **Download** the latest installer.  
2. **Run** the application.

---

## Donate

This project takes **tons of hours of work** — ensuring everything works smoothly across systems takes a LOT of time testing. It's all built in my free time, and I’m not getting paid for it.

If you’ve found EasyWhisper UI useful, please consider supporting its development:

👉 [**Donate via PayPal**](https://www.paypal.com/donate/?business=5FM6Y27A3CK58&no_recurring=0&currency_code=USD)

Your support truly helps and is greatly appreciated!
---

## Credits

- [whisper.cpp](https://github.com/ggerganov/whisper.cpp) by Georgi Gerganov  
- [FFmpeg Windows builds](https://www.gyan.dev/ffmpeg/) by Gyan.dev  
- Built with [Qt](https://www.qt.io)  
- Installer created using [Inno Setup](https://jrsoftware.org/isinfo.php)

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

---

Qt Framework  
License: LGPL 3.0  
https://www.qt.io

The Qt libraries are dynamically linked and may be replaced with compatible versions.

---

Installer built with Inno Setup  
License: Free for commercial and non-commercial use  
https://jrsoftware.org/isinfo.php

```

---

## Build Steps (I RECOMMEND YOU USE THE INSTALLER AVOVE)

1. **Install [Qt Creator](https://www.qt.io/product/development-tools)**  
   – Use a kit with a compatible C++ compiler (e.g. MinGW).
2. **Install [Inno Setup](https://jrsoftware.org/isdl.php)**  
   – Required to build the installer.
3. **Clone this repository**
   ```bash
   git clone https://github.com/mehtabmahir/easy-whisper-ui.git
   ```
4. **Open `CMakeLists.txt` in Qt Creator**  
   – Located in the root of the cloned folder.
5. **Use a build kit with a C++ compiler and CMake**
6. **Build the project**  
   – Press `Ctrl + B` or click the Build button.
7. Installer and build will be in `build\Installer` and `build\Final` respectively.

---

## 🛠️ Manual Setup (No Installer)

If you prefer not to use the one-click installer for whatever reason, you can manually set up **EasyWhisper UI** by following these steps:

### 1. **Get the UI Executable**
You can either:
- Build it yourself (see the [Build](#build) section), **or**
- Download the latest prebuilt [`EasyWhisperUI.exe`](https://github.com/mehtabmahir/easy-whisper-ui/releases)

### 2. **Bundle Qt DLLs**
If you downloaded the standalone `EasyWhisperUI.exe`, use `windeployqt` from `Qt Creator` to gather the required Qt runtime DLLs:
```bash
windeployqt EasyWhisperUI.exe
```
You can find `windeployqt` in your Qt Creator install directory.

### 3. **Get whisper.cpp**
- Clone the official [`whisper.cpp`](https://github.com/ggerganov/whisper.cpp) repository
- Compile it using CMake and a compatible compiler (e.g. MSVC or mingw64):
```bash
cmake -B build -DGGML_VULKAN=1 -DCMAKE_BUILD_TYPE=Release
cmake --build build --config Release -j8
```

### 4. **Copy the CLI Binary**
After building, copy the `whisper-cli.exe` (from the `build/Release` folder) into the same folder as `EasyWhisperUI.exe`.

Once all files are in place, just run `EasyWhisperUI.exe` to get started. No installation required!


