cd /d "%~dp0\whisper.cpp"
"C:\msys64\mingw64\bin\cmake.exe" -B build -DGGML_VULKAN=1 -DCMAKE_BUILD_TYPE=Release 
"C:\msys64\mingw64\bin\cmake.exe" --build build --config Release -j8
xcopy /y "%~dp0\whisper.cpp\build\bin\whisper-cli.exe" "%~dp0"
start "" "%~dp0\EasyWhisperUI.exe"
exit