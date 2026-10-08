import { app, BrowserWindow, shell } from "electron";
import { spawn, spawnSync, ChildProcessWithoutNullStreams } from "node:child_process";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import fsp from "node:fs/promises";
import https from "node:https";
import path from "node:path";
import os from "node:os";
import { createHash, randomUUID } from "node:crypto";
import { pipeline } from "node:stream/promises";
import {
  ConsoleEvent,
  ModelDownloadProgress,
  ModelSettings,
  QueueState,
  TranscriptionRequest
} from "../../types/easy-whisper";
import { WORK_ROOT_NAME } from "./compileManager";
import { resolveBinary } from "./binaryResolver";
import { DOWNLOADABLE_MODELS } from "./modelCatalog";

interface QueueItem {
  file: string;
  settings: ModelSettings;
}

interface TranscriptionEvents {
  download: ModelDownloadProgress;
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
  private currentAbort?: AbortController;
  private clearingCache = false;
  private shuttingDown = false;
  private modelDownload?: AbortController;

  async downloadModel(model: unknown): Promise<void> {
    if (typeof model !== "string" || !DOWNLOADABLE_MODELS.includes(model)) {
      throw new Error("Select a supported model.");
    }
    if (this.shuttingDown || this.processing || this.queue.length || this.modelDownload) {
      throw new Error("Wait for the current operation to finish.");
    }
    const controller = new AbortController();
    this.modelDownload = controller;
    try {
      await this.ensureModel({ model }, controller.signal);
    } finally {
      this.modelDownload = undefined;
    }
  }

  async clearAudioCache(): Promise<void> {
    if (this.processing || this.queue.length || this.clearingCache) {
      throw new Error("Stop transcription and wait for the queue to finish before clearing the audio cache.");
    }
    this.clearingCache = true;
    try {
      const cacheDir = path.join(app.getPath("userData"), WORK_ROOT_NAME, "audio-cache");
      await fsp.rm(cacheDir, { recursive: true, force: true });
      this.emitConsole({ source: "transcription", message: "Converted audio cache cleared." });
    } finally {
      this.clearingCache = false;
    }
  }

