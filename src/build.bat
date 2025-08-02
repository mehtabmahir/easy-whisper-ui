
cd /d "%~dp0\whisper.cpp"

"C:\msys64\mingw64\bin\cmake.exe" -B build -G Ninja -DGGML_VULKAN=1 -DWHISPER_SDL2=ON -DWHISPER_BUILD_EXAMPLES=ON -DSDL2_DIR=C:/msys64/mingw64/lib/cmake/SDL2 -DCMAKE_BUILD_TYPE=Release .

"C:\msys64\mingw64\bin\cmake.exe" --build build --target whisper-cli whisper-stream --config Release -j8

xcopy /y ".\build\bin\whisper-cli.exe"    "%~dp0" >nul
xcopy /y ".\build\bin\whisper-stream.exe" "%~dp0" >nul

xcopy /y "C:\msys64\mingw64\bin\SDL2.dll" "%~dp0" >nul

start "" "%~dp0EasyWhisperUI.exe"
exit