import { app } from "electron";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { WORK_ROOT_NAME } from "./compileManager";

export interface BinaryResolution {
  command: string;
  found: boolean;
  searched: string[];
  staged?: boolean;
}

interface ResolveOptions {
  allowSystemFallback?: boolean;
}

export function resolveBinary(baseName: string, options: ResolveOptions = {}): BinaryResolution {
  const exeName = process.platform === "win32" ? `${baseName}.exe` : baseName;
  const fallback = process.platform === "win32" ? `${baseName}.exe` : baseName;

  if (baseName === "ffmpeg") {
    const allowSystemFallback = options.allowSystemFallback !== false;

    const workspaceBin = path.join(app.getPath("userData"), WORK_ROOT_NAME, "bin");
    const workspaceCandidate = path.join(workspaceBin, exeName);
    const toolchainBin = path.join(app.getPath("userData"), WORK_ROOT_NAME, "toolchain", "ffmpeg", "bin");
    const toolchainExe = path.join(toolchainBin, exeName);

    const preferredSources: string[] = [];
    if (process.resourcesPath) {
      preferredSources.push(
        path.join(process.resourcesPath, "mac-bin", exeName),
        path.join(process.resourcesPath, exeName)
      );
    }

    const appPath = app.getAppPath();
    preferredSources.push(
      path.join(appPath, "buildResources", "mac-bin", exeName),
      path.join(appPath, "buildResources", exeName),
      path.join(appPath, exeName),
      path.join(__dirname, "../../../buildResources", "mac-bin", exeName),
      path.join(__dirname, "../../../buildResources", exeName)
    );

    // Workspace/toolchain are fallbacks if nothing bundled is found.
    preferredSources.push(workspaceCandidate, toolchainExe);

    const uniqueCandidates = Array.from(new Set(preferredSources));

    for (const candidate of uniqueCandidates) {
      try {
        if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
          try {
            fs.mkdirSync(path.dirname(workspaceCandidate), { recursive: true });
            fs.copyFileSync(candidate, workspaceCandidate);
            try {
              fs.chmodSync(workspaceCandidate, 0o755);
            } catch {
              // ignore chmod failures on non-posix filesystems
            }
            return {
              command: workspaceCandidate,
              found: true,
              searched: uniqueCandidates,
              staged: true
            };
          } catch {
            // fallback to original candidate if staging fails
            return { command: candidate, found: true, searched: uniqueCandidates };
          }
        }
      } catch {
        // ignore filesystem races
      }
    }

    if (allowSystemFallback) {
      try {
        const result = spawnSync(fallback, ["-version"], { stdio: "ignore" });
        if (result.status === 0) {
          return { command: fallback, found: true, searched: uniqueCandidates.concat(fallback) };
        }
      } catch {
        // ignore spawn failures and fall through to not found
      }
    }

    return { command: fallback, found: false, searched: uniqueCandidates.concat(fallback) };
  }

  const workspaceBin = path.join(app.getPath("userData"), WORK_ROOT_NAME, "bin");
  const workspaceCandidate = path.join(workspaceBin, exeName);

  const preferredSources: string[] = [];
  if (process.resourcesPath) {
    preferredSources.push(
      path.join(process.resourcesPath, "mac-bin", exeName),
      path.join(process.resourcesPath, exeName)
    );
  }

  preferredSources.push(
    path.join(app.getAppPath(), "buildResources", "mac-bin", exeName),
    path.join(app.getAppPath(), "buildResources", exeName),
    path.join(app.getAppPath(), exeName),
    path.join(__dirname, "../../../buildResources", "mac-bin", exeName),
    path.join(__dirname, "../../../buildResources", exeName),
    workspaceCandidate
  );

  const uniqueCandidates = Array.from(new Set(preferredSources));

  for (const candidate of uniqueCandidates) {
    try {
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
        try {
          fs.mkdirSync(path.dirname(workspaceCandidate), { recursive: true });
          fs.copyFileSync(candidate, workspaceCandidate);
          try {
            fs.chmodSync(workspaceCandidate, 0o755);
          } catch {
            // ignore chmod failures on non-posix filesystems
          }
          return {
            command: workspaceCandidate,
            found: true,
            searched: uniqueCandidates,
            staged: true
          };
        } catch {
          // fallback to original candidate if staging fails
          return { command: candidate, found: true, searched: uniqueCandidates };
        }
      }
    } catch {
      // ignore filesystem races
    }
  }

  const fallbackAllowed = options.allowSystemFallback !== false;

  if (fallbackAllowed) {
    return { command: fallback, found: false, searched: uniqueCandidates };
  }

  return { command: "", found: false, searched: uniqueCandidates };
}
