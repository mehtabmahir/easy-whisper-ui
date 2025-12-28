import { app } from "electron";
import { ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import fsp from "node:fs/promises";
import https from "node:https";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { ConsoleEvent, LiveRequest } from "../../types/easy-whisper";
import { WORK_ROOT_NAME } from "./compileManager";

interface LiveEvents {
  console: ConsoleEvent;
  text: string;
  state: "started" | "stopped";
}

type LiveEventName = keyof LiveEvents;
type LiveListener<T extends LiveEventName> = (payload: LiveEvents[T]) => void;

const ANSI_ESCAPE = /\u001b\[[0-9;]*[A-Za-z]/g;
const MODEL_BASE_URL = "https://huggingface.co/ggerganov/whisper.cpp/resolve/main";

export class LiveManager extends EventEmitter {
  private proc?: ChildProcessWithoutNullStreams;

  on<T extends LiveEventName>(event: T, listener: LiveListener<T>): this {
    return super.on(event, listener as any);
  }

  once<T extends LiveEventName>(event: T, listener: LiveListener<T>): this {
    return super.once(event, listener as any);
  }

  off<T extends LiveEventName>(event: T, listener: LiveListener<T>): this {
    return super.off(event, listener as any);
  }

  async start(request: LiveRequest): Promise<void> {
    if (this.proc) {
      throw new Error("Live transcription already running.");
    }

    const binDir = path.join(app.getPath("userData"), WORK_ROOT_NAME, "bin");
    const exe = path.join(binDir, "whisper-stream.exe");
    if (!fs.existsSync(exe)) {
      throw new Error("Whisper live binary missing. Compile binaries before starting live transcription.");
    }

    const modelPath = await this.ensureModel(request.settings.model);

    const args = [
      "-m",
      modelPath,
      "-l",
      request.settings.language,
      "--step",
      String(request.stepMs),
      "--length",
      String(request.lengthMs)
    ];

    if (request.settings.cpuOnly) {
      args.push("--no-gpu");
    }

    this.emitConsole({ source: "live", message: "Starting live transcription." });

    await new Promise<void>((resolve, reject) => {
      const child = spawn(exe, args, { stdio: ["ignore", "pipe", "pipe"] });
      this.proc = child;

      child.stdout.on("data", (data) => {
        const text = data.toString("utf8");
        if (!text) {
          return;
        }
        const cleaned = text.replace(ANSI_ESCAPE, "").trim();
        if (cleaned.length > 0) {
          this.emit("text", cleaned);
        }
      });

      child.stderr.on("data", (data) => {
        const msg = data.toString().trim();
        if (msg.length > 0) {
          this.emitConsole({ source: "live", message: msg });
        }
      });

      child.once("spawn", () => {
        this.emit("state", "started");
        resolve();
      });

      child.once("error", (error) => {
        this.proc = undefined;
        reject(error);
      });

      child.once("close", () => {
        this.proc = undefined;
        this.emit("state", "stopped");
      });
    });
  }

  async stop(): Promise<void> {
    if (!this.proc) {
      return;
    }

    const child = this.proc;
    this.proc = undefined;
    this.emitConsole({ source: "live", message: "Stopping live transcription." });

    child.kill();

    await new Promise<void>((resolve) => {
      child.once("close", () => resolve());
      setTimeout(() => resolve(), 1500);
    });
  }

  private emitConsole(event: ConsoleEvent): void {
    this.emit("console", event);
  }

  private async ensureModel(modelName: string, redirectDepth = 0): Promise<string> {
    const workRoot = path.join(app.getPath("userData"), WORK_ROOT_NAME);
    const modelsDir = path.join(workRoot, "models");
    await fsp.mkdir(modelsDir, { recursive: true });
    const modelFile = `ggml-${modelName}.bin`;
    const modelPath = path.join(modelsDir, modelFile);

    if (fs.existsSync(modelPath)) {
      return modelPath;
    }

    this.emitConsole({ source: "live", message: `Downloading model ${modelFile}` });
    await this.downloadFile(`${MODEL_BASE_URL}/${modelFile}`, modelPath, redirectDepth);
    this.emitConsole({ source: "live", message: `Model ready ${modelFile}` });
    return modelPath;
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
}
