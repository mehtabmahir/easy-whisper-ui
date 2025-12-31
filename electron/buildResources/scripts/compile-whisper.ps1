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

$toolchainRoot = Join-Path $Workspace 'toolchain'
Ensure-Directory $toolchainRoot
$msysRoot = Join-Path $toolchainRoot 'msys64'
$cmakePath = Join-Path $msysRoot 'mingw64\\bin\\cmake.exe'
$downloadsDir = Join-Path $Workspace 'downloads'
Ensure-Directory $downloadsDir

if ($Force -and (Test-Path $msysRoot)) {
    Remove-Item $msysRoot -Recurse -Force
}

if (-not (Test-Path $cmakePath)) {
    Write-Step "Installing MSYS2 toolchain"
    $msysUrl = 'https://github.com/msys2/msys2-installer/releases/latest/download/msys2-base-x86_64-latest.sfx.exe'
    $msysTmp = Join-Path $downloadsDir 'msys2-installer.exe'
    if (Test-Path $msysTmp) {
        Remove-Item $msysTmp -Force
    }
    Invoke-WebRequest -Uri $msysUrl -OutFile $msysTmp -UseBasicParsing
    $extractArgs = @('-y', "-o`"$toolchainRoot`"")
    Start-Process -FilePath $msysTmp -ArgumentList $extractArgs -Wait -NoNewWindow
    Remove-Item $msysTmp -Force
    if (-not (Test-Path (Join-Path $msysRoot 'usr\\bin\\bash.exe'))) {
        throw "MSYS2 extraction failed at $msysRoot"
    }
}

Write-Step "Synchronising MSYS2 packages"
$bashPath = Join-Path $msysRoot 'usr\\bin\\bash.exe'
& $bashPath --login -c "pacman -Sy --noconfirm && pacman -S --needed --noconfirm mingw-w64-x86_64-toolchain base-devel mingw-w64-x86_64-cmake mingw-w64-x86_64-SDL2 ninja"

$mingwBin = Join-Path $msysRoot 'mingw64\\bin'
$usrBin = Join-Path $msysRoot 'usr\\bin'
if (-not (Test-Path (Join-Path $mingwBin 'gcc.exe'))) {
    throw "MSYS2 toolchain not found at $mingwBin"
}

# Ensure MSYS2 toolchain precedes conflicting toolchains such as Conda's mingw distribution.
$existingPath = $env:PATH -split ';' | Where-Object {
    $_ -and ($_ -ne $mingwBin) -and ($_ -ne $usrBin) -and ($_ -notlike '*\miniconda3\Library\mingw-w64\bin*')
}
$env:PATH = ($mingwBin, $usrBin) + $existingPath -join ';'

$gccPath = Join-Path $mingwBin 'gcc.exe'
$gxxPath = Join-Path $mingwBin 'g++.exe'
$gccArPath = Join-Path $mingwBin 'gcc-ar.exe'
$gccRanlibPath = Join-Path $mingwBin 'gcc-ranlib.exe'
$arPath = (Test-Path $gccArPath) ? $gccArPath : (Join-Path $mingwBin 'ar.exe')
$ranlibPath = (Test-Path $gccRanlibPath) ? $gccRanlibPath : (Join-Path $mingwBin 'ranlib.exe')
$cArchiveCreate = '<CMAKE_AR> crs <TARGET> <LINK_FLAGS> <OBJECTS>'
$cArchiveFinish = '<CMAKE_RANLIB> <TARGET>'
$env:CC = $gccPath
$env:CXX = $gxxPath
$env:AR = $arPath
$env:RANLIB = $ranlibPath
$env:MSYSTEM = 'MINGW64'
$env:CHERE_INVOKING = '1'


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
if (Test-Path $buildDir) {
    Write-Step "Resetting build directory"
    Remove-Item $buildDir -Recurse -Force
}
Ensure-Directory $buildDir

$sdl2Dir = (Join-Path $msysRoot 'mingw64\lib\cmake\SDL2' -replace '\\','/')

Write-Step "Configuring whisper.cpp"
& $cmakePath -S $sourceDir -B $buildDir -G Ninja `
    -DGGML_VULKAN=1 `
    -DWHISPER_SDL2=ON `
    -DWHISPER_BUILD_EXAMPLES=ON `
    -DSDL2_DIR=$sdl2Dir `
    -DCMAKE_BUILD_TYPE=Release `
    -DCMAKE_C_COMPILER=$gccPath `
    -DCMAKE_CXX_COMPILER=$gxxPath `
    -DCMAKE_AR=$arPath `
    -DCMAKE_RANLIB=$ranlibPath `
    "-DCMAKE_C_ARCHIVE_CREATE=$cArchiveCreate" `
    "-DCMAKE_CXX_ARCHIVE_CREATE=$cArchiveCreate" `
    "-DCMAKE_C_ARCHIVE_FINISH=$cArchiveFinish" `
    "-DCMAKE_CXX_ARCHIVE_FINISH=$cArchiveFinish"

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
