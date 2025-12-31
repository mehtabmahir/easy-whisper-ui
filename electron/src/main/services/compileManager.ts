import { app } from "electron";
import { spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { CompileOptions, CompileProgressEvent, CompileResult } from "../../types/easy-whisper";

export const WORK_ROOT_NAME = "whisper-workspace";
const WINDOWS_BINARY_TARGETS = ["whisper-cli.exe", "whisper-stream.exe"];
const MAC_BUNDLE_DIR_NAME = "mac-bin";

const TOOLCHAIN_DIR_NAME = "toolchain";
const DOWNLOADS_DIR_NAME = "downloads";
const REQUIRED_DLLS = [
  "libwinpthread-1.dll",
  "libstdc++-6.dll",
  "libgcc_s_seh-1.dll",
  "SDL2.dll"
];

interface ToolchainContext {
  workRoot: string;
  toolchainRoot: string;
  downloadsDir: string;
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

    if (process.platform !== "win32") {
      return { success: false, error: "This platform is not supported for compilation." };
    }

    if (this.running) {
      return { success: false, error: "Compilation already in progress." };
    }

    this.running = true;

    const workRoot = await this.ensureWorkDirs();
    const binDir = path.join(workRoot, "bin");
    let toolchain!: ToolchainContext;
    const existingBinaries = this.hasBinariesInDir(binDir);

    if (existingBinaries && !options.force) {
      this.emitProgress({
        step: "check-cache",
        message: "Whisper binaries already built; skipping.",
        progress: 100,
        state: "success"
      });
      this.running = false;
      return { success: true, outputDir: binDir };
    }

    try {
      await this.runStep("prepare", "Preparing workspace", async () => {
        await fsp.mkdir(binDir, { recursive: true });
        toolchain = await this.prepareToolchain(workRoot, options.force === true);
      });

      await this.runStep("msys", "Ensuring MSYS2 toolchain", async () => {
        await this.ensureMsys(toolchain);
      });

      await this.runStep("packages", "Updating MSYS2 packages", async () => {
        await this.installPackages(toolchain);
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

    if (process.platform !== "win32") {
      return { installed: false };
    }

    return { installed: false };
  }

  async uninstall(): Promise<CompileResult> {
    if (this.running) {
      return { success: false, error: "Compilation already in progress." };
    }

    this.running = true;

    try {
      const workRoot = path.join(app.getPath("userData"), WORK_ROOT_NAME);
      this.emitProgress({
        step: "uninstall",
        message: "Removing Whisper workspace...",
        progress: 0,
        state: "running"
      });

      await fsp.rm(workRoot, { recursive: true, force: true });

      this.emitProgress({
        step: "uninstall",
        message: "Whisper binaries removed. Install to rebuild.",
        progress: 0,
        state: "pending"
      });
      this.emitConsole("[compile] Whisper workspace removed.");

      return { success: true };
    } catch (error) {
      const err = error as Error;
      this.emitProgress({
        step: "uninstall",
        message: "Failed to remove Whisper workspace.",
        progress: 100,
        state: "error",
        error: err.message
      });
      return { success: false, error: err.message };
    } finally {
      this.running = false;
    }
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

  private async ensureWorkDirs(): Promise<string> {
    const root = path.join(app.getPath("userData"), WORK_ROOT_NAME);
    await fsp.mkdir(root, { recursive: true });
    return root;
  }

  private async prepareToolchain(workRoot: string, force: boolean): Promise<ToolchainContext> {
    const toolchainRoot = path.join(workRoot, TOOLCHAIN_DIR_NAME);
    const downloadsDir = path.join(workRoot, DOWNLOADS_DIR_NAME);

    if (force) {
      await fsp.rm(toolchainRoot, { recursive: true, force: true });
    }

    await fsp.mkdir(toolchainRoot, { recursive: true });
    await fsp.mkdir(downloadsDir, { recursive: true });

    const msysRoot = path.join(toolchainRoot, "msys64");
    const mingwBin = path.join(msysRoot, "mingw64", "bin");
    const usrBin = path.join(msysRoot, "usr", "bin");

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

    const envPath = [mingwBin, usrBin, ...sanitizedEntries].join(path.delimiter);

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

    return {
      workRoot,
      toolchainRoot,
      downloadsDir,
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
      env
    };
  }

  private toPosixPath(value: string): string {
    return value.replace(/\\/g, "/");
  }

  private async ensureMsys(context: ToolchainContext): Promise<void> {
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

    await this.runPowerShell(script, "Install MSYS2");
  }

  private async installPackages(context: ToolchainContext): Promise<void> {
    if (!fs.existsSync(context.bashPath)) {
      throw new Error(`MSYS2 bash not found at ${context.bashPath}`);
    }

    const command = "pacman -Sy --noconfirm && pacman -S --needed --noconfirm mingw-w64-x86_64-toolchain base-devel mingw-w64-x86_64-cmake mingw-w64-x86_64-SDL2 ninja";
    await this.spawnWithLogs(context.bashPath, ["--login", "-c", command], undefined, context.env);
  }

  private async ensureWhisperSource(sourceDir: string, force: boolean): Promise<void> {
    if (!force && fs.existsSync(path.join(sourceDir, "CMakeLists.txt"))) {
      return;
    }

    await fsp.rm(sourceDir, { recursive: true, force: true });

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

    const args = [
      "-S",
      sourceDir,
      "-B",
      buildDir,
      "-G",
      "Ninja",
      "-DGGML_VULKAN=1",
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
      "-DCMAKE_CXX_ARCHIVE_FINISH=<CMAKE_RANLIB> <TARGET>"
    ];

    if (!fs.existsSync(context.cmakePath)) {
      throw new Error(`CMake not found at ${context.cmakePath}`);
    }

    if (!fs.existsSync(context.sdl2CMakeDir)) {
      throw new Error(`SDL2 CMake directory not found at ${context.sdl2CMakeDir}`);
    }

    await this.spawnWithLogs(context.cmakePath, args, undefined, context.env);
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

    await this.spawnWithLogs(context.cmakePath, args, undefined, context.env);
  }

  private async copyArtifacts(context: ToolchainContext, sourceDir: string, binDir: string): Promise<void> {
    const buildBinDir = path.join(sourceDir, "build", "bin");
    for (const target of WINDOWS_BINARY_TARGETS) {
      await fsp.copyFile(path.join(buildBinDir, target), path.join(binDir, target));
    }

    for (const dll of REQUIRED_DLLS) {
      const sourcePath = path.join(context.mingwBin, dll);
      await fsp.copyFile(sourcePath, path.join(binDir, dll));
    }
  }

  private async runPowerShell(script: string, label: string): Promise<void> {
    const args = [
      "-NoLogo",
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-Command",
      script
    ];

    await this.spawnWithLogs("powershell.exe", args, label);
  }

  private async spawnWithLogs(command: string, args: string[], label?: string, env?: NodeJS.ProcessEnv): Promise<void> {
    this.emitConsole(`Running ${command} ${args.join(" ")}`);

    await new Promise<void>((resolve, reject) => {
      const child = spawn(command, args, {
        stdio: ["ignore", "pipe", "pipe"],
        env: env ?? process.env
      });

      child.stdout.on("data", (data) => {
        const text = this.formatOutput(label, data.toString());
        if (text) {
          this.emitConsole(text);
        }
      });

      child.stderr.on("data", (data) => {
        const text = this.formatOutput(label, data.toString());
        if (text) {
          this.emitConsole(text);
        }
      });

      child.once("error", (error) => {
        reject(error);
      });

      child.once("close", (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`${command} exited with code ${code}`));
        }
      });
    });
  }

  private formatOutput(label: string | undefined, raw: string): string {
    const text = raw.toString().trim();
    if (!text) {
      return "";
    }
    return label ? `[${label}] ${text}` : text;
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

    return false;
  }

  private async stagePrebuiltMacBinaries(force: boolean): Promise<CompileResult> {
    const workRoot = await this.ensureWorkDirs();
    const binDir = path.join(workRoot, "bin");

    if (this.hasBinariesInDir(binDir) && !force) {
      this.emitProgress({
        step: "prebuilt",
        message: "Prebuilt macOS binaries already staged.",
        progress: 100,
        state: "success"
      });
      return { success: true, outputDir: binDir };
    }

    const sourceDir = this.resolveMacBundleDir();
    if (!sourceDir) {
      throw new Error("Prebuilt macOS binaries are not bundled with the application.");
    }

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
