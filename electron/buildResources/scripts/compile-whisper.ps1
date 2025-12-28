Param(
    [string]$Workspace = (Join-Path ([Environment]::GetFolderPath('ApplicationData')) 'EasyWhisperUI/whisper-workspace'),
    [switch]$Force
)

$ErrorActionPreference = 'Stop'

function Write-Step {
    Param([string]$Message)
    Write-Host "==> $Message"
}

function Ensure-Directory {
    Param([string]$Path)
    if (-not (Test-Path $Path)) {
        New-Item -ItemType Directory -Path $Path | Out-Null
    }
}

Write-Step "Preparing workspace at $Workspace"
Ensure-Directory $Workspace
$binDir = Join-Path $Workspace 'bin'
Ensure-Directory $binDir
$modelsDir = Join-Path $Workspace 'models'
Ensure-Directory $modelsDir

$msysRoot = 'C:\msys64'
$cmakePath = Join-Path $msysRoot 'mingw64\\bin\\cmake.exe'

if (-not (Test-Path $cmakePath)) {
    Write-Step "Installing MSYS2 toolchain"
    $msysUrl = 'https://github.com/msys2/msys2-installer/releases/latest/download/msys2-base-x86_64-latest.sfx.exe'
    $msysTmp = Join-Path $env:TEMP 'msys2-installer.exe'
    Invoke-WebRequest -Uri $msysUrl -OutFile $msysTmp -UseBasicParsing
    Start-Process -FilePath $msysTmp -ArgumentList '-y','-oC:\' -Wait -NoNewWindow
}

Write-Step "Synchronising MSYS2 packages"
$bashPath = Join-Path $msysRoot 'usr\\bin\\bash.exe'
& $bashPath --login -c "pacman -Sy --noconfirm && pacman -S --needed --noconfirm mingw-w64-x86_64-toolchain base-devel mingw-w64-x86_64-cmake mingw-w64-x86_64-SDL2 ninja"

$sourceDir = Join-Path $Workspace 'whisper.cpp'
if ($Force -or -not (Test-Path (Join-Path $sourceDir 'CMakeLists.txt'))) {
    Write-Step "Fetching whisper.cpp sources"
    if (Test-Path $sourceDir) {
        Remove-Item $sourceDir -Recurse -Force
    }
    $zipPath = Join-Path $env:TEMP 'whisper.cpp.zip'
    $tmpDir = Join-Path $env:TEMP 'whisper-src'
    if (Test-Path $zipPath) { Remove-Item $zipPath -Force }
    if (Test-Path $tmpDir) { Remove-Item $tmpDir -Recurse -Force }
    $repoUrl = 'https://github.com/ggerganov/whisper.cpp/archive/refs/heads/master.zip'
    Invoke-WebRequest -Uri $repoUrl -OutFile $zipPath -UseBasicParsing
    Expand-Archive -LiteralPath $zipPath -DestinationPath $tmpDir -Force
    $extracted = Get-ChildItem -Path $tmpDir | Where-Object { $_.PSIsContainer } | Select-Object -First 1
    if ($null -eq $extracted) {
        throw 'Failed to extract whisper.cpp repository.'
    }
    Move-Item -Path $extracted.FullName -Destination $sourceDir
    Remove-Item $zipPath -Force
    Remove-Item $tmpDir -Recurse -Force
}

$buildDir = Join-Path $sourceDir 'build'
Ensure-Directory $buildDir

Write-Step "Configuring whisper.cpp"
& $cmakePath -S $sourceDir -B $buildDir -G Ninja -DGGML_VULKAN=1 -DWHISPER_SDL2=ON -DWHISPER_BUILD_EXAMPLES=ON -DSDL2_DIR=C:/msys64/mingw64/lib/cmake/SDL2 -DCMAKE_BUILD_TYPE=Release

Write-Step "Building whisper-cli and whisper-stream"
$cpuCount = [Math]::Max(1, [Environment]::ProcessorCount - 1)
& $cmakePath --build $buildDir --target whisper-cli whisper-stream --config Release -j $cpuCount

Write-Step "Copying binaries"
Copy-Item (Join-Path $buildDir 'bin/whisper-cli.exe') $binDir -Force
Copy-Item (Join-Path $buildDir 'bin/whisper-stream.exe') $binDir -Force

$runtimeDlls = @(
    'libwinpthread-1.dll',
    'libstdc++-6.dll',
    'libgcc_s_seh-1.dll',
    'SDL2.dll'
)

foreach ($dll in $runtimeDlls) {
    Copy-Item (Join-Path $msysRoot "mingw64\\bin\\$dll") $binDir -Force
}

Write-Step "Whisper binaries created in $binDir"
