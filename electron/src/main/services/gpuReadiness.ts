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

export function classifyGpuProbe(output: string, completed: boolean): GpuReadiness {
  if (!completed) return { state: "unverified", message: "The GPU check did not complete. See transcription output when running a file." };
  if (/whisper_backend_init_gpu:\s+(?:no GPU found|failed to initialize)/.test(output)) {
    return { state: "unavailable", message: "Whisper could not initialize a GPU backend and used the CPU." };
  }
  const match = output.match(/whisper_backend_init_gpu:\s+using (.+?) backend/);
  return match
    ? { state: "ready", message: `Whisper completed a short local check using ${match[1]}. Larger models may need more memory.` }
    : { state: "unverified", message: "Whisper did not report a GPU backend during the check." };
}

export async function checkGpuReadiness(): Promise<GpuReadiness> {
  const binary = resolveBinary("whisper-cli", { allowSystemFallback: false });
  if (!binary.found) return { state: "unverified", message: "Finish Whisper setup to check GPU acceleration." };
  const modelsDir = path.join(app.getPath("userData"), WORK_ROOT_NAME, "models");
  let model: string | undefined;
  // Never download a model or load a large model just to check readiness.
  for (const name of ["tiny.en", "tiny", "base.en", "base"]) {
    const candidate = path.join(modelsDir, `ggml-${name}.bin`);
    try { if ((await fsp.stat(candidate)).size > 0) { model = candidate; break; } } catch { /* not installed */ }
  }
  if (!model) return { state: "unverified", message: "A downloaded tiny or base model is needed for the startup check. You can still transcribe with any model." };
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
