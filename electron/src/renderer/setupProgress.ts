import type { CompileProgressEvent } from "../types/easy-whisper";

// Approximate shares of a full Windows install, not measured time remaining.
// Package installation, CMake and compilation receive the largest shares.
const stages: Record<string, [number, number, number]> = {
  reset: [0, 1, 5],
  git: [3, 5, 15],
  vulkan: [5, 8, 45],
  "vulkan-env": [8, 9, 5],
  ffmpeg: [9, 11, 30],
  "ffmpeg-env": [11, 12, 5],
  msys: [12, 22, 90],
  packages: [22, 50, 240],
  dependencies: [50, 50, 1],
  prepare: [50, 51, 5],
  "build-toolchain": [51, 54, 30],
  "build-packages": [54, 64, 90],
  source: [64, 66, 20],
  configure: [66, 80, 180],
  build: [80, 99, 240],
  copy: [99, 100, 5],
  // Reinstall keeps final success pending until the enclosing operation returns.
  completed: [99, 100, 1],
  "check-cache": [99, 100, 1],
  prebuilt: [99, 100, 1],
};

export function setupProgress(info: CompileProgressEvent) {
  const complete = info.state === "success" && ["completed", "check-cache", "prebuilt"].includes(info.step);
  if (complete) return { progress: 100, estimateLimit: 100, paceSeconds: 1, complete: true };
  const [start, end, paceSeconds] = stages[info.step] ?? [0, 3, 15];
  const fraction = info.state === "success" ? 1 : Math.max(0, Math.min(100, info.progress || 0)) / 100;
  return {
    progress: Math.min(99, start + (end - start) * fraction),
    estimateLimit: Math.min(99, Math.max(start, end - 0.5)),
    paceSeconds: paceSeconds / 3.75,
    complete: false,
  };
}
