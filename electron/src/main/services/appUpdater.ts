import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import type { AppUpdateState } from '../../types/easy-whisper';

const REPO = 'mehtabmahir/easy-whisper-ui';
const API = `https://api.github.com/repos/${REPO}/releases/latest`;
type Asset = { name: string; size: number; digest: string; browser_download_url: string };
type Release = { tag_name: string; draft: boolean; prerelease: boolean; assets: Asset[] };
function version(value: string): number[] | undefined {
  const match = /^v?(\d+)\.(\d+)(?:\.(\d+))?$/.exec(value);
  return match ? [Number(match[1]), Number(match[2]), Number(match[3] ?? 0)] : undefined;
}
export function selectUpdate(release: Release, current: string, platform: string, arch: string): { version: string; asset: Asset } | undefined {
  if (release.draft || release.prerelease) return;
  const next = version(release.tag_name), installed = version(current);
  if (!next || !installed) throw new Error('Could not compare release versions.');
  const difference = next.findIndex((value, i) => value !== installed[i]);
  if (difference < 0 || next[difference] < installed[difference]) return;
  if (!['darwin', 'win32'].includes(platform) || !['arm64', 'x64'].includes(arch)) throw new Error('Updates are not available for this platform yet.');
  const number = next.join('.');
  const name = platform === 'darwin' ? `EasyWhisperUI-${number}-macOS-${arch}.dmg` : `EasyWhisperUI-Setup-${number}-win-${arch}.exe`;
  const asset = release.assets?.find(item => item.name === name);
  if (!asset) throw new Error(`Version ${number} has no installer for this device yet.`);
  if (!/^sha256:[a-f0-9]{64}$/i.test(asset.digest ?? '') || !Number.isSafeInteger(asset.size) || asset.size <= 0 || asset.size > 4 * 1024 ** 3) throw new Error('This release does not have valid download verification information.');
  const url = new URL(asset.browser_download_url);
  if (url.origin !== 'https://github.com' || url.username || url.password || url.search || url.hash ||
      url.pathname !== `/${REPO}/releases/download/${release.tag_name}/${name}`) throw new Error('Invalid release download address.');
  return { version: number, asset: { ...asset } };
}

async function downloadResponse(url: string, signal: AbortSignal): Promise<Response> {
  for (let count = 0; count < 6; count++) {
    const address = new URL(url);
    if (address.protocol !== 'https:' || address.port || address.username || address.password || !['github.com', 'release-assets.githubusercontent.com', 'objects.githubusercontent.com'].includes(address.hostname)) throw new Error('Unexpected download destination.');
    const response = await fetch(url, { signal, redirect: 'manual' });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      await response.body?.cancel();
      if (!location) throw new Error('Download redirect was incomplete.');
      url = new URL(location, url).href;
    } else return response;
  }
  throw new Error('Too many download redirects.');
}

type Options = {
  current: string; platform: string; arch: string; directory: string;
  busy: () => boolean;
  // Must acquire the installation lock before its first await, then open and quit.
  handoff: (file: string) => Promise<void>;
  emit: (state: AppUpdateState) => void;
};
export class AppUpdater {
  private selected?: { version: string; asset: Asset };
  private controller?: AbortController;
  private checking?: Promise<void>;
  private state: AppUpdateState;
  constructor(private options: Options) { this.state = { status: 'idle', currentVersion: options.current }; }
  snapshot() { return { ...this.state }; }
  private update(patch: Partial<AppUpdateState>) { this.state = { ...this.state, ...patch }; this.options.emit(this.snapshot()); }
  check(): Promise<void> {
    if (this.controller) return Promise.resolve();
    if (this.checking) return this.checking;
    this.checking = this.performCheck().finally(() => { this.checking = undefined; });
    return this.checking;
  }
  private async performCheck() {
    this.selected = undefined;
    this.update({ status: 'checking', version: undefined, message: undefined, receivedBytes: undefined, totalBytes: undefined });
    try {
      if (!['darwin', 'win32'].includes(this.options.platform)) throw new Error('Updates are available for Windows and macOS.');
      const response = await fetch(API, { signal: AbortSignal.timeout(15000), redirect: 'error', headers: { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' } });
      if (!response.ok) throw new Error(response.status === 403 || response.status === 429 ? 'GitHub is limiting update checks. Try again later.' : `Could not check for updates (HTTP ${response.status}).`);
      this.selected = selectUpdate(await response.json() as Release, this.options.current, this.options.platform, this.options.arch);
      this.update(this.selected ? { status: 'available', version: this.selected.version, totalBytes: this.selected.asset.size } : { status: 'current' });
    } catch (error) { this.update({ status: 'error', message: (error as Error).message }); }
  }
  cancel() { this.controller?.abort(); }
  async install(): Promise<void> {
    if (this.controller || this.checking || !this.selected) return;
    const selected = this.selected;
    const controller = new AbortController();
    this.controller = controller;
    let folder: string | undefined;
    let opened = false;
    try {
      this.update({ status: 'downloading', receivedBytes: 0, message: undefined });
      await fs.mkdir(this.options.directory, { recursive: true });
      folder = await fs.mkdtemp(path.join(this.options.directory, 'update-'));
      const partial = path.join(folder, 'download.partial');
      const response = await downloadResponse(selected.asset.browser_download_url, AbortSignal.any([controller.signal, AbortSignal.timeout(60 * 60 * 1000)]));
      if (!response.ok || !response.body) throw new Error('Could not download the update. Please retry.');
      const hash = createHash('sha256');
      let received = 0, lastProgress = 0;
      const file = await fs.open(partial, 'wx', 0o600);
      try {
        for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
          controller.signal.throwIfAborted();
          received += chunk.length;
          if (received > selected.asset.size) throw new Error('Update download exceeded its expected size.');
          hash.update(chunk); await file.writeFile(chunk);
          if (Date.now() - lastProgress > 200) { this.update({ receivedBytes: received }); lastProgress = Date.now(); }
        }
      } finally { await file.close(); }
      this.update({ status: 'verifying', receivedBytes: received });
      if (received !== selected.asset.size || hash.digest('hex').toLowerCase() !== selected.asset.digest.slice(7).toLowerCase()) throw new Error('Update verification failed. The installer was not opened.');
      const installer = path.join(folder, selected.asset.name);
      await fs.rename(partial, installer);
      if (this.options.busy()) this.update({ status: 'waiting', message: 'Update ready. Waiting for the current task to finish…' });
      while (this.options.busy()) {
        await new Promise<void>((resolve, reject) => {
          const abort = () => { clearTimeout(timer); reject(new Error('Canceled')); };
          const timer = setTimeout(() => { controller.signal.removeEventListener('abort', abort); resolve(); }, 500);
          controller.signal.addEventListener('abort', abort, { once: true });
          if (controller.signal.aborted) abort();
        });
      }
      controller.signal.throwIfAborted();
      this.update({ status: 'opening', message: 'Opening installer…' });
      await this.options.handoff(installer);
      opened = true;
    } catch (error) {
      this.update(controller.signal.aborted ? { status: 'available', receivedBytes: undefined, message: 'Update canceled.' } : { status: 'error', message: (error as Error).message });
    } finally {
      this.controller = undefined;
      if (folder && !opened) await fs.rm(folder, { recursive: true, force: true }).catch(() => {});
    }
  }
}
