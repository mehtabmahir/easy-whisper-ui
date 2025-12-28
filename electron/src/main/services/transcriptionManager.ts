import { app, shell } from "electron";
import { spawn, ChildProcessWithoutNullStreams } from "node:child_process";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import fsp from "node:fs/promises";
import https from "node:https";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import {
  ConsoleEvent,
  ModelSettings,
  QueueState,
  TranscriptionRequest
} from "../../types/easy-whisper";
import { WORK_ROOT_NAME } from "./compileManager";

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
      const mp3Path = await this.ensureMp3(nextItem.file);
      const modelPath = await this.ensureModel(nextItem.settings);
      await this.runWhisper(mp3Path, modelPath, nextItem.settings);
      if (nextItem.settings.openAfterComplete) {
        const outputTxt = `${mp3Path}.txt`;
        if (fs.existsSync(outputTxt)) {
          await shell.showItemInFolder(outputTxt);
        } else {
          await shell.showItemInFolder(mp3Path);
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

  private async ensureMp3(filePath: string): Promise<string> {
    const ext = path.extname(filePath).toLowerCase();
    if (ext === ".mp3") {
      this.emitConsole({ source: "transcription", message: "Input already MP3, skipping conversion." });
      return filePath;
    }

    const parsed = path.parse(filePath);
    const target = path.join(parsed.dir, `${parsed.name}.mp3`);
    this.emitConsole({ source: "transcription", message: `Converting to MP3: ${path.basename(target)}` });
    await this.spawnWithLogs("ffmpeg", ["-y", "-i", filePath, "-b:a", "128k", target]);
    return target;
  }

  private async ensureModel(settings: ModelSettings): Promise<string> {
    const workRoot = path.join(app.getPath("userData"), WORK_ROOT_NAME);
    const modelsDir = path.join(workRoot, "models");
    await fsp.mkdir(modelsDir, { recursive: true });

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

  private async runWhisper(mp3File: string, modelPath: string, settings: ModelSettings): Promise<void> {
    const binDir = path.join(app.getPath("userData"), WORK_ROOT_NAME, "bin");
    const exePath = path.join(binDir, "whisper-cli.exe");
    if (!fs.existsSync(exePath)) {
      throw new Error("Whisper binaries missing. Please compile them first.");
    }

    const args = [
      "-m",
      modelPath,
      "-f",
      mp3File
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

    this.emitConsole({ source: "transcription", message: `Running whisper-cli on ${path.basename(mp3File)}` });
    await this.spawnWithLogs(exePath, args);
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
      const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
      this.activeProcess = child;

      child.stdout.on("data", (data) => {
        const text = data.toString().trim();
        if (text.length > 0) {
          this.emitConsole({ source: "transcription", message: text });
        }
      });

      child.stderr.on("data", (data) => {
        const text = data.toString().trim();
        if (text.length > 0) {
          this.emitConsole({ source: "transcription", message: text });
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
