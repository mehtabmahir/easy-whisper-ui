import { app } from "electron";
import { ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import path from "node:path";
import { ConsoleEvent, LiveRequest, ModelSettings } from "../../types/easy-whisper";
import { WORK_ROOT_NAME } from "./compileManager";
import { resolveBinary } from "./binaryResolver";

interface LiveEvents {
  console: ConsoleEvent;
  text: string;
  state: "started" | "stopped";
}

type LiveEventName = keyof LiveEvents;
type LiveListener<T extends LiveEventName> = (payload: LiveEvents[T]) => void;

const ANSI_ESCAPE = /\u001b\[[0-9;]*[A-Za-z]/g;

export class LiveManager extends EventEmitter {
  private proc?: ChildProcessWithoutNullStreams;
  private preparing?: AbortController;

  constructor(private readonly downloadModel: (model: string, signal: AbortSignal) => Promise<void>) {
    super();
  }

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
    if (this.proc || this.preparing) {
      throw new Error("Live transcription already running.");
    }

    const streamBinary = resolveBinary("whisper-stream", { allowSystemFallback: false });
    if (!streamBinary.found || streamBinary.command.length === 0) {
      throw new Error("Whisper live binary missing. Compile Whisper before starting live transcription.");
    }
    const exe = streamBinary.command;
    const exeLabel = path.basename(exe);

    const controller = new AbortController();
    this.preparing = controller;
    try {
      const modelPath = await this.ensureModel(request.settings, controller.signal);
      controller.signal.throwIfAborted();

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

      this.emitConsole({ source: "live", message: `Starting live transcription with ${exeLabel}.` });

      await new Promise<void>((resolve, reject) => {
        const child = spawn(exe, args);
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
    } finally {
      this.preparing = undefined;
    }
  }

  async stop(): Promise<void> {
    this.preparing?.abort();
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

  private async ensureModel(settings: ModelSettings, signal: AbortSignal): Promise<string> {
    if (settings.model === "custom") {
      const customPath = settings.customModelPath?.trim();
      if (!customPath) {
        throw new Error("Select a custom model file before starting live transcription.");
      }
      if (!fs.existsSync(customPath)) {
        throw new Error(`Custom model file not found: ${customPath}`);
      }
      this.emitConsole({ source: "live", message: `Using custom model file ${path.basename(customPath)}` });
      return customPath;
    }

    await this.downloadModel(settings.model, signal);
    signal.throwIfAborted();
    return path.join(app.getPath("userData"), WORK_ROOT_NAME, "models", `ggml-${settings.model}.bin`);
  }
}
