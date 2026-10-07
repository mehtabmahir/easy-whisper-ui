import { execFile } from "node:child_process";
import { resolveBinary } from "./binaryResolver";

export async function showWhisperHelp(write: (text: string) => void): Promise<void> {
  const binary = resolveBinary("whisper-cli", { allowSystemFallback: false });
  if (!binary.found) throw new Error("Whisper is not installed. Use Clean reinstall in Settings, then try Help again.");
  await new Promise<void>((resolve, reject) => {
    execFile(binary.command, ["--help"], { windowsHide: true, timeout: 15000, maxBuffer: 4 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (stdout) write(stdout);
      if (stderr) write(stderr);
      if (error) reject(new Error(`Could not run Whisper help: ${error.message}`));
      else resolve();
    });
  });
}
