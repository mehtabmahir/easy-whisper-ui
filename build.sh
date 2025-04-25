#!/bin/bash

set -e

# Step 0: Locate cmake dynamically if not found
if ! command -v cmake &> /dev/null; then
    echo "❌ cmake not found in PATH. Searching Qt installation..."
    cmake_fallback=$(find "$HOME/Qt" -type f -name "cmake" -path "*/CMake.app/Contents/bin/cmake" 2>/dev/null | head -n 1)
    if [ -x "$cmake_fallback" ]; then
        echo "✅ Found cmake at: $cmake_fallback"
        export PATH="$(dirname "$cmake_fallback"):$PATH"
    else
        echo "❌ Failed to locate cmake automatically. Aborting."
        exit 1
    fi
fi

# Step 1: Setup build directory
build_dir="$(cd "$(dirname "$0")"; pwd -P)/build/Final"
echo ">>> Working inside $build_dir"
mkdir -p "$build_dir"

# Step 2: Reclone whisper.cpp from scratch
echo ">>> Cleaning up any previous whisper.cpp repo"
rm -rf "$build_dir/whisper.cpp"

echo ">>> Cloning fresh whisper.cpp"
cd "$build_dir"
git clone https://github.com/ggml-org/whisper.cpp.git

# Step 3: Configure and build whisper.cpp
cd "$build_dir/whisper.cpp"
echo ">>> Running CMake configure"
cmake -B build -DGGML_METAL=ON -DWHISPER_SDL2=ON -DBUILD_SHARED_LIBS=OFF -DGGML_METAL_EMBED_LIBRARY=ON

echo ">>> Running CMake build"
cmake --build build --clean-first --config Release --parallel 8

# Step 4: Copy whisper-cli into .app bundle
cli_bin="$build_dir/whisper.cpp/build/bin/whisper-cli"
app_bin="$build_dir/EasyWhisperUI.app/Contents/MacOS"

if [ -f "$cli_bin" ]; then
    echo ">>> Copying whisper-cli into .app bundle"
    cp "$cli_bin" "$app_bin/"
else
    echo "❌ whisper-cli not found — build may have failed"
    exit 1
fi

# Step 5: Sign the application
echo ">>> Signing the application"
codesign --force --deep --sign - "$build_dir/EasyWhisperUI.app"

echo "✅ build.sh completed successfully"
