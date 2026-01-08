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

    const candidates: string[] = [workspaceCandidate, toolchainExe];

    if (process.resourcesPath) {
      candidates.push(
        path.join(process.resourcesPath, exeName),
        path.join(process.resourcesPath, "mac-bin", exeName)
      );
    }

    const appPath = app.getAppPath();
    candidates.push(
      path.join(appPath, exeName),
      path.join(appPath, "buildResources", exeName),
      path.join(appPath, "buildResources", "mac-bin", exeName),
      path.join(__dirname, "../../../buildResources", exeName),
      path.join(__dirname, "../../../buildResources", "mac-bin", exeName)
    );

    const uniqueCandidates = Array.from(new Set(candidates));

    for (const candidate of uniqueCandidates) {
      try {
        if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
          if (candidate !== workspaceCandidate) {
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

          return { command: candidate, found: true, searched: uniqueCandidates };
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

  const candidates: string[] = [];

  const workspaceBin = path.join(app.getPath("userData"), WORK_ROOT_NAME, "bin");

  const workspaceCandidate = path.join(workspaceBin, exeName);
  candidates.push(workspaceCandidate);

  if (process.resourcesPath) {
    candidates.push(path.join(process.resourcesPath, exeName));
    candidates.push(path.join(process.resourcesPath, "mac-bin", exeName));
  }

  candidates.push(
    path.join(app.getAppPath(), exeName),
    path.join(app.getAppPath(), "buildResources", exeName),
    path.join(app.getAppPath(), "buildResources", "mac-bin", exeName),
    path.join(__dirname, "../../../buildResources", exeName),
    path.join(__dirname, "../../../buildResources", "mac-bin", exeName)
  );

  const uniqueCandidates = Array.from(new Set(candidates));

  for (const candidate of uniqueCandidates) {
    try {
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
        if (candidate !== workspaceCandidate) {
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

        return { command: candidate, found: true, searched: uniqueCandidates };
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
