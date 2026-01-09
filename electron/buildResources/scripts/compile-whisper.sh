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

log "Staging binaries to mac-bin"
cp -f "$BUILD_DIR/bin/whisper-cli"    "$MAC_BIN_DIR/whisper-cli"
cp -f "$BUILD_DIR/bin/whisper-stream" "$MAC_BIN_DIR/whisper-stream"
chmod +x "$MAC_BIN_DIR/whisper-cli" "$MAC_BIN_DIR/whisper-stream"

log "Copying dylibs next to executables"
find "$BUILD_DIR" -maxdepth 5 -type f -name "*.dylib" -print0 | while IFS= read -r -d '' dylib; do
  cp -f "$dylib" "$MAC_BIN_DIR/$(basename "$dylib")"
done

# Create compatibility symlinks expected by install names
pushd "$MAC_BIN_DIR" >/dev/null
ln -sf libwhisper.1.8.2.dylib libwhisper.1.dylib
ln -sf libwhisper.1.8.2.dylib libwhisper.dylib
ln -sf libggml.0.9.4.dylib libggml.0.dylib
ln -sf libggml.0.9.4.dylib libggml.dylib
ln -sf libggml-cpu.0.9.4.dylib libggml-cpu.0.dylib
ln -sf libggml-cpu.0.9.4.dylib libggml-cpu.dylib
ln -sf libggml-blas.0.9.4.dylib libggml-blas.0.dylib
ln -sf libggml-metal.0.9.4.dylib libggml-metal.0.dylib
ln -sf libggml-base.0.9.4.dylib libggml-base.0.dylib
ln -sf libggml-base.0.9.4.dylib libggml-base.dylib
popd >/dev/null

adjust_rpaths() {
  local target="$1"
  local delete_paths=(
    "$BUILD_DIR/src"
    "$BUILD_DIR/ggml/src"
    "$BUILD_DIR/ggml/src/ggml-blas"
    "$BUILD_DIR/ggml/src/ggml-metal"
  )

  for path in "${delete_paths[@]}"; do
    if install_name_tool -delete_rpath "$path" "$target" 2>/dev/null; then
      :
    fi
  done

  install_name_tool -add_rpath "@executable_path" "$target" 2>/dev/null || true
  install_name_tool -add_rpath "@loader_path" "$target" 2>/dev/null || true
}

fix_dependencies() {
  local target="$1"
  # Get list of dependencies and fix them
  otool -L "$target" | grep -E '^\s+/' | awk '{print $1}' | while read -r dep; do
    dep_name="$(basename "$dep")"
    # Only fix dependencies that reference absolute paths (excluding system paths)
    if [[ "$dep" == /* ]] && [[ "$dep" != /usr/* ]] && [[ "$dep" != /System/* ]]; then
      install_name_tool -change "$dep" "@rpath/$dep_name" "$target" 2>/dev/null || true
    fi
  done
}

# First, fix the install name (ID) of each dylib to use @rpath
log "Fixing dylib install names to use @rpath"
for dylib in "$MAC_BIN_DIR"/*.dylib; do
  [ -e "$dylib" ] || continue
  [ -L "$dylib" ] && continue  # Skip symlinks
  
  dylib_name="$(basename "$dylib")"
  install_name_tool -id "@rpath/$dylib_name" "$dylib" 2>/dev/null || true
done

# Second, fix dependency references in executables to use @rpath
log "Fixing executable dependencies to use @rpath"
for bin in "$MAC_BIN_DIR/whisper-cli" "$MAC_BIN_DIR/whisper-stream"; do
  [ -e "$bin" ] || continue
  fix_dependencies "$bin"
  adjust_rpaths "$bin"
done

# Third, fix dependency references in dylibs to use @rpath
log "Fixing dylib dependencies to use @rpath"
for dylib in "$MAC_BIN_DIR"/*.dylib; do
  [ -e "$dylib" ] || continue
  [ -L "$dylib" ] && continue  # Skip symlinks
  fix_dependencies "$dylib"
  adjust_rpaths "$dylib"
done

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
