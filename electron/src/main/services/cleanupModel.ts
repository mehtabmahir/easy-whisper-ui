import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import path from 'node:path';
export const MODEL_FILE = 'qwen2.5-0.5b-instruct-q4_k_m.gguf';
export const MODEL_BYTES = 491400032;
const MODEL_HASH = '74a4da8c9fdbcd15bd1f6d01d621410d31c6fc00986f5eb687824e7b93d7a9db';
const MODEL_URL = `https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct-GGUF/resolve/9217f5db79a29953eb74d5343926648285ec7e67/${MODEL_FILE}`;
async function digest(file: string, signal: AbortSignal) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) { signal.throwIfAborted(); hash.update(chunk); }
  return hash.digest('hex');
}
export async function ensureCleanupModel(root: string, signal: AbortSignal, progress: (message: string) => void): Promise<string> {
  await fs.mkdir(root, { recursive: true });
  const target = path.join(root, MODEL_FILE);
  if ((await fs.stat(target).catch(() => undefined))?.size === MODEL_BYTES) {
    progress('Verifying local model…');
    if (await digest(target, signal) === MODEL_HASH) return target;
  }
  const partial = target + '.partial';
  progress('Downloading tiny model · 491 MB · one time');
  try {
    const response = await fetch(MODEL_URL, { signal: AbortSignal.any([signal, AbortSignal.timeout(20 * 60 * 1000)]) });
    if (!response.ok || !response.body) throw new Error(`Model download failed (${response.status}). Try again when connected.`);
    const file = await fs.open(partial, 'w', 0o600);
    const hash = createHash('sha256');
    let bytes = 0, lastUpdate = 0;
    try {
      for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
        signal.throwIfAborted();
        bytes += chunk.length;
        if (bytes > MODEL_BYTES) throw new Error('Model download exceeded its expected size.');
        hash.update(chunk);
        await file.writeFile(chunk);
        if (Date.now() - lastUpdate > 300) {
          progress(`Downloading tiny model · ${Math.round(bytes / MODEL_BYTES * 100)}%`);
          lastUpdate = Date.now();
        }
      }
    } finally { await file.close(); }
    if (bytes !== MODEL_BYTES || hash.digest('hex') !== MODEL_HASH) throw new Error('Model verification failed. Please retry the download.');
    signal.throwIfAborted();
    await fs.rename(partial, target);
    return target;
  } finally { await fs.rm(partial, { force: true }); }
}
