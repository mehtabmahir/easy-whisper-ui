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
