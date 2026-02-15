import { app } from "electron";
import { spawn, spawnSync } from "node:child_process";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import fsp from "node:fs/promises";
import https from "node:https";
import path from "node:path";
import os from "node:os";
import { pipeline } from "node:stream/promises";
import { CompileOptions, CompileProgressEvent, CompileResult } from "../../types/easy-whisper";

export const WORK_ROOT_NAME = "whisper-workspace";
const WINDOWS_BINARY_TARGETS = ["whisper-cli.exe", "whisper-stream.exe"];
const LINUX_BINARY_TARGETS = ["whisper-cli", "whisper-stream"];
const MAC_BUNDLE_DIR_NAME = "mac-bin";

const TOOLCHAIN_DIR_NAME = "toolchain";
const DOWNLOADS_DIR_NAME = "downloads";
const FFMPEG_DIR_NAME = "ffmpeg";
const FFMPEG_DOWNLOAD_URL = "https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip";
const REQUIRED_DLLS = [
  "libwinpthread-1.dll",
  "libstdc++-6.dll",
  "libgcc_s_seh-1.dll",
  "libgomp-1.dll",
  "SDL2.dll"
];

type LinuxPackageManager = "apt" | "dnf" | "yum" | "zypper" | "pacman";

interface ToolchainContext {
  workRoot: string;
  toolchainRoot: string;
  downloadsDir: string;
  ffmpegRoot: string;
  ffmpegBin: string;
  msysRoot: string;
  mingwBin: string;
  usrBin: string;
  cmakePath: string;
  bashPath: string;
  gccPath: string;
  gxxPath: string;
  arPath: string;
  ranlibPath: string;
  sdl2CMakeDir: string;
  vulkanSdkPath?: string;
  env: NodeJS.ProcessEnv;
}

export interface CompileManagerEvents {
  progress: CompileProgressEvent;
  console: { source: "compile"; message: string };
}

type CompileEventNames = keyof CompileManagerEvents;

type CompileListener<T extends CompileEventNames> = (event: CompileManagerEvents[T]) => void;

export class CompileManager extends EventEmitter {
  private running = false;
  private logStream?: fs.WriteStream;
  private linuxAptUpdated = false;
  private linuxBootstrapDone = false;

  on<T extends CompileEventNames>(event: T, listener: CompileListener<T>): this {
    return super.on(event, listener as any);
  }

  once<T extends CompileEventNames>(event: T, listener: CompileListener<T>): this {
    return super.once(event, listener as any);
  }

  off<T extends CompileEventNames>(event: T, listener: CompileListener<T>): this {
    return super.off(event, listener as any);
  }

  async compile(options: CompileOptions = {}): Promise<CompileResult> {
    if (process.platform === "darwin") {
      try {
        return await this.stagePrebuiltMacBinaries(options.force === true);
      } catch (error) {
        const err = error as Error;
        return { success: false, error: err.message };
      }
    }

    if (process.platform !== "win32" && process.platform !== "linux") {
      return { success: false, error: "This platform is not supported for compilation." };
    }

    if (this.running) {
      return { success: false, error: "Compilation already in progress." };
    }

    this.running = true;

    const workRoot = await this.ensureWorkDirs();
    await this.startLog(workRoot);
    const binDir = path.join(workRoot, "bin");
    let toolchain!: ToolchainContext;

    try {
      const existingBinaries = this.hasBinariesInDir(binDir);

      if (existingBinaries && !options.force) {
        this.emitProgress({
          step: "check-cache",
          message: "Ready.",
          progress: 100,
          state: "success"
        });
        this.running = false;
        return { success: true, outputDir: binDir };
      }

      await this.runStep("prepare", "Preparing workspace", async () => {
        await fsp.mkdir(binDir, { recursive: true });
        toolchain = await this.prepareToolchain(workRoot, options.force === true);
      });

      await this.runStep("msys", process.platform === "linux" ? "Ensuring Linux build toolchain" : "Ensuring MSYS2 toolchain", async () => {
        await this.ensureMsys(toolchain);
      });

      await this.runStep("packages", process.platform === "linux" ? "Installing Linux build packages" : "Updating MSYS2 packages", async () => {
        await this.installPackages(toolchain, true);
      });

      const sourceDir = path.join(workRoot, "whisper.cpp");
      await this.runStep("source", "Fetching whisper.cpp sources", async () => {
        await this.ensureWhisperSource(sourceDir, options.force === true);
      });

      await this.runStep("configure", "Configuring CMake project", async () => {
        await this.configureWithCmake(toolchain, sourceDir);
      });

      await this.runStep("build", "Building whisper binaries", async () => {
        await this.buildBinaries(toolchain, sourceDir);
      });

      await this.runStep("copy", "Copying artifacts", async () => {
        await this.copyArtifacts(toolchain, sourceDir, binDir);
      });

      this.running = false;
      this.emitProgress({
        step: "completed",
        message: "Whisper binaries ready.",
        progress: 100,
        state: "success"
      });

      return { success: true, outputDir: binDir };
    } catch (error) {
      const err = error as Error;
      this.emitProgress({
        step: "failed",
        message: "Compilation failed.",
        progress: 100,
        state: "error",
        error: err.message
      });
      this.running = false;
      return { success: false, error: err.message };
    } finally {
      this.stopLog();
    }
  }

