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

require_cmd cmake
require_cmd ninja
require_cmd curl
require_cmd unzip

CPU_COUNT="$(sysctl -n hw.ncpu 2>/dev/null || echo 4)"
(( CPU_COUNT = CPU_COUNT > 1 ? CPU_COUNT - 1 : 1 ))

# Pin native SDL2 instead of Homebrew's SDL2-to-SDL3 compatibility library.
# Homebrew bottles may require the build host's OS, not our macOS 13 minimum.
SDL_VERSION="2.32.10"
SDL_ROOT="$BUILD_DIR/_deps/sdl2"
SDL_ARCHIVE="$SDL_ROOT/SDL2-$SDL_VERSION.tar.gz"
SDL_INSTALL="$SDL_ROOT/install"
mkdir -p "$SDL_ROOT"
if [[ ! -f "$SDL_ARCHIVE" ]]; then
  curl -fL "https://github.com/libsdl-org/SDL/releases/download/release-$SDL_VERSION/SDL2-$SDL_VERSION.tar.gz" -o "$SDL_ARCHIVE"
fi
echo "5f5993c530f084535c65a6879e9b26ad441169b3e25d789d83287040a9ca5165  $SDL_ARCHIVE" | shasum -a 256 -c -
if [[ ! -d "$SDL_ROOT/SDL2-$SDL_VERSION" ]]; then
  tar -xzf "$SDL_ARCHIVE" -C "$SDL_ROOT"
fi
cmake -S "$SDL_ROOT/SDL2-$SDL_VERSION" -B "$SDL_ROOT/build" -G Ninja \
  -DCMAKE_BUILD_TYPE=Release -DCMAKE_INSTALL_PREFIX="$SDL_INSTALL" \
  -DCMAKE_OSX_ARCHITECTURES=arm64 -DCMAKE_OSX_DEPLOYMENT_TARGET=13.0 \
  -DSDL_SHARED=ON -DSDL_STATIC=OFF -DSDL_TEST=OFF
cmake --build "$SDL_ROOT/build" -j "$CPU_COUNT"
cmake --install "$SDL_ROOT/build"
SDL2_CMAKE_DIR="$SDL_INSTALL/lib/cmake/SDL2"

log "Configuring whisper.cpp with Metal + SDL2"
cmake -S "$WHISPER_DIR" -B "$BUILD_DIR" \
  -G Ninja \
  -DBUILD_SHARED_LIBS=OFF \
  -DCMAKE_OSX_ARCHITECTURES=arm64 \
  -DCMAKE_OSX_DEPLOYMENT_TARGET=13.0 \
  -DGGML_NATIVE=OFF \
  -DGGML_METAL=ON \
  -DGGML_METAL_EMBED_LIBRARY=ON \
  -DWHISPER_BUILD_EXAMPLES=ON \
  -DWHISPER_SDL2=ON \
  -DSDL2_DIR="$SDL2_CMAKE_DIR" \
  -DCMAKE_BUILD_TYPE=Release

log "Building targets: whisper-cli whisper-stream"
cmake --build "$BUILD_DIR" --target whisper-cli whisper-stream --config Release -j "$CPU_COUNT"

log "Staging static binaries to mac-bin"
cp -f "$BUILD_DIR/bin/whisper-cli"    "$MAC_BIN_DIR/whisper-cli"
cp -f "$BUILD_DIR/bin/whisper-stream" "$MAC_BIN_DIR/whisper-stream"
chmod +x "$MAC_BIN_DIR/whisper-cli" "$MAC_BIN_DIR/whisper-stream"

log "Bundling SDL2 dylib for whisper-stream"
SDL2_DYLIB="$SDL_INSTALL/lib/libSDL2-2.0.0.dylib"
if [[ -f "$SDL2_DYLIB" ]]; then
  cp -f "$SDL2_DYLIB" "$MAC_BIN_DIR/libSDL2-2.0.0.dylib"
  chmod +x "$MAC_BIN_DIR/libSDL2-2.0.0.dylib"
else
  echo "Error: SDL2 dylib not found at $SDL2_DYLIB" >&2
  exit 1
fi

# Remove a staged compatibility library left by an earlier local build.
rm -f "$MAC_BIN_DIR/libSDL3.dylib"

chmod u+w "$MAC_BIN_DIR/libSDL2-2.0.0.dylib"
install_name_tool -id '@loader_path/libSDL2-2.0.0.dylib' "$MAC_BIN_DIR/libSDL2-2.0.0.dylib"
SDL2_LINK="$(otool -L "$MAC_BIN_DIR/whisper-stream" | awk '/libSDL2.*dylib/ { print $1; exit }')"
if [[ -z "$SDL2_LINK" ]]; then
  echo "Error: whisper-stream has no SDL2 library dependency" >&2
  exit 1
fi
install_name_tool -change "$SDL2_LINK" '@loader_path/libSDL2-2.0.0.dylib' "$MAC_BIN_DIR/whisper-stream"

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

# Fail packaging if a bundled binary still requires a non-system absolute path.
for binary in "$MAC_BIN_DIR"/*; do
  minos="$(otool -l "$binary" | awk '$1 == "minos" {print $2; exit}')"
  if [[ -z "$minos" || "${minos%%.*}" -gt 13 ]]; then
    echo "Error: unsupported macOS deployment target '$minos' in $binary" >&2
    exit 1
  fi
  if otool -L "$binary" | tail -n +2 | awk '{print $1}' | grep -Ev '^(@loader_path/|@rpath/|/System/Library/|/usr/lib/)' | grep .; then
    echo "Error: non-portable dependency in $binary" >&2
    exit 1
  fi
  codesign --force --sign - "$binary"
done

log "Whisper binaries ready in $MAC_BIN_DIR"
