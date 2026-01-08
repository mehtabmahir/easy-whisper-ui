import { app, shell } from "electron";
import { spawn, ChildProcessWithoutNullStreams } from "node:child_process";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import fsp from "node:fs/promises";
import https from "node:https";
import path from "node:path";
import os from "node:os";
import { pipeline } from "node:stream/promises";
import {
  ConsoleEvent,
  ModelSettings,
  QueueState,
  TranscriptionRequest
} from "../../types/easy-whisper";
import { WORK_ROOT_NAME } from "./compileManager";
import { resolveBinary } from "./binaryResolver";

interface QueueItem {
  file: string;
  settings: ModelSettings;
}

interface TranscriptionEvents {
  console: ConsoleEvent;
  queue: QueueState;
  finished: void;
}

type EventName = keyof TranscriptionEvents;
type Listener<T extends EventName> = (payload: TranscriptionEvents[T]) => void;

const MODEL_BASE_URL = "https://huggingface.co/ggerganov/whisper.cpp/resolve/main";

export class TranscriptionManager extends EventEmitter {
  private queue: QueueItem[] = [];
  private current?: QueueItem;
  private activeProcess?: ChildProcessWithoutNullStreams;
  private processing = false;

  on<T extends EventName>(event: T, listener: Listener<T>): this {
    return super.on(event, listener as any);
  }

  once<T extends EventName>(event: T, listener: Listener<T>): this {
    return super.once(event, listener as any);
  }

  off<T extends EventName>(event: T, listener: Listener<T>): this {
    return super.off(event, listener as any);
  }

  enqueue(request: TranscriptionRequest): void {
    const entries = request.files
      .filter((file) => !!file)
      .map((file) => ({ file, settings: { ...request.settings } }));

    if (entries.length === 0) {
      return;
    }

    this.queue.push(...entries);
    this.emitQueue();

    if (!this.processing) {
      void this.processNext();
    }
  }

  async cancelAll(): Promise<void> {
    this.queue = [];
    this.emitQueue();
    await this.stopActiveProcess();
    this.processing = false;
  }

  private async processNext(): Promise<void> {
    const nextItem = this.queue.shift();
    if (!nextItem) {
      this.processing = false;
      this.current = undefined;
      this.emitQueue();
      this.emit("finished", undefined);
      return;
    }

    this.processing = true;
    this.current = nextItem;
    this.emitQueue();

    try {
      const audioPath = await this.ensureWav(nextItem.file);
      const modelPath = await this.ensureModel(nextItem.settings);
      await this.runWhisper(audioPath, modelPath, nextItem.settings);
      if (nextItem.settings.openAfterComplete) {
        const outputTxt = `${audioPath}.txt`;
        if (fs.existsSync(outputTxt)) {
          await shell.showItemInFolder(outputTxt);
        } else {
          await shell.showItemInFolder(audioPath);
        }
      }
      this.emitConsole({ source: "transcription", message: `Completed: ${path.basename(nextItem.file)}` });
    } catch (error) {
      const err = error as Error;
      this.emitConsole({ source: "transcription", message: `Error processing ${nextItem.file}: ${err.message}` });
    } finally {
      this.current = undefined;
      this.processing = false;
      this.activeProcess = undefined;
      this.emitQueue();
      await this.processNext();
    }
  }

