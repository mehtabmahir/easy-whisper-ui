#!/bin/bash

set -e

# Step 0: Locate cmake dynamically if not found
if ! command -v cmake &> /dev/null; then
    echo "❌ cmake not found in PATH."
    exit 1
fi

# Step 1: Setup build directories
root_dir="$(cd "$(dirname "$0")"; pwd -P)"
build_dir="$root_dir/build/LinuxBundle"
temp_dir="$root_dir/build/temp_whisper_build"

echo ">>> Preparing build directories"
mkdir -p "$build_dir"
rm -rf "$temp_dir"
mkdir -p "$temp_dir"

# Step 2: Clone and build whisper.cpp in temp dir
echo ">>> Cloning whisper.cpp into temp directory"
git clone --depth 1 https://github.com/ggml-org/whisper.cpp.git "$temp_dir/whisper.cpp"

cd "$temp_dir/whisper.cpp"
echo ">>> Configuring with CMake"
cmake -B build -DWHISPER_SDL2=ON -DGGML_VULKAN=1 -DBUILD_SHARED_LIBS=OFF

echo ">>> Building whisper-cli"
cmake --build build --clean-first --config Release --parallel 8

# Step 3: Copy whisper-cli into bundle
cli_bin="$temp_dir/whisper.cpp/build/bin/whisper-cli"

if [ -f "$cli_bin" ]; then
    echo ">>> Copying whisper-cli into bundle directory"
    cp "$cli_bin" "$build_dir/"
else
    echo "❌ whisper-cli not found — build may have failed"
    exit 1
fi

# Step 4: Clean up temp build
echo ">>> Cleaning up temporary build directory"
rm -rf "$temp_dir"

echo "✅ Linux build.sh completed successfully"