  /**
   * Ensure required toolchain and dependencies are installed (Windows).
   * Emits progress events similar to compile steps.
   */
  async ensureDependencies(options: CompileOptions = {}): Promise<CompileResult> {
    if (process.platform === "darwin") {
      this.emitProgress({ step: "prebuilt", message: "macOS detected — no deps to install.", progress: 100, state: "success" });
      return { success: true };
    }

    if (process.platform !== "win32" && process.platform !== "linux") {
      const msg = "Dependency installation not required on this platform.";
      this.emitProgress({ step: "dependencies", message: msg, progress: 100, state: "success" });
      return { success: true };
    }

    if (this.running) {
      this.emitConsole("[deps] Dependency workflow already running; ignoring duplicate request.");
      return { success: true };
    }

    this.running = true;

    try {
      const workRoot = await this.ensureWorkDirs();
      await this.startLog(workRoot);

      if (!options.force) {
        const existing = await this.hasExistingBinaries();
        if (existing.installed) {
          this.running = false;
          return { success: true };
        }
      }

      this.emitConsole("[deps] Starting dependency installation checks...");
      const toolchain = await this.prepareToolchain(workRoot, options.force === true);

      if (process.platform === "win32") {
        await this.runStep("git", "Ensuring Git is installed", async () => {
          const script = [
            'if (Get-Command git.exe -ErrorAction SilentlyContinue) { return }',
            'winget source update --name winget | Out-Null',
            'winget install --id Git.Git --source winget -e --accept-source-agreements --accept-package-agreements | Out-Null'
          ].join("; ");
          await this.runPowerShell(script, "Git", { quiet: true });
        });

        const hasVulkanSdk = Boolean(toolchain.vulkanSdkPath);
        if (!hasVulkanSdk) {
          await this.runStep("vulkan", "Installing Vulkan SDK", async () => {
            const script = [
              'winget source update --name winget | Out-Null',
              'winget install --id KhronosGroup.VulkanSDK --source winget -e --accept-source-agreements --accept-package-agreements'
            ].join("; ");
            await this.runPowerShell(script, "VulkanSDK", { quiet: true });
            toolchain.vulkanSdkPath = this.resolveVulkanSdkPath() ?? undefined;
          });
        } else {
          this.emitConsole("[vulkan] Vulkan SDK already installed; skipping install.");
          this.emitProgress({ step: "vulkan", message: "Vulkan SDK already installed.", progress: 100, state: "success" });
        }

        if (toolchain.vulkanSdkPath) {
          await this.runStep("vulkan-env", "Setting VULKAN_SDK environment variable", async () => {
            const script = [
              "$key = 'HKLM:\\SOFTWARE\\Khronos\\Vulkan\\RT'",
              "if (-not (Test-Path $key)) { Write-Output 'Vulkan registry key missing; skipping VULKAN_SDK.'; return }",
              "$value = Get-ItemProperty -Path $key -ErrorAction Stop",
              "if (-not $value.VulkanSDK) { Write-Output 'Vulkan registry entry missing VulkanSDK value; skipping.'; return }",
              "$env:VULKAN_SDK = $value.VulkanSDK",
              "[System.Environment]::SetEnvironmentVariable('VULKAN_SDK', $value.VulkanSDK, 'Process')",
              "Write-Output \"VULKAN_SDK set to $($value.VulkanSDK)\""
            ].join(" ; ");
            await this.runPowerShell(script, "SetVulkanEnv");
          });
        } else {
          this.emitConsole("[vulkan] Vulkan SDK not detected; skipping VULKAN_SDK environment setup.");
          this.emitProgress({ step: "vulkan-env", message: "Vulkan SDK not detected; skipping environment setup.", progress: 100, state: "success" });
        }
      } else {
        const bootstrapPending = !this.linuxBootstrapDone;
        await this.runStep("git", bootstrapPending ? "Bootstrapping Linux dependencies (one-time)" : "Ensuring Git is installed", async () => {
          await this.ensureLinuxPackages(["git"], bootstrapPending ? "LinuxDeps" : "Git");
        });

        await this.runStep("vulkan", "Ensuring Vulkan development/runtime packages", async () => {
          await this.ensureLinuxPackages(["vulkan", "glslc"], "Vulkan");
          toolchain.vulkanSdkPath = this.resolveVulkanSdkPath() ?? undefined;
        });

        await this.runStep("vulkan-env", "Detecting Vulkan runtime", async () => {
          if (this.hasCommand("vulkaninfo")) {
            this.emitConsole("[vulkan] vulkaninfo detected on PATH.");
          } else {
            this.emitConsole("[vulkan] vulkaninfo not found; Vulkan packages may still be present.");
          }
          if (!this.hasCommand("glslc")) {
            throw new Error("Vulkan toolchain is incomplete: missing glslc. Install it (Ubuntu: sudo apt-get install -y glslc or shaderc or glslang-tools).");
          }
          toolchain.vulkanSdkPath = this.resolveVulkanSdkPath() ?? undefined;
        });
      }

      this.ensureFfmpegPath(toolchain.ffmpegBin);
      const hasFfmpeg = this.isFfmpegAvailable(toolchain.ffmpegBin);
      if (!hasFfmpeg) {
        await this.runStep("ffmpeg", "Installing FFmpeg", async () => {
          if (process.platform === "win32") {
            await this.installFfmpeg(toolchain);
          } else {
            await this.ensureLinuxPackages(["ffmpeg"], "FFmpeg");
          }
          this.ensureFfmpegPath(toolchain.ffmpegBin);
          if (!this.isFfmpegAvailable(toolchain.ffmpegBin)) {
            throw new Error("FFmpeg installation did not complete successfully.");
          }
        });
      } else {
        this.emitConsole("[ffmpeg] FFmpeg already installed; skipping install.");
        this.emitProgress({ step: "ffmpeg", message: "FFmpeg already installed.", progress: 100, state: "success" });
      }

      await this.runStep("ffmpeg-env", "Ensuring FFmpeg PATH setup", async () => {
        if (process.platform === "win32") {
          await this.ensureFfmpegUserPath(toolchain.ffmpegBin);
        }
        this.ensureFfmpegPath(toolchain.ffmpegBin);
        if (!this.isFfmpegAvailable(toolchain.ffmpegBin)) {
          throw new Error("FFmpeg not available on PATH after setup.");
        }
      });

      await this.runStep("msys", process.platform === "linux" ? "Ensuring Linux build toolchain" : "Ensuring MSYS2 toolchain", async () => {
        await this.ensureMsys(toolchain, true);
      });

      await this.runStep("packages", "Installing required toolchain packages", async () => {
        await this.installPackages(toolchain, true);
      });

      this.emitConsole("[deps] Dependency installation sequence completed.");
      this.running = false;
      this.emitProgress({ step: "dependencies", message: "Dependencies installed.", progress: 100, state: "success" });
      return { success: true };
    } catch (error) {
      const err = error as Error;
      this.emitProgress({ step: "dependencies", message: "Failed to install dependencies.", progress: 100, state: "error", error: err.message });
      this.running = false;
      return { success: false, error: err.message };
    } finally {
      this.stopLog();
    }
  }

