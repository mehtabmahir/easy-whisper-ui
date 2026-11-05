import fs from "node:fs";
import path from "node:path";
import { app, shell } from "electron";

function settingsPath(): string {
  return path.join(app.getPath("userData"), "app-settings.json");
}

function readSettings(): Record<string, unknown> {
  try {
    const value: unknown = JSON.parse(fs.readFileSync(settingsPath(), "utf8"));
    return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") console.error("Could not read app settings:", error);
    return {};
  }
}

function updateSettings(changes: Record<string, unknown>): void {
  const target = settingsPath();
  const settings = { ...readSettings(), ...changes };
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target + ".tmp", JSON.stringify(settings));
  fs.renameSync(target + ".tmp", target);
}

export function getClearAudioCacheOnExit(): boolean {
  return readSettings().clearAudioCacheOnExit !== false;
}

export function setClearAudioCacheOnExit(value: unknown): void {
  if (typeof value !== "boolean") throw new Error("Invalid audio cache preference.");
  updateSettings({ clearAudioCacheOnExit: value });
}

type PickerKind = "input" | "model";

export function getPickerDirectory(kind: PickerKind): string {
  const saved = readSettings()[kind + "Directory"];
  if (typeof saved === "string" && path.isAbsolute(saved)) {
    try { if (fs.statSync(saved).isDirectory()) return saved; } catch { /* Folder moved or unavailable. */ }
  }
  return app.getPath("documents");
}

export function rememberPickerDirectory(kind: PickerKind, file: string | undefined): void {
  if (!file) return;
  try { updateSettings({ [kind + "Directory"]: path.dirname(file) }); }
  catch (error) { console.error("Could not save picker directory:", error); }
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

function audioCacheFolder(): string {
  return path.join(app.getPath("userData"), "whisper-workspace", "audio-cache");
}

export async function getAudioCacheSize(): Promise<number> {
  const sizeOf = async (folder: string): Promise<number> => {
    let entries;
    try { entries = await fs.promises.readdir(folder, { withFileTypes: true }); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return 0; throw error; }
    let bytes = 0;
    for (const entry of entries) {
      const target = path.join(folder, entry.name);
      try {
        // Do not follow links outside the cache, including entries replaced during a scan.
        const stat = await fs.promises.lstat(target);
        if (stat.isSymbolicLink()) continue;
        if (stat.isDirectory()) bytes += await sizeOf(target);
        else if (stat.isFile()) bytes += stat.size;
      } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    }
    return bytes;
  };
  return sizeOf(audioCacheFolder());
}

export async function openAudioCacheFolder(): Promise<void> {
  const folder = audioCacheFolder();
  await fs.promises.mkdir(folder, { recursive: true });
  const error = await shell.openPath(folder);
  if (error) throw new Error(error);
}
