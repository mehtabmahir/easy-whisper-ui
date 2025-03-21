@echo off
REM Create the models directory if it doesn't exist.
if not exist models (
    mkdir models
)

echo.
echo Select a model to download:
echo.
echo 1. ggml-tiny.bin
echo 2. ggml-base.bin
echo 3. ggml-small.bin
echo 4. ggml-medium.bin
echo 5. ggml-large.bin
echo 6. ggml-large-v3.bin
echo 7. Download All Models
echo.
set /p choice="Enter your choice (1-7): "

if "%choice%"=="1" goto downloadTiny
if "%choice%"=="2" goto downloadBase
if "%choice%"=="3" goto downloadSmall
if "%choice%"=="4" goto downloadMedium
if "%choice%"=="6" goto downloadLargeV3
if "%choice%"=="7" goto downloadAll

echo Invalid choice.
pause
exit /b

:downloadTiny
echo Downloading ggml-tiny.bin...
curl -L -o models\ggml-tiny.bin https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.bin
goto end

:downloadBase
echo Downloading ggml-base.bin...
curl -L -o models\ggml-base.bin https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin
goto end

:downloadSmall
echo Downloading ggml-small.bin...
curl -L -o models\ggml-small.bin https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin
goto end

:downloadMedium
echo Downloading ggml-medium.bin...
curl -L -o models\ggml-medium.bin https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-medium.bin
goto end

:downloadLargeV3
echo Downloading ggml-large-v3.bin...
curl -L -o models\ggml-large-v3.bin https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3.bin
goto end

:downloadAll
echo Downloading all models...
curl -L -o models\ggml-tiny.bin https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.bin
curl -L -o models\ggml-base.bin https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin
curl -L -o models\ggml-small.bin https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin
curl -L -o models\ggml-medium.bin https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-medium.bin
curl -L -o models\ggml-large-v3.bin https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3.bin
goto end

:end
echo.
echo Download complete.
pause
