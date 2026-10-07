import { app } from "electron";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import type { UninstallInfo } from "../../types/easy-whisper";

async function installedUninstaller(): Promise<string | undefined> {
  if (!app.isPackaged || process.platform !== "win32" || process.env.PORTABLE_EXECUTABLE_FILE) return;
  // Only launch the NSIS uninstaller beside this installed app; never accept a renderer-supplied path.
  const candidate = path.join(path.dirname(app.getPath("exe")), "Uninstall EasyWhisperUI.exe");
  try {
    const stat = await fs.lstat(candidate);
    if (stat.isFile() && !stat.isSymbolicLink()) return candidate;
  } catch { /* No registered installation beside this executable. */ }
}

export async function getUninstallInfo(): Promise<UninstallInfo> {
  if (!app.isPackaged) return { available: false, reason: "Full uninstall is available in the installed Windows app. This development checkout cannot uninstall itself." };
  if (process.platform !== "win32") return { available: false, reason: "Full uninstall from Settings is currently supported by the Windows installer only." };
  if (!(await installedUninstaller())) return { available: false, reason: "No Windows uninstaller was found. Portable and unpacked copies cannot uninstall themselves from Settings." };
  return { available: true };
}

export async function launchUninstaller(): Promise<void> {
  const executable = await installedUninstaller();
  if (!executable) throw new Error("The installed Windows uninstaller could not be found. No files were removed.");
  await new Promise<void>((resolve, reject) => {
    // NSIS handles app files, shortcuts, associations and app data after the app exits.
    // Keep its normal UI; do not silently uninstall or remove shared system dependencies.
    const child = spawn(executable, ["--delete-app-data"], {
      detached: true, stdio: "ignore", shell: false
    });
    child.once("error", reject);
    child.once("spawn", () => { child.unref(); resolve(); });
  });
}
