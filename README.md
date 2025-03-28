# EasyWhisper UI

A fast, native desktop UI for transcribing audio using Whisper — built entirely in modern C++ and Qt.

<img src="https://github.com/mehtabmahir/easy-whisper-ui/blob/main/preview.png"/>


## Features

- Fully C++ implementation — no Python!
- Uses Vulkan for cross-platform GPU acceleration.
- Drag & drop or use “Open With” to load audio.
- Automatically converts audio to `.mp3` if needed using FFmpeg.
- Dropdown menu to select the model (e.g. `tiny`, `base`, `large-v3`).
- Automatically downloads the chosen model if missing.
- Runs whisper with the selected model.
- Shows all output in a console box.
- Opens final transcript in Notepad.

---

## Requirements

- Windows 10 or later

---

## Setup

1. **Download** the latest build.
2. **Run** the application.
3. **Load** any audio file via drag & drop or "Open With" or with the button.
4. **Select** your model from the dropdown (downloads automatically if it's missing).
5. **View** the transcription in the console, it will open directly in Notepad once finished.

---

## License

```
Copyright (c) 2025 [Mehtab Mahir]
All rights reserved.

This software is proprietary and may not be copied, modified, distributed,
or used for commercial purposes without explicit permission from the author.

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
```

---

## Credits

- [whisper.cpp](https://github.com/ggerganov/whisper.cpp) by Georgi Gerganov  
- [FFmpeg Windows builds](https://www.gyan.dev/ffmpeg/) by Gyan.dev  
- Built with [Qt](https://www.qt.io)
