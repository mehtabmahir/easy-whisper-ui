@echo off
REM Check if an argument (audio file) was provided
if "%~1"=="" (
    echo No audio file specified.
    pause
    exit /b 1
)

REM Set the input file and output file (same name as audio but with .txt extension)
set "input=%~1"
set "output=%~dpn1.txt"

echo Processing %input% ...

REM Use %~dp0 to reference the batch file's directory
"%~dp0whisper-cli.exe" -m "%~dp0models\ggml-tiny.bin" -f "%input%" -otxt

echo Transcription complete.

REM Open the output file in Notepad
start notepad.exe "%input%.txt"
