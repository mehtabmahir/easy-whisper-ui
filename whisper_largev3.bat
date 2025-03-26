@echo off
REM Ensure script runs in its own directory
cd /d "%~dp0"

REM Check if an argument (audio file) was provided
if "%~1"=="" (
    echo No audio file specified. Please drag and drop a file or use "Open With".
    pause
    exit /b 1
)

REM Handle case where script is run using "Open With" (quotes handling)
set "input=%~1"
if "%input:~0,1%"=="\"" set "input=%input:~1,-1%"

REM Ensure full path is resolved if "Open With" is used
for %%F in ("%input%") do set "input=%%~fF"

REM Verify input file exists
if not exist "%input%" (
    echo Error: File not found.
    pause
    exit /b 1
)

REM Set the output file (using the same base name with a .txt extension)
set "output=%~dpn1"
set "mp3file=%~dpn1.mp3"

REM Determine the file extension (convert to lowercase for consistency)
for %%A in ("%input%") do set "ext=%%~xA"
set "ext=%ext:~1%"

REM Convert to lowercase (Windows batch is case insensitive, but good practice)
if /i not "%ext%"=="mp3" (
    echo Converting %input% to MP3...
    ffmpeg -i "%input%" -q:a 2 "%mp3file%"
    if %errorlevel% neq 0 (
        echo Conversion failed.
        pause
        exit /b 1
    )
    set "input=%mp3file%"
)

echo Processing %input% ...

REM Run whisper-cli.exe with tuned parameters
"%~dp0whisper-cli.exe" -m "%~dp0models\ggml-large-v3.bin" -f "%input%" -otxt -l en -tp 0.0 -mc 64 -et 3.0

echo Transcription complete.

REM Wait 2 seconds to ensure the transcription file is fully written, then open it in Notepad.
timeout /t 2 /nobreak
start notepad.exe "%output%"

pause
