#Requires -Version 5.1
<#
.SYNOPSIS
Preview or remove dependencies installed by EasyWhisperUI's Windows setup.
.DESCRIPTION
Run without arguments to preview. Run with -Apply to remove dependencies.
Close EasyWhisperUI and its setup/build processes first. Run from a normal,
non-administrator PowerShell under the SAME Windows account that runs the app.
Machine-wide uninstallers can request elevation themselves.

Removes shared Git and Vulkan SDK installations via winget, and app-owned
Whisper binaries/source, MSYS2 (GCC, CMake, SDL2, Ninja, build tools), FFmpeg,
and setup downloads. Preserves the app, downloaded models, settings and audio.
Does not remove Windows components, GPU drivers or their Vulkan runtime.
Externally installed tools that setup reused may require separate removal.
.EXAMPLE
powershell -NoProfile -ExecutionPolicy Bypass -File .\Remove-EasyWhisperDependencies.ps1
.EXAMPLE
powershell -NoProfile -ExecutionPolicy Bypass -File .\Remove-EasyWhisperDependencies.ps1 -Apply
#>
[CmdletBinding(SupportsShouldProcess = $true)]
param(
    [switch]$Apply,
    # Optional exact whisper-workspace path for a nonstandard app data location.
    [string[]]$Workspace
)

$ErrorActionPreference = 'Stop'
if (-not $Workspace) {
    $Workspace = @('Electron', 'EasyWhisperUI', 'easy-whisper-electron') | ForEach-Object {
        Join-Path $env:APPDATA ($_ + '\whisper-workspace')
    }
}
$roots = @($Workspace | ForEach-Object {
    $resolved = [IO.Path]::GetFullPath($_).TrimEnd('\')
    if ([IO.Path]::GetFileName($resolved) -ne 'whisper-workspace') {
        throw "Expected an exact whisper-workspace directory: $resolved"
    }
    $resolved
} | Select-Object -Unique)

function Assert-NoReparsePoint([string]$Target) {
    $current = $Target
    while ($current) {
        if (Test-Path -LiteralPath $current) {
            $item = Get-Item -LiteralPath $current -Force
            if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) {
                throw "Refusing a symbolic link or junction: $current"
            }
        }
        $current = [IO.Path]::GetDirectoryName($current)
    }
}

$targets = @(foreach ($root in $roots) {
    Assert-NoReparsePoint $root
    foreach ($name in @('bin', 'whisper.cpp', 'toolchain', 'downloads')) {
        $target = [IO.Path]::GetFullPath((Join-Path $root $name))
        if ([IO.Path]::GetDirectoryName($target) -ne $root) { throw "Unsafe target: $target" }
        if (Test-Path -LiteralPath $target) {
            Assert-NoReparsePoint $target
            # Reject nested junctions before any recursive deletion as well.
            $links = @(Get-ChildItem -LiteralPath $target -Force -Recurse -Attributes ReparsePoint)
            if ($links.Count) { throw "Nested links found in $target; inspect manually before cleanup." }
            $target
        }
    }
})

Write-Host 'Shared packages (may also be used by other software):'
$packageIds = @('Git.Git', 'KhronosGroup.VulkanSDK')
$winget = Get-Command winget.exe -ErrorAction SilentlyContinue
foreach ($id in $packageIds) {
    Write-Host "  $id"
    if ($winget) { & $winget.Source list --id $id --exact --disable-interactivity }
}
Write-Host "`nApp-owned dependency folders:"
if ($targets.Count) { $targets | ForEach-Object { Write-Host "  $_" } }
else { Write-Host '  None found.' }

$ffmpegPaths = @($roots | ForEach-Object { Join-Path $_ 'toolchain\ffmpeg\bin' })
$oldPath = [Environment]::GetEnvironmentVariable('Path', 'User')
$newParts = @($oldPath -split ';' | Where-Object {
    $entry = $_.Trim().Trim('"').Replace('/', '\').TrimEnd('\')
    $ffmpegPaths -notcontains $entry
})
$newPath = $newParts -join ';'
if ($newPath -ne $oldPath) { Write-Host "`nWill remove app-owned FFmpeg entries from the user PATH." }

if (-not $Apply) {
    Write-Host "`nPreview only. Close the app, then rerun with -Apply to remove these dependencies."
    return
}
if (-not $winget) { throw 'winget is unavailable. No dependencies removed.' }
$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = New-Object Security.Principal.WindowsPrincipal($identity)
if ($principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw 'Run this script from normal PowerShell, not Administrator. Per-user Vulkan SDK uninstall refuses elevation. No dependencies removed in this run.'
}

$failures = @()
foreach ($target in $targets) {
    if ($PSCmdlet.ShouldProcess($target, 'Remove app-owned dependency folder')) {
        try {
            Assert-NoReparsePoint $target
            Remove-Item -LiteralPath $target -Recurse -Force
        } catch { $failures += "${target}: $($_.Exception.Message)" }
    }
}
if ($newPath -ne $oldPath -and $PSCmdlet.ShouldProcess('User PATH', 'Remove app-owned FFmpeg entries')) {
    [Environment]::SetEnvironmentVariable('Path', $newPath, 'User')
}
foreach ($id in $packageIds) {
    if ($PSCmdlet.ShouldProcess($id, 'Uninstall shared dependency (all installed versions)')) {
        & $winget.Source uninstall --id $id --exact --all-versions --disable-interactivity
        if ($LASTEXITCODE -eq -1978335107) {
            $failures += "$id requires a non-administrator PowerShell. Rerun there with -Apply."
            continue
        }
        # APPINSTALLER_CLI_ERROR_NO_APPLICATIONS_FOUND means already absent.
        if ($LASTEXITCODE -ne 0 -and $LASTEXITCODE -ne -1978335212) {
            $failures += "$id uninstall returned $LASTEXITCODE. Review winget output."
        }
    }
}
if ($failures.Count) { throw ($failures -join "`n") }
Write-Host "`nDependency cleanup finished. Open a new terminal before testing setup."
Write-Host 'The app, models, settings, original files, and GPU drivers were preserved.'