  async shutdown(clearCacheOnExit = true): Promise<void> {
    this.shuttingDown = true;
    this.modelDownload?.abort();
    // Wait for preparation and child-process callbacks before deleting their files.
    if (this.processing) {
      let timer: ReturnType<typeof setTimeout>;
      let finished: () => void;
      const idle = new Promise<void>((resolve, reject) => {
        finished = resolve;
        this.once("finished", finished);
        timer = setTimeout(() => reject(new Error("Transcription did not stop in time; keeping audio cache.")), 5000);
      });
      try {
        await Promise.all([idle, this.cancelAll()]);
      } finally {
        clearTimeout(timer!);
        this.off("finished", finished!);
      }
    }
    if (clearCacheOnExit) await this.clearAudioCache();
  }

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
    if (this.clearingCache || this.shuttingDown) return;
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
    this.currentAbort?.abort();
    await this.stopActiveProcess();
  }

  async skipCurrent(): Promise<void> {
    if (!this.current || this.currentAbort?.signal.aborted) return;
    this.emitConsole({ source: "transcription", message: `Skipping: ${path.basename(this.current.file)}` });
    this.currentAbort?.abort();
    await this.stopActiveProcess();
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
    const controller = new AbortController();
    this.currentAbort = controller;
    this.emitQueue();

    let audio: { path: string; deleteAfter: boolean } | undefined;

    try {
      audio = await this.ensureMp3(nextItem.file);
      controller.signal.throwIfAborted();
      const modelPath = await this.ensureModel(nextItem.settings, controller.signal);
      controller.signal.throwIfAborted();
      // Keep exports beside the original media, even when the input WAV is cached.
      const parsed = path.parse(nextItem.file);
      const outputBase = audio.deleteAfter ? path.join(parsed.dir, `${parsed.name}.wav`) : nextItem.file;
      await this.runWhisper(audio.path, modelPath, nextItem.settings, outputBase);
      controller.signal.throwIfAborted();
      if (nextItem.settings.openAfterComplete) {
        await this.openOutputAfterComplete(outputBase);
      }
      this.emitConsole({ source: "transcription", message: `Completed: ${path.basename(nextItem.file)}` });
    } catch (error) {
      const err = error as Error;
      this.emitConsole({ source: "transcription", message: controller.signal.aborted
        ? `Stopped: ${path.basename(nextItem.file)}` : `Error processing ${nextItem.file}: ${err.message}` });
    } finally {
      if (audio?.deleteAfter) {
        this.emitConsole({ source: "transcription", message: `Cached converted audio for reuse: ${audio.path}` });
      }
      this.current = undefined;
      this.currentAbort = undefined;
      this.processing = false;
      this.activeProcess = undefined;
      this.emitQueue();
      await this.processNext();
    }
  }

  private async ensureMp3(filePath: string): Promise<{ path: string; deleteAfter: boolean }> {
    const ext = path.extname(filePath).toLowerCase();

    const targetExt = ".wav";
    const targetCodec = "pcm_s16le";

    if (ext === targetExt) {
      this.emitConsole({ source: "transcription", message: `Input already ${targetExt.toUpperCase()} compatible, skipping conversion.` });
      return { path: filePath, deleteAfter: false };
    }

    const source = await fsp.realpath(filePath);
    const sourceStat = await fsp.stat(source, { bigint: true });
    const cacheDir = path.join(app.getPath("userData"), WORK_ROOT_NAME, "audio-cache");
    await fsp.mkdir(cacheDir, { recursive: true });
    // ctime includes metadata-only changes (such as cloud-provider updates).
    // Track file identity, size and content modification time instead.
    // Version the conversion parameters; model changes do not invalidate the audio.
    const key = createHash("sha256").update(JSON.stringify([
      "pcm-s16le-44100-mono-v2", source, String(sourceStat.dev), String(sourceStat.ino),
      String(sourceStat.size), String(sourceStat.mtimeNs)
    ])).digest("hex");
    const target = path.join(cacheDir, `${key}.wav`);
    try {
      const cached = await fsp.stat(target);
      if (cached.isFile() && cached.size > 44) {
        this.emitConsole({ source: "transcription", message: `Reusing converted audio: ${target}` });
        return { path: target, deleteAfter: true };
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    // Only a successful conversion is published under the reusable cache name.
    const partial = path.join(cacheDir, `${key}.${randomUUID()}.partial.wav`);
    const conversionLabel = path.basename(target);
    this.emitConsole({
      source: "transcription",
      message: `Converting to WAV PCM (44.1k mono): ${conversionLabel}`
    });
    const ffmpeg = resolveBinary("ffmpeg");

    try {
      const availableCpus = Math.max(1, os.cpus().length - 1); // leave a core free for whisper/UI
      const threadArgs = ["-threads", String(availableCpus)];

      const commonArgs = [
        "-y",
        "-hide_banner",
        "-loglevel",
        "warning",
        "-progress",
        "pipe:2",
        "-nostats",
        ...threadArgs,
        "-i",
        source,
        "-vn",
        "-sn",
        "-dn",
        "-map_metadata",
        "-1"
      ];

      const args = [
        ...commonArgs,
        "-ac",
        "1",
        "-ar",
        "44100",
        "-c:a",
        targetCodec,
        partial
      ];

      const started = Date.now();
      await this.spawnWithLogs(ffmpeg.command, args);
      this.currentAbort?.signal.throwIfAborted();
      const after = await fsp.stat(source, { bigint: true });
      if (after.dev !== sourceStat.dev || after.ino !== sourceStat.ino ||
          after.size !== sourceStat.size || after.mtimeNs !== sourceStat.mtimeNs) {
        throw new Error("Source media changed during conversion. Please retry.");
      }
      await fsp.rename(partial, target);
      const elapsed = ((Date.now() - started) / 1000).toFixed(1);
      this.emitConsole({
        source: "transcription",
        message: `FFmpeg finished (${elapsed}s): ${conversionLabel}`
      });
    } catch (error) {
      await fsp.rm(partial, { force: true }).catch(() => undefined);
      const err = error as NodeJS.ErrnoException;
      if (err.code === "ENOENT" && !ffmpeg.found) {
        const searched = ffmpeg.searched.length > 0 ? ffmpeg.searched.join(", ") : "<none>";
        throw new Error(
          `FFmpeg executable not found. Checked paths: ${searched}. Install dependencies or rerun the compiler.`
        );
      }
      throw err;
    }
    return { path: target, deleteAfter: true };
  }

  private async ensureModel(settings: Pick<ModelSettings, "model" | "customModelPath">, signal: AbortSignal): Promise<string> {
    if (settings.model === "custom") {
      const customPath = settings.customModelPath?.trim();
      if (!customPath) {
        throw new Error("Select a custom model file before starting transcription.");
      }
      if (!fs.existsSync(customPath)) {
        throw new Error(`Custom model file not found: ${customPath}`);
      }
      this.emitConsole({ source: "transcription", message: `Using custom model file ${path.basename(customPath)}` });
      return customPath;
    }

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
    const partial = `${modelPath}.${randomUUID()}.partial`;
    let progress: ModelDownloadProgress = { model: settings.model, receivedBytes: 0, bytesPerSecond: 0, state: "downloading" };
    this.emit("download", progress);
    try {
      await this.downloadFile(url, partial, signal, 0, (receivedBytes, totalBytes, bytesPerSecond) => {
        progress = { ...progress, receivedBytes, totalBytes, bytesPerSecond };
        this.emit("download", progress);
      });
      signal.throwIfAborted();
      await fsp.rename(partial, modelPath);
      this.emit("download", { ...progress, state: "complete" });
    } catch (error) {
      // A skipped download must not leave a partial file that the next queue item treats as cached.
      await fsp.rm(partial, { force: true });
      this.emit("download", { ...progress, state: "error" });
      throw error;
    }
    this.emitConsole({ source: "transcription", message: `Model downloaded: ${modelFile}` });
    return modelPath;
  }

  private async runWhisper(audioFile: string, modelPath: string, settings: ModelSettings, outputBase = audioFile): Promise<void> {
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
      audioFile,
      "-of",
      outputBase
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

  private async downloadFile(url: string, destination: string, signal: AbortSignal, redirectDepth = 0,
    onProgress?: (received: number, total: number | undefined, speed: number) => void): Promise<void> {
    if (redirectDepth > 5) {
      throw new Error("Too many redirects while downloading model.");
    }

    await fsp.mkdir(path.dirname(destination), { recursive: true });

    await new Promise<void>((resolve, reject) => {
      https
        .get(url, { signal }, (response) => {
          const status = response.statusCode ?? 0;
          if (status >= 300 && status < 400 && response.headers.location) {
            response.resume();
            this.downloadFile(new URL(response.headers.location, url).href, destination, signal, redirectDepth + 1, onProgress)
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
          const length = Number(response.headers["content-length"]);
          const total = Number.isFinite(length) && length > 0 ? length : undefined;
          let received = 0;
          const started = performance.now();
          const report = () => onProgress?.(received, total, received / Math.max(0.001, (performance.now() - started) / 1000));
          response.on("data", (chunk: Buffer) => { received += chunk.length; });
          const timer = setInterval(report, 250);
          report();
          pipeline(response, fileStream, { signal })
            .then(() => {
              if (total !== undefined && received !== total) throw new Error("Model download was incomplete. Please retry.");
              report();
              resolve();
            })
            .catch((error) => reject(error))
            .finally(() => clearInterval(timer));
        })
        .on("error", (error) => reject(error));
    });
  }

  private async spawnWithLogs(command: string, args: string[]): Promise<void> {
    this.currentAbort?.signal.throwIfAborted();
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

  private async openOutputAfterComplete(audioPath: string): Promise<void> {
    const outputTxt = `${audioPath}.txt`;
    const outputSrt = `${audioPath}.srt`;
    const preferredOutput = fs.existsSync(outputTxt)
      ? outputTxt
      : fs.existsSync(outputSrt)
        ? outputSrt
        : audioPath;

    const isTranscriptText = preferredOutput.endsWith(".txt") || preferredOutput.endsWith(".srt");

    if (process.platform === "linux" && isTranscriptText) {
      const openedInApp = await this.openTranscriptInWindow(preferredOutput);
      if (openedInApp) {
        return;
      }

      const openedWithEditor = this.openWithLinuxTextEditor(preferredOutput);
      if (openedWithEditor) {
        return;
      }
    }

    const openResult = await shell.openPath(preferredOutput);
    if (openResult) {
      await shell.showItemInFolder(preferredOutput);
      this.emitConsole({
        source: "transcription",
        message: `Opened output folder instead because direct file open failed: ${openResult}`
      });
    }
  }

  private openWithLinuxTextEditor(filePath: string): boolean {
    const editorCandidates = ["sensible-editor", "gedit", "xed", "kate", "mousepad", "pluma"];

    for (const editor of editorCandidates) {
      if (!this.hasCommand(editor)) {
        continue;
      }

      try {
        const child = spawn(editor, [filePath], {
          detached: true,
          stdio: "ignore"
        });
        child.unref();
        this.emitConsole({ source: "transcription", message: `Opened transcript using ${editor}.` });
        return true;
      } catch {
        // Try next editor candidate.
      }
    }

    return false;
  }

  private hasCommand(command: string): boolean {
    try {
      const result = spawnSync("sh", ["-lc", `command -v ${command}`], { stdio: "ignore" });
      return result.status === 0;
    } catch {
      return false;
    }
  }

  private async openTranscriptInWindow(filePath: string): Promise<boolean> {
    try {
      const content = await fsp.readFile(filePath, "utf8");
      const escapedTitle = this.escapeHtml(path.basename(filePath));
      const escapedPath = this.escapeHtml(filePath);
      const escapedContent = this.escapeHtml(content);

      const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>${escapedTitle}</title>
    <style>
      :root { color-scheme: light dark; }
      body { margin: 0; font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; }
      header { padding: 10px 14px; border-bottom: 1px solid #8884; font-size: 13px; }
      pre { margin: 0; padding: 14px; white-space: pre-wrap; word-break: break-word; font: 13px/1.5 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
    </style>
  </head>
  <body>
    <header>${escapedTitle}<br><small>${escapedPath}</small></header>
    <pre>${escapedContent}</pre>
  </body>
</html>`;

      const win = new BrowserWindow({
        width: 920,
        height: 700,
        autoHideMenuBar: true,
        title: path.basename(filePath)
      });

      await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
      this.emitConsole({ source: "transcription", message: "Opened transcript in EasyWhisperUI viewer." });
      return true;
    } catch (error) {
      const err = error as Error;
      this.emitConsole({ source: "transcription", message: `Could not open transcript in viewer: ${err.message}` });
      return false;
    }
  }

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }
}
