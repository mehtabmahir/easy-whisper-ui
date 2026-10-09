import { execFile } from "node:child_process";
import { promisify } from "node:util";
import os from "node:os";
import path from "node:path";
import fsp from "node:fs/promises";
import type { HardwareInfo, GpuInfo } from "../../types/easy-whisper";

const exec = promisify(execFile);
const GIB = 1024 ** 3;

export function parseMemory(value: unknown): number | undefined {
  const match = String(value ?? "").match(/([\d.,]+)\s*(GB|MB|GiB|MiB)/i);
  if (!match) return undefined;
  const amount = Number(match[1].replace(/,/g, ""));
  return amount > 0 ? amount / (/^m/i.test(match[2]) ? 1024 : 1) : undefined;
}

export function macGpus(data: any, ramGiB: number): GpuInfo[] {
  return (data.SPDisplaysDataType ?? []).map((gpu: any) => {
    const name = String(gpu.sppci_model ?? gpu._name ?? "Unknown GPU");
    const unified = /^Apple\s+M\d/i.test(name);
    return {
      name,
      memoryGiB: unified ? ramGiB : parseMemory(gpu.spdisplays_vram ?? gpu.spdisplays_vram_shared),
      memoryKind: unified ? "unified" : gpu.spdisplays_vram_shared ? "shared" : "dedicated",
      metal: typeof gpu.spdisplays_metal === "string" && !/unsupported|not_supported/i.test(gpu.spdisplays_metal)
    };
  });
}

export function windowsGpus(data: any): GpuInfo[] {
  return (Array.isArray(data) ? data : data ? [data] : []).map((gpu: any) => ({
    name: String(gpu.name || "Unknown GPU"),
    // DxDiag separates dedicated VRAM from shared RAM; WMI AdapterRAM can overflow at 4 GB.
    memoryGiB: parseMemory(gpu.dedicated),
    memoryKind: "dedicated" as const
  }));
}

export async function getHardwareInfo(): Promise<HardwareInfo> {
  const info: HardwareInfo = { cpu: os.cpus()[0]?.model.trim() || "CPU", ramGiB: os.totalmem() / GIB, gpus: [] };
  try {
    if (process.platform === "darwin") {
      const { stdout } = await exec("/usr/sbin/system_profiler", ["SPDisplaysDataType", "-json"], { timeout: 15000, maxBuffer: 2 * 1024 * 1024 });
      info.gpus = macGpus(JSON.parse(stdout), info.ramGiB);
    } else if (process.platform === "win32") {
      const temp = await fsp.mkdtemp(path.join(os.tmpdir(), "easy-whisper-gpu-"));
      try {
        const report = path.join(temp, "display.xml");
        await exec("dxdiag.exe", ["/whql:off", "/x", report], { timeout: 25000, windowsHide: true });
        const script = `$ErrorActionPreference='Stop'; [xml]$report=Get-Content -LiteralPath '${report.replace(/'/g, "''")}'; @($report.DxDiag.DisplayDevices.DisplayDevice | ForEach-Object { @{name=$_.CardName; dedicated=$_.DedicatedMemory} }) | ConvertTo-Json -Compress`;
        const { stdout } = await exec("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], { timeout: 10000, windowsHide: true });
        info.gpus = windowsGpus(JSON.parse(stdout));
      } finally {
        await fsp.rm(temp, { recursive: true, force: true });
      }
    } else {
      const { stdout } = await exec("lspci", [], { timeout: 5000 });
      info.gpus = stdout.split("\n").filter(line => /VGA compatible controller|3D controller|Display controller/i.test(line))
        .map(line => ({ name: line.replace(/^.*?(?:VGA compatible controller|3D controller|Display controller):\s*/i, ""), memoryKind: "unknown" as const }));
    }
    if (!info.gpus.length) info.note = "GPU information unavailable. This does not necessarily mean CPU-only hardware.";
  } catch {
    info.note = "GPU detection unavailable. See transcription output for the backend in use.";
  }
  return info;
}