  async hasExistingBinaries(): Promise<{ installed: boolean; outputDir?: string }> {
    const workRoot = await this.ensureWorkDirs();
    const binDir = path.join(workRoot, "bin");
    const installed = this.hasBinariesInDir(binDir);

    if (installed) {
      return { installed: true, outputDir: binDir };
    }

    if (process.platform === "darwin") {
      const bundleDir = this.resolveMacBundleDir();
      return bundleDir ? { installed: true, outputDir: bundleDir } : { installed: false };
    }

    return { installed: false };
  }

  private async runStep(step: string, message: string, action: () => Promise<void>): Promise<void> {
    this.emitProgress({ step, message, progress: 0, state: "running" });
    this.emitConsole(`[${step}] ${message}`);
    await action();
    this.emitProgress({ step, message, progress: 100, state: "success" });
  }

  private emitProgress(event: CompileProgressEvent): void {
    this.emit("progress", event);
  }

  private emitConsole(message: string): void {
    this.emit("console", { source: "compile", message });
  }

  private async startLog(workRoot: string): Promise<void> {
    const logPath = path.join(workRoot, "log.txt");
    await fsp.rm(logPath, { force: true });
    this.logStream = fs.createWriteStream(logPath, { flags: "w" });
  }

  private stopLog(): void {
    if (this.logStream) {
      this.logStream.end();
      this.logStream = undefined;
    }
  }

  private writeLog(data: string | Buffer): void {
    if (this.logStream) {
      this.logStream.write(data);
    }
  }

  private async ensureWorkDirs(): Promise<string> {
    const root = path.join(app.getPath("userData"), WORK_ROOT_NAME);
    await fsp.mkdir(root, { recursive: true });
    return root;
  }

  private resolveVulkanSdkPath(): string | null {
    const envPath = process.env.VULKAN_SDK;
    if (envPath && fs.existsSync(envPath)) {
      return envPath;
    }

    if (process.platform === "linux") {
      try {
        if (this.hasCommand("pkg-config")) {
          const pkgConfig = spawnSync("pkg-config", ["--exists", "vulkan"], { stdio: "ignore" });
          if (pkgConfig.status === 0) {
            return "/usr";
          }
        }
      } catch {
        // Ignore pkg-config probe failures.
      }

      if (fs.existsSync("/usr/include/vulkan/vulkan.h")) {
        return "/usr";
      }

      return null;
    }

    if (process.platform !== "win32") {
      return null;
    }

    try {
      const reg = spawnSync("reg", ["query", "HKLM\\SOFTWARE\\Khronos\\Vulkan\\RT", "/v", "VulkanSDK"], { encoding: "utf8" });
      if (reg.status === 0 && reg.stdout) {
        const line = reg.stdout
          .split(/\r?\n/)
          .map((value) => value.trim())
          .find((value) => value.startsWith("VulkanSDK"));
        if (line) {
          const parts = line.split(/\s{2,}|\t+/).filter(Boolean);
          const candidate = parts[parts.length - 1];
          if (candidate && fs.existsSync(candidate)) {
            return candidate;
          }
        }
      }
    } catch {
      // Ignore registry lookup failures.
    }

    const defaultRoot = "C:/VulkanSDK";
    if (fs.existsSync(defaultRoot)) {
      try {
        const entries = fs.readdirSync(defaultRoot, { withFileTypes: true })
          .filter((dirent) => dirent.isDirectory())
          .map((dirent) => dirent.name)
          .sort((a, b) => b.localeCompare(a, undefined, { numeric: true, sensitivity: "base" }));
        for (const entry of entries) {
          const candidate = path.join(defaultRoot, entry);
          if (fs.existsSync(candidate)) {
            return candidate;
          }
        }
      } catch {
        // Ignore filesystem enumeration failures.
      }
    }

    return null;
  }

  private getFfmpegPaths(toolchainRoot?: string): { root: string; bin: string } {
    const baseToolchainRoot = toolchainRoot ?? path.join(app.getPath("userData"), WORK_ROOT_NAME, TOOLCHAIN_DIR_NAME);
    const root = path.join(baseToolchainRoot, FFMPEG_DIR_NAME);
    return { root, bin: path.join(root, "bin") };
  }

