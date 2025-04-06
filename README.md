# EasyWhisper UI

A fast, native desktop UI for transcribing media using Whisper — built entirely in modern C++ and Qt.

<img src="https://github.com/mehtabmahir/easy-whisper-ui/blob/main/preview.png"/>

---

## Features
- Installer handles everything for you — from downloading dependencies to compiling/optimizing Whisper for your specific hardware.
- Choice of .txt files, or .srt files with timestamps!
- Fully C++ implementation — no Python!
- Uses Vulkan for cross-platform GPU acceleration.
- Drag & drop or use “Open With” to load media.
- Automatically converts media to `.mp3` if needed using FFmpeg.
- Dropdown menu to select the model (e.g. `tiny`, `medium-en`, `large-v3`).
- Automatically downloads the chosen model if missing.
- Runs whisper with the selected model.
- Shows all output in a console box.
- Opens final transcript in Notepad.

---

## Requirements

- Windows 10 or later  
- AMD, Intel, or NVIDIA Graphics Card with Vulkan support. (99%)

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

## Credits

- [whisper.cpp](https://github.com/ggerganov/whisper.cpp) by Georgi Gerganov  
- [FFmpeg Windows builds](https://www.gyan.dev/ffmpeg/) by Gyan.dev  
- Built with [Qt](https://www.qt.io)  
- Installer created using [Inno Setup](https://jrsoftware.org/isinfo.php)

