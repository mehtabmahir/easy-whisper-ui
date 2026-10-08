# EasyWhisperUI

<img src="resources/icon.png" alt="EasyWhisperUI logo" width="140" />

Transcribe audio and video locally with Whisper, with GPU acceleration on supported hardware.

[![Donate via PayPal](https://img.shields.io/badge/Donate_via_PayPal-0070BA?style=for-the-badge&logo=paypal&logoColor=white)](https://www.paypal.com/donate/?business=5FM6Y27A3CK58&no_recurring=0&currency_code=USD)

## Download

| Platform | Requirements | Download 3.0.0 |
| --- | --- | --- |
| Windows | Windows 10/11, x64 | [Installer](https://github.com/mehtabmahir/easy-whisper-ui/releases/download/v3.0/EasyWhisperUI-Setup-3.0.0-win-x64.exe) |
| macOS | macOS 13+, Apple Silicon | [DMG](https://github.com/mehtabmahir/easy-whisper-ui/releases/download/v3.0/EasyWhisperUI-3.0.0-macOS-arm64.dmg) |
| Linux | Beta; tested on Ubuntu | 3.0 pending; [previous releases](https://github.com/mehtabmahir/easy-whisper-ui/releases) |

Windows uses Vulkan on supported GPUs; macOS uses Metal. CPU-only processing is also available.

[Release notes](https://github.com/mehtabmahir/easy-whisper-ui/releases/tag/v3.0)

<table>
  <tr>
    <th width="50%">macOS</th>
    <th width="50%">Windows</th>
  </tr>
  <tr>
    <td><a href="resources/preview-macos.png"><img src="resources/preview-macos.png" alt="EasyWhisperUI on macOS" width="100%" /></a></td>
    <td><a href="resources/preview-windows.png"><img src="resources/preview-windows.png" alt="EasyWhisperUI on Windows" width="100%" /></a></td>
  </tr>
</table>

## Features

- **Local transcription** — process audio and video on your computer with Whisper.
- **Batch processing** — open multiple files, drag and drop, or use Open With; FFmpeg handles format conversion.
- **Live transcription** — transcribe microphone audio (beta).
- **Languages and exports** — multilingual transcription, translation into English, and TXT/SRT output.
- **GPU acceleration** — Vulkan on Windows, Metal on Apple Silicon, or CPU-only processing.
- **Model management** — download models in Settings or automatically when needed, track downloaded bytes and transfer speed, and delete individual models.
- **Custom models** — select a local whisper.cpp-compatible model file.
- **Saved themes and background blur** — Light, Dark, and Auto, with translucent panels on macOS (vibrancy) and Windows 11 22H2+ (Acrylic), plus native macOS window controls.
- **Queue controls** — Skip cancels the current file and continues; Stop cancels the whole queue, including its model downloads and audio preparation.
- **Audio caching** — reuse converted audio across retries and model changes, with manual cleanup and optional cleanup on exit (enabled by default).
- **Console and Help** — a large output console, full Whisper CLI help, extra CLI arguments, and Settings shortcuts to the app workspace and saved setup logs.
- **Setup and repair** — installation progress estimates and clean reinstall on Windows/Linux, preserving models and settings. Installed Windows builds also offer uninstall from Settings.

## Quick start

1. Run the Windows installer, or open the Mac DMG and drag **EasyWhisperUI** into **Applications**.
2. Launch the app and let initial setup finish. macOS includes Whisper and FFmpeg.
3. Choose your model, language, and output formats. Missing models download automatically. For a local model, choose **custom → Select Model File**.
4. Click **Open** or drop files into the window. Transcription starts automatically; exports are saved beside the original files.

To translate into English, choose a multilingual model and add `--translate` in **Arguments**. Clearing the audio cache leaves original files and exported transcripts untouched.

## Troubleshooting

The Mac app is ad-hoc signed and not notarized. If macOS blocks it, try **System Settings → Privacy & Security → Open Anyway**. For a “damaged” message, follow the [release's first-opening instructions](https://github.com/mehtabmahir/easy-whisper-ui/releases/tag/v3.0#macos-first-opening).

For other problems, [open an issue](https://github.com/mehtabmahir/easy-whisper-ui/issues) with your OS, selected model, and console logs.

## Development

Requires Node.js 22.12+; Node.js 24 is recommended. Mac builds also require Homebrew and Xcode Command Line Tools. Clone with submodules, then:

```bash
cd electron
npm install
npm run dev
```

Use `npm run dist` to package the app into `build/electron-dist` at the repository root. See the [developer README](electron/README.md) for architecture and platform setup.

## Support

I'm a solo developer, and countless hours went into refining EasyWhisperUI. **Donations are the project's only source of funding.** If you find it useful, please consider supporting continued development.

[![Donate via PayPal](https://img.shields.io/badge/Donate_via_PayPal-0070BA?style=for-the-badge&logo=paypal&logoColor=white)](https://www.paypal.com/donate/?business=5FM6Y27A3CK58&no_recurring=0&currency_code=USD)

Thank you to my supporters:

- Craig H — $50
- Eric De Vet — $10
- Jan P — $5
- Minh P — $5
- Rödvarg R — $2

## Credits

[whisper.cpp](https://github.com/ggerganov/whisper.cpp) by Georgi Gerganov · [FFmpeg](https://ffmpeg.org) · [Windows FFmpeg builds](https://github.com/BtbN/FFmpeg-Builds) · [macOS FFmpeg builds](https://ffmpeg.martin-riedl.de/) · [SDL2](https://www.libsdl.org/) · [electron-builder](https://www.electron.build/)

## License

```text
Copyright (c) 2026 Mehtab Mahir
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
License: depends on the build; the bundled macOS binary is GPL 3.0 or later.
Windows setup downloads a GPL build from BtbN.
[https://ffmpeg.org](https://ffmpeg.org)
Windows builds: https://github.com/BtbN/FFmpeg-Builds
macOS builds: https://ffmpeg.martin-riedl.de/

The FFmpeg binary is provided as a separate file and may be replaced with a compatible version.

---

SDL2 (bundled on macOS)
License: zlib
https://www.libsdl.org/
```
