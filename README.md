# EasyWhisperUI

<img src="resources/icon.png" alt="EasyWhisperUI logo" width="140" />

Transcribe audio and video locally with Whisper, with GPU acceleration on supported hardware.

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

- Batch audio/video transcription with automatic format conversion.
- Live microphone transcription (beta).
- Multilingual transcription and translation into English.
- Plain text (`.txt`) and timestamped subtitles (`.srt`).
- Downloadable Whisper models and local whisper.cpp-compatible custom models.
- GPU acceleration, processing logs, and extra Whisper CLI arguments.

## Quick start

1. Run the Windows installer, or open the Mac DMG and drag **EasyWhisperUI** into **Applications**.
2. Launch the app and let initial setup finish. macOS includes Whisper and FFmpeg.
3. Choose your model, language, and output formats. Missing models download automatically. For a local model, choose **custom → Select Model File**.
4. Click **Open** or drop files into the window. Transcription starts automatically; exports are saved beside the original files.

**Skip** moves to the next file. **Stop** cancels the whole queue.

## Settings

Choose Light, Dark, or Auto themes. Download models with byte-based progress, delete individual models, or clear the converted-audio cache.

Converted audio is reused across retries and model changes, then cleared on normal exit. Clearing the cache leaves original files and exported transcripts untouched.

## Troubleshooting

The Mac app is ad-hoc signed and not notarized. If macOS blocks it, try **System Settings → Privacy & Security → Open Anyway**. For a “damaged” message, follow the [release's first-opening instructions](https://github.com/mehtabmahir/easy-whisper-ui/releases/tag/v3.0#macos-first-opening).

For other problems, [open an issue](https://github.com/mehtabmahir/easy-whisper-ui/issues) with your OS, selected model, and console logs.

## Development

Requires Node.js 22.12+; Node.js 24 is recommended. Clone with submodules, then:

```bash
cd electron
npm install
npm run dev
```

Use `npm run dist` to package the app into `build/electron-dist` at the repository root. See the [developer README](electron/README.md) for architecture and platform setup.

## Support

[Donate via PayPal](https://www.paypal.com/donate/?business=5FM6Y27A3CK58&no_recurring=0&currency_code=USD) to support development.

Thank you to our supporters:

- Craig H — $50
- Eric De Vet — $10
- Jan P — $5
- Minh P — $5
- Rödvarg R — $2

## Credits

[whisper.cpp](https://github.com/ggerganov/whisper.cpp) by Georgi Gerganov · [FFmpeg](https://ffmpeg.org) · [Windows FFmpeg builds](https://www.gyan.dev/ffmpeg/) · [electron-builder](https://www.electron.build/)

## License

```text
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
```
