import fs from "node:fs";
import path from "node:path";
import { app, shell } from "electron";

function settingsPath(): string {
  return path.join(app.getPath("userData"), "app-settings.json");
}

export function getClearAudioCacheOnExit(): boolean {
  try {
    return JSON.parse(fs.readFileSync(settingsPath(), "utf8")).clearAudioCacheOnExit !== false;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") console.error("Could not read app settings:", error);
    return true;
  }
}

export function setClearAudioCacheOnExit(value: unknown): void {
  if (typeof value !== "boolean") throw new Error("Invalid audio cache preference.");
  const target = settingsPath();
  fs.mkdirSync(path.dirname(target), { recursive: true });
  // Publish the preference atomically so quitting cannot read a partial write.
  fs.writeFileSync(`${target}.tmp`, JSON.stringify({ clearAudioCacheOnExit: value }));
  fs.renameSync(`${target}.tmp`, target);
}

export async function openWorkspaceFolder(): Promise<void> {
  const folder = path.join(app.getPath("userData"), "whisper-workspace");
  await fs.promises.mkdir(folder, { recursive: true });
  const error = await shell.openPath(folder);
  if (error) throw new Error(error);
}

export async function showSetupLog(): Promise<void> {
  const log = path.join(app.getPath("userData"), "whisper-workspace", "log.txt");
  try { await fs.promises.access(log); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error("No setup log yet. It is created when dependency setup or compilation runs.");
    }
    throw error;
  }
  const error = await shell.openPath(log);
  if (error) throw new Error(error);
}
