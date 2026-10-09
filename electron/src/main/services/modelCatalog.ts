import type { HardwareInfo } from "../../types/easy-whisper";

// Shared by the model picker and main-process download validation.
export const DOWNLOADABLE_MODELS = [
  "large-v3", "large-v3-turbo", "medium", "medium.en", "small", "small.en",
  "base", "base.en", "tiny", "tiny.en", "tiny.en-q5_1"
];

export function modelMemoryStatus(requiredGiB: number | undefined, hardware?: HardwareInfo): "unknown" | "red" | "yellow" | "green" {
  if (requiredGiB === undefined || !hardware) return "unknown";
  const capacities = hardware.gpus.flatMap(gpu => {
    const name = gpu.name.replace(/\(R\)|\(TM\)/gi, "");
    const integrated = gpu.memoryKind === "shared" || gpu.memoryKind === "unified"
      || /Intel.*(?:UHD|HD Graphics|Iris|Arc\s+\d{3}V|Arc.*integrated)|^Intel\s+Graphics$|Radeon\s+(?:Graphics|Vega\s*\d*|[6789]\d{2}M|80[56]0S)\b/i.test(name);
    const capacity = integrated ? hardware.ramGiB * 0.7 : gpu.memoryGiB;
    return capacity !== undefined && Number.isFinite(capacity) && capacity > 0 ? [capacity] : [];
  });
  if (!capacities.length) return "unknown";
  // Separate adapters do not pool their memory.
  const remaining = Math.max(...capacities) - requiredGiB;
  return remaining < 0 ? "red" : remaining < 1 ? "yellow" : "green";
}
