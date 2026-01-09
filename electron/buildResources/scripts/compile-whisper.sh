#!/usr/bin/env bash
set -euo pipefail

# Compile whisper.cpp for macOS with Metal and stage binaries into mac-bin

log() {
  echo "==> $1"
}

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Error: required command '$1' not found" >&2
    exit 1
  fi
}

OS="$(uname -s)"
if [[ "$OS" != "Darwin" ]]; then
  log "Non-macOS detected ($OS); skipping compile."
  exit 0
fi

# Resolve paths
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ELECTRON_DIR="$(cd "$SCRIPT_DIR/../../" && pwd)"
WHISPER_DIR="$ELECTRON_DIR/buildResources/whisper.cpp"
BUILD_DIR="$WHISPER_DIR/build"
MAC_BIN_DIR="$ELECTRON_DIR/buildResources/mac-bin"

log "Preparing directories"
mkdir -p "$BUILD_DIR" "$MAC_BIN_DIR"

# Ensure Homebrew
if ! command -v brew >/dev/null 2>&1; then
  echo "Error: Homebrew is required to install build dependencies." >&2
  echo "Install Homebrew from https://brew.sh and re-run this script." >&2
  exit 1
fi

log "Ensuring build dependencies via Homebrew"
brew update >/dev/null || true
brew list --versions cmake >/dev/null 2>&1 || brew install cmake
brew list --versions ninja >/dev/null 2>&1 || brew install ninja
brew list --versions sdl2 >/dev/null 2>&1 || brew install sdl2

SDL2_CMAKE_DIR="$(brew --prefix sdl2)/lib/cmake/SDL2"
if [[ ! -d "$SDL2_CMAKE_DIR" ]]; then
  echo "Error: SDL2 CMake directory not found at $SDL2_CMAKE_DIR" >&2
  exit 1
fi

require_cmd cmake
require_cmd ninja
require_cmd curl
require_cmd unzip

log "Configuring whisper.cpp with Metal + SDL2"
cmake -S "$WHISPER_DIR" -B "$BUILD_DIR" \
  -G Ninja \
  -DBUILD_SHARED_LIBS=OFF \
  -DGGML_METAL=ON \
  -DGGML_METAL_EMBED_LIBRARY=ON \
  -DWHISPER_BUILD_EXAMPLES=ON \
  -DWHISPER_SDL2=ON \
  -DSDL2_DIR="$SDL2_CMAKE_DIR" \
  -DCMAKE_BUILD_TYPE=Release

CPU_COUNT="$(sysctl -n hw.ncpu 2>/dev/null || echo 4)"
(( CPU_COUNT = CPU_COUNT > 1 ? CPU_COUNT - 1 : 1 ))

log "Building targets: whisper-cli whisper-stream"
cmake --build "$BUILD_DIR" --target whisper-cli whisper-stream --config Release -j "$CPU_COUNT"

log "Staging static binaries to mac-bin"
cp -f "$BUILD_DIR/bin/whisper-cli"    "$MAC_BIN_DIR/whisper-cli"
cp -f "$BUILD_DIR/bin/whisper-stream" "$MAC_BIN_DIR/whisper-stream"
chmod +x "$MAC_BIN_DIR/whisper-cli" "$MAC_BIN_DIR/whisper-stream"

# Bundle ffmpeg so conversions work out of the box on Apple silicon
FFMPEG_DEST="$MAC_BIN_DIR/ffmpeg"
FFMPEG_URL="https://ffmpeg.martin-riedl.de/redirect/latest/macos/arm64/snapshot/ffmpeg.zip"

# Remove old download when a build requests a refresh so we always stage the ARM64 snapshot.
if [[ -n "${FFMPEG_FORCE_DOWNLOAD:-}" && -e "$FFMPEG_DEST" ]]; then
  log "Replacing cached FFmpeg because FFMPEG_FORCE_DOWNLOAD is set"
  rm -f "$FFMPEG_DEST"
fi

if [[ -x "$FFMPEG_DEST" ]]; then
  log "ffmpeg already present; skipping download"
else
  log "Downloading latest FFmpeg release"
  TMP_DIR="$(mktemp -d)"
  ZIP_PATH="$TMP_DIR/ffmpeg.zip"
  curl -JL "$FFMPEG_URL" -o "$ZIP_PATH"
  unzip -o "$ZIP_PATH" ffmpeg -d "$TMP_DIR" >/dev/null
  mv "$TMP_DIR/ffmpeg" "$FFMPEG_DEST"
  chmod +x "$FFMPEG_DEST"
  rm -rf "$TMP_DIR"
fi

log "Whisper binaries ready in $MAC_BIN_DIR"
