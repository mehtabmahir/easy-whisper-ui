#!/usr/bin/env bash
set -euo pipefail

# Compile whisper.cpp for Linux and stage binaries into linux-bin

log() {
  echo "==> $1"
}

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Error: required command '$1' not found" >&2
    return 1
  fi
  return 0
}

OS="$(uname -s)"
if [[ "$OS" != "Linux" ]]; then
  log "Non-Linux detected ($OS); skipping compile."
  exit 0
fi

# Resolve paths
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ELECTRON_DIR="$(cd "$SCRIPT_DIR/../../" && pwd)"
WHISPER_DIR="$ELECTRON_DIR/buildResources/whisper.cpp"
BUILD_DIR="$WHISPER_DIR/build"
LINUX_BIN_DIR="$ELECTRON_DIR/buildResources/linux-bin"

log "Preparing directories"
mkdir -p "$BUILD_DIR" "$LINUX_BIN_DIR"

# Check for required build tools
log "Checking build dependencies"
MISSING_DEPS=0

if ! require_cmd cmake; then
  log "Warning: cmake not found - build will be skipped"
  log "Install build dependencies:"
  log "  Ubuntu/Debian: sudo apt-get install cmake ninja-build gcc g++"
  log "  Fedora/RHEL: sudo dnf install cmake ninja-build gcc gcc-c++"
  log "  Arch: sudo pacman -S cmake ninja gcc"
  MISSING_DEPS=1
fi

if ! require_cmd ninja; then
  log "Warning: ninja not found - build will be skipped"
  log "Install: sudo apt-get install ninja-build (Debian/Ubuntu)"
  log "Install: sudo dnf install ninja-build (Fedora)"
  log "Install: sudo pacman -S ninja (Arch)"
  MISSING_DEPS=1
fi

if ! require_cmd gcc; then
  log "Warning: gcc not found - build will be skipped"
  MISSING_DEPS=1
fi

if ! require_cmd g++; then
  log "Warning: g++ not found - build will be skipped"
  MISSING_DEPS=1
fi

if [[ $MISSING_DEPS -eq 1 ]]; then
  log "Build dependencies missing - skipping whisper.cpp compilation"
  log "Install the required packages and run the build script manually when ready"
  exit 0
fi

if ! require_cmd curl; then
  log "Error: curl not found"
  exit 1
fi

# Check for SDL2
if ! pkg-config --exists sdl2 2>/dev/null; then
  log "Warning: SDL2 not found via pkg-config"
  log "Install SDL2 development package for your distro:"
  log "  Ubuntu/Debian: sudo apt-get install libsdl2-dev"
  log "  Fedora/RHEL: sudo dnf install SDL2-devel"
  log "  Arch: sudo pacman -S sdl2"
  log ""
  log "Attempting to continue without SDL2..."
fi

# Check for whisper.cpp source
if [[ ! -f "$WHISPER_DIR/CMakeLists.txt" ]]; then
  log "whisper.cpp source not found, cloning..."
  if [[ ! -d "$WHISPER_DIR" ]]; then
    mkdir -p "$WHISPER_DIR"
  fi
  TMP_DIR="$(mktemp -d)"
  log "Downloading whisper.cpp source"
  curl -L "https://github.com/ggerganov/whisper.cpp/archive/refs/heads/master.tar.gz" -o "$TMP_DIR/whisper.tar.gz"
  tar -xzf "$TMP_DIR/whisper.tar.gz" -C "$TMP_DIR"
  mv "$TMP_DIR"/whisper.cpp-*/* "$WHISPER_DIR/"
  rm -rf "$TMP_DIR"
fi

# Configure CMake
log "Configuring whisper.cpp"
CMAKE_ARGS=(
  -S "$WHISPER_DIR"
  -B "$BUILD_DIR"
  -G Ninja
  -DWHISPER_BUILD_EXAMPLES=ON
  -DCMAKE_BUILD_TYPE=Release
)

# Add SDL2 if available
if pkg-config --exists sdl2 2>/dev/null; then
  SDL2_CFLAGS="$(pkg-config --cflags sdl2)"
  SDL2_LIBS="$(pkg-config --libs sdl2)"
  CMAKE_ARGS+=(
    -DWHISPER_SDL2=ON
    "-DCMAKE_C_FLAGS=${SDL2_CFLAGS}"
    "-DCMAKE_CXX_FLAGS=${SDL2_CFLAGS}"
  )
  log "Building with SDL2 support"
else
  log "Building without SDL2 support"
fi

cmake "${CMAKE_ARGS[@]}"

# Get CPU count
CPU_COUNT="$(nproc 2>/dev/null || echo 4)"
(( CPU_COUNT = CPU_COUNT > 1 ? CPU_COUNT - 1 : 1 ))

# Build
log "Building whisper-cli and whisper-stream (using $CPU_COUNT cores)"
cmake --build "$BUILD_DIR" --target whisper-cli whisper-stream --config Release -j "$CPU_COUNT"

# Stage binaries
log "Staging binaries to linux-bin"
cp -f "$BUILD_DIR/bin/whisper-cli"    "$LINUX_BIN_DIR/whisper-cli"
cp -f "$BUILD_DIR/bin/whisper-stream" "$LINUX_BIN_DIR/whisper-stream"
chmod +x "$LINUX_BIN_DIR/whisper-cli" "$LINUX_BIN_DIR/whisper-stream"

# Download ffmpeg if not present
FFMPEG_DEST="$LINUX_BIN_DIR/ffmpeg"
FFMPEG_VERSION="6.1.1"
FFMPEG_URL="https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz"

if [[ -x "$FFMPEG_DEST" ]]; then
  log "ffmpeg already present; skipping download"
else
  log "Downloading ffmpeg ${FFMPEG_VERSION}"
  TMP_DIR="$(mktemp -d)"
  TAR_PATH="$TMP_DIR/ffmpeg.tar.xz"
  curl -L "$FFMPEG_URL" -o "$TAR_PATH"
  tar -xf "$TAR_PATH" -C "$TMP_DIR" --strip-components=1
  cp "$TMP_DIR/ffmpeg" "$FFMPEG_DEST"
  chmod +x "$FFMPEG_DEST"
  rm -rf "$TMP_DIR"
fi

log "Whisper binaries ready in $LINUX_BIN_DIR"