  private async ensureWav(filePath: string): Promise<string> {
    const ext = path.extname(filePath).toLowerCase();
    if (ext === ".wav") {
      this.emitConsole({ source: "transcription", message: "Input already WAV, skipping conversion." });
      return filePath;
    }

    const parsed = path.parse(filePath);
    const target = path.join(parsed.dir, `${parsed.name}.wav`);
    const conversionLabel = path.basename(target);
    this.emitConsole({ source: "transcription", message: `Converting to WAV: ${conversionLabel}` });
    const ffmpeg = resolveBinary("ffmpeg");

    try {
      const availableCpus = Math.max(1, os.cpus().length);
      const threadCount = Math.min(8, availableCpus);
      const threadArgs = [
        "-threads",
        String(threadCount),
        "-filter_threads",
        String(threadCount),
        "-filter_complex_threads",
        String(threadCount)
      ];

      const args = [
        "-y",
        "-hide_banner",
        "-loglevel",
        "warning",
        "-progress",
        "pipe:2",
        "-nostats",
        ...threadArgs,
        "-i",
        filePath,
        "-vn",
        "-sn",
        "-dn",
        "-map_metadata",
        "-1",
        "-ac",
        "1",
        "-ar",
        "44100",
        "-c:a",
        "pcm_s16le",
        target
      ];

      const started = Date.now();
      await this.spawnWithLogs(ffmpeg.command, args);
      const elapsed = ((Date.now() - started) / 1000).toFixed(1);
      this.emitConsole({
        source: "transcription",
        message: `FFmpeg finished (${elapsed}s): ${conversionLabel}`
      });
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      if (err.code === "ENOENT" && !ffmpeg.found) {
        const searched = ffmpeg.searched.length > 0 ? ffmpeg.searched.join(", ") : "<none>";
        throw new Error(
          `FFmpeg executable not found. Checked paths: ${searched}. Install dependencies or rerun the compiler.`
        );
      }
      throw err;
    }
    return target;
  }

  private async ensureModel(settings: ModelSettings): Promise<string> {
    const workRoot = path.join(app.getPath("userData"), WORK_ROOT_NAME);
    const modelsDir = path.join(workRoot, "models");
    await fsp.mkdir(modelsDir, { recursive: true });

    // Handle custom model path (local file)
    if (settings.customModelPath && settings.customModelPath.trim().length > 0) {
      const customPath = settings.customModelPath.trim();
      if (fs.existsSync(customPath)) {
        this.emitConsole({ source: "transcription", message: `Using custom model from ${customPath}` });
        return customPath;
      } else {
        throw new Error(`Custom model path not found: ${customPath}`);
      }
    }

    // Handle custom model URL
    if (settings.customModelUrl && settings.customModelUrl.trim().length > 0) {
      const customUrl = settings.customModelUrl.trim();
      // Extract filename from URL and sanitize it
      const urlParts = customUrl.split('/');
      const rawFileName = urlParts[urlParts.length - 1] || 'custom-model.bin';
      // Sanitize filename: remove path separators and limit to safe characters
      const fileName = path.basename(rawFileName).replace(/[^a-zA-Z0-9._-]/g, '_');
      const modelPath = path.join(modelsDir, fileName);

      if (fs.existsSync(modelPath)) {
        this.emitConsole({ source: "transcription", message: `Using cached custom model ${fileName}` });
        return modelPath;
      }

      this.emitConsole({ source: "transcription", message: `Downloading custom model from ${customUrl}` });
      await this.downloadFile(customUrl, modelPath);
      this.emitConsole({ source: "transcription", message: `Custom model downloaded: ${fileName}` });
      return modelPath;
    }

    // Reject if model is set to "custom" but no URL or path provided
    if (settings.model === "custom") {
      throw new Error("Custom model selected but no URL or local path provided.");
    }

    // Default behavior for standard models
    const modelFile = `ggml-${settings.model}.bin`;
    const modelPath = path.join(modelsDir, modelFile);

    if (fs.existsSync(modelPath)) {
      this.emitConsole({ source: "transcription", message: `Using cached model ${modelFile}` });
      return modelPath;
    }

    this.emitConsole({ source: "transcription", message: `Downloading model ${modelFile}` });
    const url = `${MODEL_BASE_URL}/${modelFile}`;
    await this.downloadFile(url, modelPath);
    this.emitConsole({ source: "transcription", message: `Model downloaded: ${modelFile}` });
    return modelPath;
  }

