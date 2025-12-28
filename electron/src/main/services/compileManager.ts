import { app } from "electron";
import { spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { CompileOptions, CompileProgressEvent, CompileResult } from "../../types/easy-whisper";

export const WORK_ROOT_NAME = "whisper-workspace";
const BINARY_TARGETS = ["whisper-cli.exe", "whisper-stream.exe"];

const MSYS_ROOT = "C:/msys64";
const MSYS_CMAKE = `${MSYS_ROOT}/mingw64/bin/cmake.exe`;
const SDL2_DLL = `${MSYS_ROOT}/mingw64/bin/SDL2.dll`;
const REQUIRED_DLLS = [
  "libwinpthread-1.dll",
  "libstdc++-6.dll",
  "libgcc_s_seh-1.dll",
  "SDL2.dll"
];

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
    if (process.platform !== "win32") {
      return { success: false, error: "Windows is required for on-device compilation." };
    }

    if (this.running) {
      return { success: false, error: "Compilation already in progress." };
    }

    this.running = true;

    const workRoot = await this.ensureWorkDirs();
    const binDir = path.join(workRoot, "bin");
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
      });

      await this.runStep("msys", "Ensuring MSYS2 toolchain", async () => {
        await this.ensureMsys();
      });

      await this.runStep("packages", "Updating MSYS2 packages", async () => {
        await this.installPackages();
      });

      const sourceDir = path.join(workRoot, "whisper.cpp");
      await this.runStep("source", "Fetching whisper.cpp sources", async () => {
        await this.ensureWhisperSource(sourceDir, options.force === true);
      });

      await this.runStep("configure", "Configuring CMake project", async () => {
        await this.configureWithCmake(sourceDir);
      });

      await this.runStep("build", "Building whisper binaries", async () => {
        await this.buildBinaries(sourceDir);
      });

      await this.runStep("copy", "Copying artifacts", async () => {
        await this.copyArtifacts(sourceDir, binDir);
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
    if (process.platform !== "win32") {
      return { installed: false };
    }

    const workRoot = await this.ensureWorkDirs();
    const binDir = path.join(workRoot, "bin");
    const installed = this.hasBinariesInDir(binDir);
    return installed ? { installed: true, outputDir: binDir } : { installed: false };
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

  private async ensureMsys(): Promise<void> {
    if (fs.existsSync(MSYS_CMAKE)) {
      return;
    }

    const script = [
      "$msys = 'C:/msys64'",
      "if (!(Test-Path $msys)) {",
      "  $url = 'https://github.com/msys2/msys2-installer/releases/latest/download/msys2-base-x86_64-latest.sfx.exe'",
      "  $tmp = Join-Path $env:TEMP 'msys2-installer.exe'",
      "  Invoke-WebRequest -Uri $url -OutFile $tmp -UseBasicParsing",
      "  Start-Process -FilePath $tmp -ArgumentList '-y','-oC:\\' -Wait -NoNewWindow",
      "}"
    ].join("; ");

    await this.runPowerShell(script, "Download/Install MSYS2");
  }

  private async installPackages(): Promise<void> {
    const bashPath = `${MSYS_ROOT}/usr/bin/bash.exe`;
    const command = "pacman -Sy --noconfirm && pacman -S --needed --noconfirm mingw-w64-x86_64-toolchain base-devel mingw-w64-x86_64-cmake mingw-w64-x86_64-SDL2 ninja";
    await this.spawnWithLogs(bashPath, ["--login", "-c", command]);
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

  private async configureWithCmake(sourceDir: string): Promise<void> {
    const buildDir = path.join(sourceDir, "build");
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
      "-DSDL2_DIR=C:/msys64/mingw64/lib/cmake/SDL2",
      "-DCMAKE_BUILD_TYPE=Release"
    ];

    await this.spawnWithLogs(MSYS_CMAKE, args);
  }

  private async buildBinaries(sourceDir: string): Promise<void> {
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

    await this.spawnWithLogs(MSYS_CMAKE, args);
  }

  private async copyArtifacts(sourceDir: string, binDir: string): Promise<void> {
    const buildBinDir = path.join(sourceDir, "build", "bin");
    for (const target of BINARY_TARGETS) {
      await fsp.copyFile(path.join(buildBinDir, target), path.join(binDir, target));
    }

    for (const dll of REQUIRED_DLLS) {
      await fsp.copyFile(path.join(MSYS_ROOT, "mingw64", "bin", dll), path.join(binDir, dll));
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

  private async spawnWithLogs(command: string, args: string[], label?: string): Promise<void> {
    this.emitConsole(`Running ${command} ${args.join(" ")}`);

    await new Promise<void>((resolve, reject) => {
      const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });

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
    return BINARY_TARGETS.every((exe) => fs.existsSync(path.join(binDir, exe)));
  }
}
