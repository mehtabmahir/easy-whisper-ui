import { app } from "electron";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { resolveBinary } from "./binaryResolver";
import { WORK_ROOT_NAME } from "./compileManager";
import type { GpuReadiness } from "../../types/easy-whisper";

const exec = promisify(execFile);
export const GPU_CHECK_MODEL = "tiny.en-q5_1";

export async function ensureGpuCheckModel(modelsDir: string, downloadModel: (name: string) => Promise<void>): Promise<string> {
  const model = path.join(modelsDir, `ggml-${GPU_CHECK_MODEL}.bin`);
  try {
    if ((await fsp.stat(model)).size > 0) return model;
    await fsp.unlink(model);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  await downloadModel(GPU_CHECK_MODEL);
  if ((await fsp.stat(model)).size <= 0) throw new Error("GPU check model is empty.");
  return model;
}

export function classifyGpuProbe(output: string, completed: boolean): GpuReadiness {
  if (!completed) return { state: "unverified", message: "GPU check incomplete." };
  if (/whisper_backend_init_gpu:\s+(?:no GPU found|failed to initialize)/.test(output)) {
    return { state: "unavailable", message: "Whisper fell back to CPU." };
  }
  const match = output.match(/whisper_backend_init_gpu:\s+using (.+?) backend/);
  return match
    ? { state: "ready", message: `Verified with ${match[1]}.` }
    : { state: "unverified", message: "No GPU backend reported." };
}

export async function checkGpuReadiness(downloadModel: (name: string) => Promise<void>): Promise<GpuReadiness> {
  const binary = resolveBinary("whisper-cli", { allowSystemFallback: false });
  if (!binary.found) return { state: "unverified", message: "Finish Whisper setup to check GPU acceleration." };
  const modelsDir = path.join(app.getPath("userData"), WORK_ROOT_NAME, "models");
  let model: string;
  try { model = await ensureGpuCheckModel(modelsDir, downloadModel); }
  catch { return { state: "unverified", message: "GPU check model download failed. Reopen the app to retry." }; }
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), "easy-whisper-gpu-check-"));
  try {
    // Synthetic silence, not microphone audio or a user's recording. No exports.
    const wav = Buffer.alloc(44 + 16000 * 2);
    wav.write("RIFF", 0); wav.writeUInt32LE(wav.length - 8, 4); wav.write("WAVEfmt ", 8);
    wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
    wav.writeUInt32LE(16000, 24); wav.writeUInt32LE(32000, 28);
    wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write("data", 36); wav.writeUInt32LE(wav.length - 44, 40);
    const audio = path.join(dir, "check.wav");
    await fsp.writeFile(audio, wav);
    const { stdout, stderr } = await exec(binary.command, ["-m", model, "-f", audio, "-l", "en", "-t", "2", "-nt"], {
      timeout: 30000, maxBuffer: 2 * 1024 * 1024, windowsHide: true, cwd: dir
    });
    return classifyGpuProbe(`${stdout}\n${stderr}`, true);
  } catch {
    return classifyGpuProbe("", false);
  } finally {
    await fsp.rm(dir, { recursive: true, force: true });
  }
}