  private async runWhisper(audioFile: string, modelPath: string, settings: ModelSettings): Promise<void> {
    const binDir = path.join(app.getPath("userData"), WORK_ROOT_NAME, "bin");
    const whisper = resolveBinary("whisper-cli", { allowSystemFallback: false });
    if (!whisper.found || whisper.command.length === 0) {
      throw new Error(
        "Whisper CLI binary missing. Compile Whisper from the settings panel to continue."
      );
    }

    const args = [
      "-m",
      modelPath,
      "-f",
      audioFile
    ];

    if (settings.outputTxt) {
      args.push("-otxt");
    }
    if (settings.outputSrt) {
      args.push("-osrt");
    }
    if (settings.cpuOnly) {
      args.push("--no-gpu");
    }

    args.push("-l", settings.language);

    if (settings.extraArgs.trim().length > 0) {
      args.push(...this.parseArgs(settings.extraArgs));
    }

    const exeLabel = path.basename(whisper.command);
    this.emitConsole({ source: "transcription", message: `Running ${exeLabel} on ${path.basename(audioFile)}` });
    await this.spawnWithLogs(whisper.command, args);
  }

  private parseArgs(argumentText: string): string[] {
    // Basic quoted string splitter similar to QProcess::splitCommand
    const result: string[] = [];
    let current = "";
    let inQuotes = false;

    for (const char of argumentText.trim()) {
      if (char === '"') {
        inQuotes = !inQuotes;
        continue;
      }
      if (!inQuotes && /\s/.test(char)) {
        if (current.length > 0) {
          result.push(current);
          current = "";
        }
      } else {
        current += char;
      }
    }

    if (current.length > 0) {
      result.push(current);
    }

    return result;
  }

  private async downloadFile(url: string, destination: string, redirectDepth = 0): Promise<void> {
    if (redirectDepth > 5) {
      throw new Error("Too many redirects while downloading model.");
    }

    await fsp.mkdir(path.dirname(destination), { recursive: true });

    await new Promise<void>((resolve, reject) => {
      https
        .get(url, (response) => {
          const status = response.statusCode ?? 0;
          if (status >= 300 && status < 400 && response.headers.location) {
            response.resume();
            this.downloadFile(response.headers.location, destination, redirectDepth + 1)
              .then(resolve)
              .catch(reject);
            return;
          }

          if (status >= 400) {
            reject(new Error(`Failed to download model: ${status}`));
            response.resume();
            return;
          }

          const fileStream = fs.createWriteStream(destination);
          pipeline(response, fileStream)
            .then(() => resolve())
            .catch((error) => reject(error));
        })
        .on("error", (error) => reject(error));
    });
  }

  private async spawnWithLogs(command: string, args: string[]): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const child = spawn(command, args);
      this.activeProcess = child;

      child.stdout.on("data", (data) => {
        const chunk = data.toString();
        const lines: string[] = chunk.replace(/\r/g, "\n").split(/\n+/);
        for (const raw of lines) {
          const line = raw.trim();
          if (line.length > 0) {
            this.emitConsole({ source: "transcription", message: line });
          }
        }
      });

      child.stderr.on("data", (data) => {
        const chunk = data.toString();
        const lines: string[] = chunk.replace(/\r/g, "\n").split(/\n+/);
        for (const raw of lines) {
          const line = raw.trim();
          if (line.length > 0) {
            this.emitConsole({ source: "transcription", message: line });
          }
        }
      });

      child.once("error", (error) => {
        this.activeProcess = undefined;
        reject(error);
      });

      child.once("close", (code) => {
        this.activeProcess = undefined;
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`${command} exited with code ${code}`));
        }
      });
    });
  }

  private async stopActiveProcess(): Promise<void> {
    if (!this.activeProcess) {
      return;
    }

    const proc = this.activeProcess;
    proc.kill();
    await new Promise<void>((resolve) => {
      proc.once("close", () => resolve());
      setTimeout(() => resolve(), 1500);
    });
    this.activeProcess = undefined;
  }

  private emitConsole(event: ConsoleEvent): void {
    this.emit("console", event);
  }

  private emitQueue(): void {
    const awaiting = [...this.queue.map((item) => item.file)];
    const state: QueueState = {
      awaiting,
      processing: this.current?.file,
      isProcessing: this.processing
    };
    this.emit("queue", state);
  }
}
