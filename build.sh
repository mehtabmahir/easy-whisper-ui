#!/bin/bash

build_dir=$(cd "$(dirname "$0")"; pwd -P)/build/Final


if [ -f $build_dir/whisper.cpp/build/bin/whisper-cli ]; then
    # Do not rebuild whisper-cli
    echo "using existing whisper.cpp"
else
    # Download whisper.cpp
    cd $build_dir
    git clone https://github.com/ggml-org/whisper.cpp.git

    # Change to the whisper.cpp directory
    cd "$build_dir/whisper.cpp"

    # Run CMake and build
    cmake -B build -DGGML_METAL=ON -DWHISPER_SDL2=ON -DBUILD_SHARED_LIBS=OFF -DGGML_METAL_EMBED_LIBRARY=ON
    cmake --build build --clean-first --config Release --parallel 8
fi

# Copy the whisper-cli binary into the bundle
cp "$build_dir/whisper.cpp/build/bin/whisper-cli" "$build_dir/EasyWhisperUI.app/Contents/MacOS/"


# Sign the built application
codesign --force --deep --sign - "$build_dir/EasyWhisperUI.app"
