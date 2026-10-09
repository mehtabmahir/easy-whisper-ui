import { execFile } from "node:child_process";
import { promisify } from "node:util";
import os from "node:os";
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
  const adapters: any[] = Array.isArray(data) ? data : data ? [data] : [];
  const seen = new Set<string>();
  return adapters.flatMap((gpu): GpuInfo[] => {
    const id = String(gpu.pnpDeviceId ?? "").trim().toLowerCase();
    // Enumerate adapters, not displays. ROOT/SWD display drivers are not compute GPUs.
    if (!/^(?:pci|acpi)\\/.test(id) || seen.has(id)) return [];
    seen.add(id);
    const bytes = Number(gpu.dedicatedBytes);
    // Use the driver's 64-bit value; WMI AdapterRAM can overflow at 4 GB.
    // Missing driver metadata stays unknown rather than borrowing another card's VRAM.
    const memoryGiB = Number.isFinite(bytes) && bytes > 0 ? bytes / GIB : undefined;
    return [{ name: String(gpu.name || "Unknown GPU"), memoryGiB, memoryKind: memoryGiB === undefined ? "unknown" : "dedicated" }];
  });
}

export async function getHardwareInfo(): Promise<HardwareInfo> {
  const info: HardwareInfo = { cpu: os.cpus()[0]?.model.trim() || "CPU", ramGiB: os.totalmem() / GIB, gpus: [] };
  try {
    if (process.platform === "darwin") {
      const { stdout } = await exec("/usr/sbin/system_profiler", ["SPDisplaysDataType", "-json"], { timeout: 15000, maxBuffer: 2 * 1024 * 1024 });
      info.gpus = macGpus(JSON.parse(stdout), info.ramGiB);
    } else if (process.platform === "win32") {
      const script = String.raw`
        $ErrorActionPreference='Stop'
        @(Get-CimInstance Win32_VideoController | ForEach-Object {
          $memory=$null
          try {
            $driver=(Get-ItemProperty -LiteralPath ('Registry::HKEY_LOCAL_MACHINE\SYSTEM\CurrentControlSet\Enum\'+$_.PNPDeviceID)).Driver
            if ($driver) {
              $memory=(Get-ItemProperty -LiteralPath ('Registry::HKEY_LOCAL_MACHINE\SYSTEM\CurrentControlSet\Control\Class\'+$driver)).'HardwareInformation.qwMemorySize'
              if ($memory -is [byte[]]) {
                if ($memory.Length -eq 8) { $memory=[BitConverter]::ToUInt64($memory,0) } else { $memory=$null }
              }
            }
          } catch { $memory=$null }
          @{name=$_.Name; pnpDeviceId=$_.PNPDeviceID; dedicatedBytes=$memory}
        }) | ConvertTo-Json -Compress
      `;
      const { stdout } = await exec("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], { timeout: 5000, windowsHide: true });
      info.gpus = windowsGpus(stdout.trim() ? JSON.parse(stdout) : []);
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