  private isFfmpegAvailable(binDir?: string): boolean {
    const target = binDir ?? this.getFfmpegPaths().bin;
    this.ensureFfmpegPath(target);
    const executable = path.join(target, process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg");
    try {
      if (fs.existsSync(executable)) {
        const result = spawnSync(executable, ["-version"], { stdio: "ignore" });
        if (result.status === 0) {
          return true;
        }
      }
    } catch {
      // fall back to PATH lookup below
    }

    try {
      const result = spawnSync("ffmpeg", ["-version"], { stdio: "ignore" });
      return result.status === 0;
    } catch {
      return false;
    }
  }

  private ensureFfmpegPath(binDir?: string): void {
    const target = binDir ?? this.getFfmpegPaths().bin;
    if (!target) {
      return;
    }
    if (!fs.existsSync(target)) {
      return;
    }
    if (this.isDirectoryOnPath(target)) {
      return;
    }
    const currentPath = process.env.PATH ?? "";
    process.env.PATH = `${target}${path.delimiter}${currentPath}`;
  }

  private isDirectoryOnPath(dir: string): boolean {
    const currentPath = process.env.PATH ?? "";
    const normalized = path.resolve(dir).toLowerCase();
    return currentPath
      .split(path.delimiter)
      .some((entry) => entry && path.resolve(entry).toLowerCase() === normalized);
  }

  private async ensureFfmpegUserPath(binDir?: string): Promise<void> {
    if (process.platform !== "win32") {
      return;
    }

    const targetDir = binDir ?? this.getFfmpegPaths().bin;
    if (!fs.existsSync(targetDir)) {
      return;
    }

    const script = [
      `$target = '${this.toPosixPath(targetDir)}'`,
      "if (-not (Test-Path $target)) { return }",
      "$userPath = [Environment]::GetEnvironmentVariable('Path','User')",
      "if ($null -eq $userPath) { $userPath = '' }",
      "$parts = @()",
      "if ($userPath) {",
      "  $parts = $userPath -split ';' | Where-Object { $_ -and $_.Trim().Length -gt 0 } | ForEach-Object { $_.Trim() }",
      "}",
      "if ($parts -notcontains $target) {",
      "  $updated = if ($parts.Count -gt 0) { ($parts + $target) -join ';' } else { $target };",
      "  [Environment]::SetEnvironmentVariable('Path', $updated, 'User');",
      "}"
    ].join(" ; ");

    await this.runPowerShell(script, "FFmpegPath", { quiet: true });
  }

  private async prepareToolchain(workRoot: string, force: boolean): Promise<ToolchainContext> {
    const toolchainRoot = path.join(workRoot, TOOLCHAIN_DIR_NAME);
    const downloadsDir = path.join(workRoot, DOWNLOADS_DIR_NAME);

    if (force) {
      await fsp.rm(toolchainRoot, { recursive: true, force: true });
    }

    await fsp.mkdir(toolchainRoot, { recursive: true });
    await fsp.mkdir(downloadsDir, { recursive: true });

    if (process.platform === "linux") {
      const ffmpegRoot = path.join(toolchainRoot, FFMPEG_DIR_NAME);
      const ffmpegBin = path.join(ffmpegRoot, "bin");
      const env: NodeJS.ProcessEnv = {
        ...process.env
      };
      const vulkanSdkPathResolved = this.resolveVulkanSdkPath() ?? undefined;

      if (fs.existsSync(ffmpegBin) && !this.isDirectoryOnPath(ffmpegBin)) {
        env.PATH = `${ffmpegBin}${path.delimiter}${env.PATH ?? ""}`;
      }

      if (vulkanSdkPathResolved) {
        env.VULKAN_SDK = vulkanSdkPathResolved;
      }

      return {
        workRoot,
        toolchainRoot,
        downloadsDir,
        ffmpegRoot,
        ffmpegBin,
        msysRoot: "",
        mingwBin: "",
        usrBin: "",
        cmakePath: "cmake",
        bashPath: "bash",
        gccPath: "gcc",
        gxxPath: "g++",
        arPath: "ar",
        ranlibPath: "ranlib",
        sdl2CMakeDir: "",
        vulkanSdkPath: vulkanSdkPathResolved,
        env
      };
    }

    const msysRoot = path.join(toolchainRoot, "msys64");
    const mingwBin = path.join(msysRoot, "mingw64", "bin");
    const usrBin = path.join(msysRoot, "usr", "bin");
    const ffmpegRoot = path.join(toolchainRoot, FFMPEG_DIR_NAME);
    const ffmpegBin = path.join(ffmpegRoot, "bin");

    const originalPath = process.env.PATH ?? "";
    const filteredEntries = originalPath
      .split(path.delimiter)
      .filter((entry) => entry && !entry.toLowerCase().includes("\\miniconda3\\library\\mingw-w64\\bin"));

    const normalizedMingw = mingwBin.replace(/\\/g, "/").toLowerCase();
    const normalizedUsr = usrBin.replace(/\\/g, "/").toLowerCase();
    const sanitizedEntries = filteredEntries.filter((entry) => {
      const normalized = entry.replace(/\\/g, "/").toLowerCase();
      return normalized !== normalizedMingw && normalized !== normalizedUsr;
    });

    const pathEntries = [mingwBin, usrBin];
    if (fs.existsSync(ffmpegBin)) {
      pathEntries.unshift(ffmpegBin);
    }
    const vulkanSdkPathResolved = this.resolveVulkanSdkPath() ?? undefined;
    if (vulkanSdkPathResolved) {
      pathEntries.unshift(path.join(vulkanSdkPathResolved, "Bin"));
      pathEntries.push(path.join(vulkanSdkPathResolved, "Bin32"));
    }
    pathEntries.push(...sanitizedEntries.filter(Boolean));
    const uniqueEntries = Array.from(new Set(pathEntries.filter(Boolean)));
    const envPath = uniqueEntries.join(path.delimiter);

    const gccPath = path.join(mingwBin, "gcc.exe");
    const gxxPath = path.join(mingwBin, "g++.exe");
    const preferredAr = path.join(mingwBin, "gcc-ar.exe");
    const preferredRanlib = path.join(mingwBin, "gcc-ranlib.exe");
    const fallbackAr = path.join(mingwBin, "ar.exe");
    const fallbackRanlib = path.join(mingwBin, "ranlib.exe");
    const arPath = fs.existsSync(preferredAr) ? preferredAr : fallbackAr;
    const ranlibPath = fs.existsSync(preferredRanlib) ? preferredRanlib : fallbackRanlib;

    const env: NodeJS.ProcessEnv = {
      ...process.env,
      PATH: envPath,
      CC: gccPath,
      CXX: gxxPath,
      AR: arPath,
      RANLIB: ranlibPath,
      MSYSTEM: "MINGW64",
      CHERE_INVOKING: "1"
    };

    if (vulkanSdkPathResolved) {
      env.VULKAN_SDK = vulkanSdkPathResolved;
    }
    if (fs.existsSync(ffmpegBin)) {
      env.FFMPEG_BIN = ffmpegBin;
    }

    return {
      workRoot,
      toolchainRoot,
      downloadsDir,
      ffmpegRoot,
      ffmpegBin,
      msysRoot,
      mingwBin,
      usrBin,
      cmakePath: path.join(mingwBin, "cmake.exe"),
      bashPath: path.join(usrBin, "bash.exe"),
      gccPath,
      gxxPath,
      arPath,
      ranlibPath,
      sdl2CMakeDir: path.join(msysRoot, "mingw64", "lib", "cmake", "SDL2"),
      vulkanSdkPath: vulkanSdkPathResolved,
      env
    };
  }

  private toPosixPath(value: string): string {
    return value.replace(/\\/g, "/");
  }

  private async ensureMsys(context: ToolchainContext, quiet = false): Promise<void> {
    if (process.platform === "linux") {
      if (this.hasCommand("cmake") && this.hasCommand("ninja") && this.hasCommand("gcc") && this.hasCommand("g++")) {
        return;
      }
      await this.ensureLinuxPackages(["build"], "BuildTools", quiet);
      return;
    }

    if (fs.existsSync(context.cmakePath)) {
      return;
    }

    const script = [
      `$toolchainRoot = '${this.toPosixPath(context.toolchainRoot)}'`,
      `$downloads = '${this.toPosixPath(context.downloadsDir)}'`,
      "$msysRoot = Join-Path $toolchainRoot 'msys64'",
      "New-Item -ItemType Directory -Path $toolchainRoot -Force | Out-Null",
      "New-Item -ItemType Directory -Path $downloads -Force | Out-Null",
      "if (Test-Path $msysRoot) { Remove-Item $msysRoot -Recurse -Force }",
      "$msysUrl = 'https://github.com/msys2/msys2-installer/releases/latest/download/msys2-base-x86_64-latest.sfx.exe'",
      "$msysTmp = Join-Path $downloads 'msys2-installer.exe'",
      "if (Test-Path $msysTmp) { Remove-Item $msysTmp -Force }",
      "Invoke-WebRequest -Uri $msysUrl -OutFile $msysTmp -UseBasicParsing",
      "$args = @('-y', \"-o`\"$toolchainRoot`\"\")",
      "Start-Process -FilePath $msysTmp -ArgumentList $args -Wait -NoNewWindow",
      "Remove-Item $msysTmp -Force",
      "if (-not (Test-Path (Join-Path $msysRoot 'usr\\bin\\bash.exe'))) { throw 'MSYS2 extraction failed.' }"
    ].join("; ");

    await this.runPowerShell(script, "Install MSYS2", { quiet });
  }

  private async installFfmpeg(toolchain: ToolchainContext): Promise<void> {
    const { root, bin } = this.getFfmpegPaths(toolchain.toolchainRoot);
    const zipPath = path.join(toolchain.downloadsDir, "ffmpeg.zip");
    const extractDir = path.join(toolchain.downloadsDir, "ffmpeg-extract");

    await fsp.rm(root, { recursive: true, force: true });
    await fsp.rm(extractDir, { recursive: true, force: true });
    await fsp.rm(zipPath, { force: true });

    await fsp.mkdir(path.dirname(zipPath), { recursive: true });
    await this.downloadArchive(FFMPEG_DOWNLOAD_URL, zipPath, "ffmpeg");

    const script = [
      `$zip = '${this.toPosixPath(zipPath)}'`,
      `$extract = '${this.toPosixPath(extractDir)}'`,
      `$dest = '${this.toPosixPath(root)}'`,
      "if (Test-Path $extract) { Remove-Item $extract -Recurse -Force }",
      "if (Test-Path $dest) { Remove-Item $dest -Recurse -Force }",
      "if (-not (Test-Path $zip)) { throw 'FFmpeg download failed: archive missing.' }",
      "Expand-Archive -LiteralPath $zip -DestinationPath $extract -Force",
      "$candidate = Get-ChildItem $extract -Directory | Sort-Object LastWriteTime -Descending | Select-Object -First 1",
      "if ($null -eq $candidate) { throw 'FFmpeg archive missing expected directory.' }",
      "New-Item -ItemType Directory -Path (Split-Path $dest -Parent) -Force | Out-Null",
      "Move-Item -Path $candidate.FullName -Destination $dest",
      "Remove-Item $zip -Force",
      "Remove-Item $extract -Recurse -Force"
    ].join("; ");

    await this.runPowerShell(script, "FFmpegDownload", { quiet: true });

    const ffmpegExe = path.join(bin, "ffmpeg.exe");
    if (!fs.existsSync(ffmpegExe)) {
      throw new Error("FFmpeg binary not found after extraction.");
    }

    this.ensureFfmpegPath(bin);
  }

  private async downloadArchive(url: string, destination: string, label: string, redirectDepth = 0): Promise<void> {
    if (redirectDepth > 5) {
      throw new Error(`Too many redirects while downloading ${label}.`);
    }

    const tempPath = `${destination}.download`;
    await fsp.rm(tempPath, { force: true });

    await new Promise<void>((resolve, reject) => {
      https
        .get(url, (response) => {
          const status = response.statusCode ?? 0;

          if (status >= 300 && status < 400 && response.headers.location) {
            response.resume();
            this.downloadArchive(response.headers.location, destination, label, redirectDepth + 1)
              .then(resolve)
              .catch(reject);
            return;
          }

          if (status >= 400) {
            response.resume();
            reject(new Error(`Failed to download ${label}: ${status}`));
            return;
          }

          this.emitConsole(`[${label}] Downloading...`);

          const fileStream = fs.createWriteStream(tempPath);

          pipeline(response, fileStream)
            .then(async () => {
              await fsp.rename(tempPath, destination);
              this.emitConsole(`[${label}] Download complete.`);
              resolve();
            })
            .catch((error) => reject(error));
        })
        .on("error", (error) => reject(error));
    });
  }

  private async installPackages(context: ToolchainContext, quiet = false): Promise<void> {
    if (process.platform === "linux") {
      await this.ensureLinuxPackages(["build", "sdl"], "LinuxPackages", quiet);
      return;
    }

    if (!fs.existsSync(context.bashPath)) {
      throw new Error(`MSYS2 bash not found at ${context.bashPath}`);
    }

    const command = "pacman -Sy --noconfirm && pacman -S --needed --noconfirm mingw-w64-x86_64-toolchain base-devel mingw-w64-x86_64-cmake mingw-w64-x86_64-SDL2 ninja";
    await this.spawnWithLogs(context.bashPath, ["--login", "-c", command], undefined, context.env, { quiet });
  }

  private async ensureWhisperSource(sourceDir: string, force: boolean): Promise<void> {
    if (!force && fs.existsSync(path.join(sourceDir, "CMakeLists.txt"))) {
      return;
    }

    await fsp.rm(sourceDir, { recursive: true, force: true });

    if (process.platform === "linux") {
      await this.spawnWithLogs("git", ["clone", "--depth", "1", "https://github.com/ggerganov/whisper.cpp.git", sourceDir], "Fetch whisper.cpp", undefined, { quiet: true });
      return;
    }

    const script = [
      `$dest = '${sourceDir.replace(/\\/g, "/")}'`,
      "$destParent = Split-Path -Path $dest -Parent",
      "$zip = Join-Path $env:TEMP 'whisper.cpp.zip'",
      "$temp = Join-Path $env:TEMP 'whisper-src'",
      "if (Test-Path $zip) { Remove-Item $zip -Force }",
      "if (Test-Path $temp) { Remove-Item $temp -Recurse -Force }",
      "$url = 'https://github.com/ggerganov/whisper.cpp/archive/refs/heads/master.zip'",
      "Invoke-WebRequest -Uri $url -OutFile $zip -UseBasicParsing",
      "Expand-Archive -LiteralPath $zip -DestinationPath $temp -Force",
      "$extracted = Get-ChildItem -Path $temp | Where-Object { $_.PSIsContainer } | Select-Object -First 1",
      "if ($null -eq $extracted) { throw 'whisper.cpp archive missing root folder' }",
      "New-Item -ItemType Directory -Path $destParent -Force | Out-Null",
      "Move-Item -Path $extracted.FullName -Destination $dest",
      "Remove-Item $zip -Force",
      "Remove-Item $temp -Recurse -Force"
    ].join("; ");

    await this.runPowerShell(script, "Fetch whisper.cpp");
  }

  private async configureWithCmake(context: ToolchainContext, sourceDir: string): Promise<void> {
    const buildDir = path.join(sourceDir, "build");
    await fsp.rm(buildDir, { recursive: true, force: true });
    await fsp.mkdir(buildDir, { recursive: true });

    const enableVulkan = Boolean(context.vulkanSdkPath);

    if (process.platform === "linux") {
      if (!this.hasCommand("glslc")) {
        throw new Error("Vulkan backend requested but glslc was not found on PATH.");
      }

      const args = [
        "-S",
        sourceDir,
        "-B",
        buildDir,
        "-G",
        "Ninja",
        enableVulkan ? "-DGGML_VULKAN=1" : "-DGGML_VULKAN=0",
        "-DWHISPER_SDL2=ON",
        "-DWHISPER_BUILD_EXAMPLES=ON",
        "-DCMAKE_BUILD_TYPE=Release",
        "-DGGML_CCACHE=OFF"
      ];

      if (!enableVulkan) {
        this.emitConsole("[compile] Vulkan SDK not detected; building without Vulkan backend.");
      }

      await this.spawnWithLogs("cmake", args, undefined, context.env, { quiet: true });
      return;
    }

    const args = [
      "-S",
      sourceDir,
      "-B",
      buildDir,
      "-G",
      "Ninja",
      enableVulkan ? "-DGGML_VULKAN=1" : "-DGGML_VULKAN=0",
      "-DWHISPER_SDL2=ON",
      "-DWHISPER_BUILD_EXAMPLES=ON",
      `-DSDL2_DIR=${this.toPosixPath(context.sdl2CMakeDir)}`,
      "-DCMAKE_BUILD_TYPE=Release",
      `-DCMAKE_C_COMPILER=${this.toPosixPath(context.gccPath)}`,
      `-DCMAKE_CXX_COMPILER=${this.toPosixPath(context.gxxPath)}`,
      `-DCMAKE_AR=${this.toPosixPath(context.arPath)}`,
      `-DCMAKE_RANLIB=${this.toPosixPath(context.ranlibPath)}`,
      "-DCMAKE_C_ARCHIVE_CREATE=<CMAKE_AR> crs <TARGET> <LINK_FLAGS> <OBJECTS>",
      "-DCMAKE_CXX_ARCHIVE_CREATE=<CMAKE_AR> crs <TARGET> <LINK_FLAGS> <OBJECTS>",
      "-DCMAKE_C_ARCHIVE_FINISH=<CMAKE_RANLIB> <TARGET>",
      "-DCMAKE_CXX_ARCHIVE_FINISH=<CMAKE_RANLIB> <TARGET>",
      "-DGGML_CCACHE=OFF"
    ];

    if (!fs.existsSync(context.cmakePath)) {
      throw new Error(`CMake not found at ${context.cmakePath}`);
    }

    if (!fs.existsSync(context.sdl2CMakeDir)) {
      throw new Error(`SDL2 CMake directory not found at ${context.sdl2CMakeDir}`);
    }

    if (!enableVulkan) {
      this.emitConsole("[compile] Vulkan SDK not detected; building without Vulkan backend.");
    }

    await this.spawnWithLogs(context.cmakePath, args, undefined, context.env, { quiet: true });
  }

  private async buildBinaries(context: ToolchainContext, sourceDir: string): Promise<void> {
    const buildDir = path.join(sourceDir, "build");
    const args = [
      "--build",
      buildDir,
      "--target",
      "whisper-cli",
      "whisper-stream",
      "--config",
      "Release",
      "-j",
      String(Math.max(1, os.cpus().length - 1))
    ];

    await this.spawnWithLogs(process.platform === "linux" ? "cmake" : context.cmakePath, args, undefined, context.env, { quiet: true });
  }

  private async copyArtifacts(context: ToolchainContext, sourceDir: string, binDir: string): Promise<void> {
    const buildBinDir = path.join(sourceDir, "build", "bin");

    if (process.platform === "linux") {
      for (const target of LINUX_BINARY_TARGETS) {
        const sourcePath = path.join(buildBinDir, target);
        const destinationPath = path.join(binDir, target);
        await fsp.copyFile(sourcePath, destinationPath);
        await fsp.chmod(destinationPath, 0o755);
      }
      return;
    }

    for (const target of WINDOWS_BINARY_TARGETS) {
      await fsp.copyFile(path.join(buildBinDir, target), path.join(binDir, target));
    }

    for (const dll of REQUIRED_DLLS) {
      const sourcePath = path.join(context.mingwBin, dll);
      await fsp.copyFile(sourcePath, path.join(binDir, dll));
    }
  }

  private async runPowerShell(script: string, label: string, options: { quiet?: boolean } = {}): Promise<void> {
    const args = [
      "-NoLogo",
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-Command",
      script
    ];

    await this.spawnWithLogs("powershell.exe", args, label, undefined, options);
  }

  private async spawnWithLogs(
    command: string,
    args: string[],
    label?: string,
    env?: NodeJS.ProcessEnv,
    options: { quiet?: boolean } = {}
  ): Promise<void> {
    const quiet = options.quiet === true;
    const stdio: Array<"ignore" | "pipe"> = ["ignore", "pipe", "pipe"];

    const commandLine = `${command} ${args.join(" ")}`.trim();
    this.writeLog(`$ ${commandLine}\n`);

    await new Promise<void>((resolve, reject) => {
      const child = spawn(command, args, {
        stdio,
        env: env ?? process.env
      });

      let stdoutBuffer = "";
      let stderrBuffer = "";

      const flushBuffer = (buffer: string): string => {
        const lines = buffer.split(/\r?\n/);
        const trailing = lines.pop() ?? "";
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) {
            continue;
          }
          if (!quiet) {
            const prefix = label ?? command;
            this.emitConsole(`[${prefix}] ${trimmed}`);
          }
        }
        return trailing;
      };

      if (child.stdout) {
        child.stdout.on("data", (data) => {
          this.writeLog(data);
          stdoutBuffer += data.toString();
          if (quiet) {
            return;
          }
          stdoutBuffer = flushBuffer(stdoutBuffer);
        });
      }

      if (child.stderr) {
        child.stderr.on("data", (data) => {
          this.writeLog(data);
          stderrBuffer += data.toString();
          if (quiet) {
            return;
          }
          stderrBuffer = flushBuffer(stderrBuffer);
        });
      }

      child.once("error", (error) => {
        reject(error);
      });

      child.once("close", (code) => {
        if (stdoutBuffer) {
          this.writeLog(stdoutBuffer);
        }
        if (stderrBuffer) {
          this.writeLog(stderrBuffer);
        }
        if (!quiet) {
          const prefix = label ?? command;
          if (stdoutBuffer.trim()) {
            this.emitConsole(`[${prefix}] ${stdoutBuffer.trim()}`);
          }
          if (stderrBuffer.trim()) {
            this.emitConsole(`[${prefix}] ${stderrBuffer.trim()}`);
          }
        }

        if (code === 0) {
          this.writeLog("\n");
          resolve();
        } else {
          const prefix = label ?? command;
          const details = `${stdoutBuffer}${stderrBuffer}`.trim();
          if (quiet) {
            if (details) {
              this.emitConsole(`[${prefix}] ${details}`);
            }
            this.emitConsole(`[${prefix}] ${command} exited with code ${code}`);
          }
          this.writeLog(`\n${command} exited with code ${code}\n`);
          reject(new Error(`${command} exited with code ${code}`));
        }
      });
    });
  }

  private hasBinariesInDir(binDir: string): boolean {
    if (!fs.existsSync(binDir)) {
      return false;
    }

    if (process.platform === "win32") {
      return WINDOWS_BINARY_TARGETS.every((exe) => fs.existsSync(path.join(binDir, exe)));
    }

    if (process.platform === "darwin") {
      try {
        return fs.readdirSync(binDir).length > 0;
      } catch {
        return false;
      }
    }

    if (process.platform === "linux") {
      return LINUX_BINARY_TARGETS.every((bin) => fs.existsSync(path.join(binDir, bin)));
    }

    return false;
  }

  private hasCommand(command: string): boolean {
    try {
      const check = spawnSync("sh", ["-lc", `command -v ${command}`], { stdio: "ignore" });
      return check.status === 0;
    } catch {
      return false;
    }
  }

  private detectLinuxPackageManager(): LinuxPackageManager | null {
    if (this.hasCommand("apt-get")) {
      return "apt";
    }
    if (this.hasCommand("dnf")) {
      return "dnf";
    }
    if (this.hasCommand("yum")) {
      return "yum";
    }
    if (this.hasCommand("zypper")) {
      return "zypper";
    }
    if (this.hasCommand("pacman")) {
      return "pacman";
    }
    return null;
  }

  private linuxInstallCommand(manager: LinuxPackageManager, group: "git" | "ffmpeg" | "vulkan" | "build" | "sdl" | "glslc"): string {
    const packages: Record<LinuxPackageManager, Record<"git" | "ffmpeg" | "vulkan" | "build" | "sdl", string[]>> = {
      apt: {
        git: ["git"],
        ffmpeg: ["ffmpeg"],
        vulkan: ["libvulkan-dev", "vulkan-tools"],
        build: ["build-essential", "cmake", "ninja-build", "pkg-config", "curl"],
        sdl: ["libsdl2-dev"]
      },
      dnf: {
        git: ["git"],
        ffmpeg: ["ffmpeg"],
        vulkan: ["vulkan-loader-devel", "vulkan-tools"],
        build: ["gcc", "gcc-c++", "make", "cmake", "ninja-build", "pkgconf-pkg-config", "curl"],
        sdl: ["SDL2-devel"]
      },
      yum: {
        git: ["git"],
        ffmpeg: ["ffmpeg"],
        vulkan: ["vulkan-loader-devel", "vulkan-tools"],
        build: ["gcc", "gcc-c++", "make", "cmake", "ninja-build", "pkgconfig", "curl"],
        sdl: ["SDL2-devel"]
      },
      zypper: {
        git: ["git"],
        ffmpeg: ["ffmpeg"],
        vulkan: ["vulkan-devel", "vulkan-tools"],
        build: ["gcc", "gcc-c++", "make", "cmake", "ninja", "pkg-config", "curl"],
        sdl: ["libSDL2-devel"]
      },
      pacman: {
        git: ["git"],
        ffmpeg: ["ffmpeg"],
        vulkan: ["vulkan-headers", "vulkan-tools"],
        build: ["base-devel", "cmake", "ninja", "pkgconf", "curl"],
        sdl: ["sdl2"]
      }
    };

    if (group === "glslc") {
      if (manager === "apt") {
        return "if command -v glslc >/dev/null 2>&1; then true; else DEBIAN_FRONTEND=noninteractive apt-get install -y glslc || DEBIAN_FRONTEND=noninteractive apt-get install -y shaderc || DEBIAN_FRONTEND=noninteractive apt-get install -y glslang-tools; fi";
      }
      if (manager === "dnf") {
        return "(dnf install -y shaderc || dnf install -y glslang)";
      }
      if (manager === "yum") {
        return "(yum install -y shaderc || yum install -y glslang)";
      }
      if (manager === "zypper") {
        return "(zypper --non-interactive install --no-recommends shaderc || zypper --non-interactive install --no-recommends glslang)";
      }
      return "pacman -Sy --noconfirm --needed shaderc";
    }

    const selected = packages[manager][group];

    if (manager === "apt") {
      return `DEBIAN_FRONTEND=noninteractive apt-get install -y ${selected.join(" ")}`;
    }
    if (manager === "dnf") {
      return `dnf install -y ${selected.join(" ")}`;
    }
    if (manager === "yum") {
      return `yum install -y ${selected.join(" ")}`;
    }
    if (manager === "zypper") {
      return `zypper --non-interactive install --no-recommends ${selected.join(" ")}`;
    }

    return `pacman -Sy --noconfirm --needed ${selected.join(" ")}`;
  }

  private async runLinuxInstall(command: string, label: string, quiet = false): Promise<void> {
    if (process.getuid && process.getuid() === 0) {
      await this.spawnWithLogs("sh", ["-lc", command], label, undefined, { quiet });
      return;
    }

    if (this.hasCommand("sudo")) {
      try {
        await this.spawnWithLogs("sudo", ["-n", "sh", "-lc", command], label, undefined, { quiet });
        return;
      } catch {
        // Fall through to pkexec/manual path.
      }
    }

    if (this.hasCommand("pkexec")) {
      try {
        await this.spawnWithLogs("pkexec", ["sh", "-lc", command], label, undefined, { quiet });
        return;
      } catch {
        // Fall through to manual guidance.
      }
    }

    throw new Error(`Automatic installation requires root privileges. Please run manually as root: sh -lc \"${command}\"`);
  }

  private async ensureLinuxPackages(groups: Array<"git" | "ffmpeg" | "vulkan" | "build" | "sdl" | "glslc">, label: string, quiet = false): Promise<void> {
    if (process.platform !== "linux") {
      return;
    }

    const bootstrapGroups: Array<"git" | "ffmpeg" | "vulkan" | "build" | "sdl" | "glslc"> = ["git", "vulkan", "glslc", "ffmpeg", "build", "sdl"];
    const selectedGroups = this.linuxBootstrapDone ? Array.from(new Set(groups)) : bootstrapGroups;
    const missingGroups = selectedGroups.filter((group) => !this.isLinuxDependencyGroupSatisfied(group));
    if (missingGroups.length === 0) {
      this.emitConsole(`[${label}] Linux dependencies already satisfied; skipping install.`);
      this.linuxBootstrapDone = true;
      return;
    }

    const manager = this.detectLinuxPackageManager();
    if (!manager) {
      throw new Error("No supported Linux package manager detected (apt, dnf, yum, zypper, pacman).");
    }

    const commands: string[] = [];

    if (manager === "apt" && !this.linuxAptUpdated) {
      commands.push("apt-get update");
    }

    for (const group of missingGroups) {
      commands.push(this.linuxInstallCommand(manager, group));
    }

    const groupList = missingGroups.join(", ");
    if (!this.linuxBootstrapDone) {
      this.emitConsole(`[${label}] One-time Linux dependency bootstrap: ${groupList}`);
    } else {
      this.emitConsole(`[${label}] Installing missing Linux dependency groups: ${groupList}`);
    }

    await this.runLinuxInstall(commands.join(" && "), label, quiet);

    if (manager === "apt") {
      this.linuxAptUpdated = true;
    }
    this.linuxBootstrapDone = true;
  }

  private isLinuxDependencyGroupSatisfied(group: "git" | "ffmpeg" | "vulkan" | "build" | "sdl" | "glslc"): boolean {
    if (process.platform !== "linux") {
      return true;
    }

    if (group === "git") {
      return this.hasCommand("git");
    }

    if (group === "ffmpeg") {
      return this.hasCommand("ffmpeg");
    }

    if (group === "glslc") {
      return this.hasCommand("glslc");
    }

    if (group === "build") {
      return this.hasCommand("cmake") && this.hasCommand("ninja") && this.hasCommand("gcc") && this.hasCommand("g++");
    }

    if (group === "sdl") {
      if (!this.hasCommand("pkg-config")) {
        return false;
      }
      try {
        const check = spawnSync("pkg-config", ["--exists", "sdl2"], { stdio: "ignore" });
        return check.status === 0;
      } catch {
        return false;
      }
    }

    const hasHeaders = fs.existsSync("/usr/include/vulkan/vulkan.h");
    const hasRuntime = this.hasCommand("vulkaninfo");
    return hasHeaders && hasRuntime;
  }

  private async stagePrebuiltMacBinaries(force: boolean): Promise<CompileResult> {
    const workRoot = await this.ensureWorkDirs();
    const binDir = path.join(workRoot, "bin");

    const sourceDir = this.resolveMacBundleDir();
    if (!sourceDir) {
      throw new Error("Prebuilt macOS binaries are not bundled with the application.");
    }

    // Always refresh on macOS to avoid stale shared builds lingering in userData.
    await fsp.rm(binDir, { recursive: true, force: true });
    await fsp.mkdir(binDir, { recursive: true });
    await fsp.cp(sourceDir, binDir, { recursive: true, force: true });

    this.emitProgress({
      step: "prebuilt",
      message: "Prebuilt macOS binaries staged.",
      progress: 100,
      state: "success"
    });

    return { success: true, outputDir: binDir };
  }

  private resolveMacBundleDir(): string | null {
    const candidates: string[] = [];

    if (process.resourcesPath) {
      candidates.push(path.join(process.resourcesPath, MAC_BUNDLE_DIR_NAME));
    }

    candidates.push(
      path.join(app.getAppPath(), "buildResources", MAC_BUNDLE_DIR_NAME),
      path.join(__dirname, "../../..", "buildResources", MAC_BUNDLE_DIR_NAME)
    );

    for (const candidate of candidates) {
      if (candidate && fs.existsSync(candidate)) {
        return candidate;
      }
    }

    return null;
  }
}
