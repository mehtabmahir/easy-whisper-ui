#!/bin/bash

set -e

# Step 0: Locate cmake dynamically if not found
if ! command -v cmake &> /dev/null; then
    echo "❌ cmake not found in PATH."
    exit 1
fi

# Step 1: Setup build directory
build_dir="$(cd "$(dirname "$0")"; pwd -P)/build/LinuxBundle"
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
cmake -B build -DWHISPER_SDL2=ON -DBUILD_SHARED_LIBS=OFF

echo ">>> Running CMake build"
cmake --build build --clean-first --config Release --parallel 8

# Step 4: Copy whisper-cli into Linux bundle directory
cli_bin="$build_dir/whisper.cpp/build/bin/whisper-cli"
bundle_bin="$build_dir"

if [ -f "$cli_bin" ]; then
    echo ">>> Copying whisper-cli into bundle directory"
    cp "$cli_bin" "$bundle_bin/"
else
    echo "❌ whisper-cli not found — build may have failed"
    exit 1
fi

echo "✅ Linux build.sh completed successfully"
