import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import path from 'node:path';
export const MODEL_FILE = 'qwen2.5-0.5b-instruct-q4_k_m.gguf';
export const MODEL_BYTES = 491400032;
import { cleanupModel } from './cleanupModelCatalog';
async function digest(file: string, signal: AbortSignal) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) { signal.throwIfAborted(); hash.update(chunk); }
  return hash.digest('hex');
}
export async function ensureCleanupModel(root: string, signal: AbortSignal, progress: (message: string) => void, modelId?: string): Promise<string> {
  await fs.mkdir(root, { recursive: true });
  const model = cleanupModel(modelId);
  const total = model.files.reduce((sum, file) => sum + file.bytes, 0);
  let finished = 0;
  for (const entry of model.files) {
    const target = path.join(root, entry.name);
    progress(`Verifying ${model.label}…`);
    if ((await fs.stat(target).catch(() => undefined))?.size === entry.bytes && await digest(target, signal) === entry.sha256) {
      finished += entry.bytes;
      continue;
    }
    const partial = target + '.partial';
    progress(`Downloading ${model.label} · ${Math.round(finished / total * 100)}% · ${(total / 1e9).toFixed(2)} GB`);
    try {
      const response = await fetch(`https://huggingface.co/${model.repo}/resolve/${model.revision}/${entry.name}`, {
        signal: AbortSignal.any([signal, AbortSignal.timeout(2 * 60 * 60 * 1000)])
      });
      if (!response.ok || !response.body) throw new Error(`Model download failed (${response.status}). Try again when connected.`);
      const file = await fs.open(partial, 'w', 0o600);
      const hash = createHash('sha256');
      let bytes = 0, lastUpdate = 0;
      try {
        for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
          signal.throwIfAborted();
          bytes += chunk.length;
          if (bytes > entry.bytes) throw new Error('Model download exceeded its expected size.');
          hash.update(chunk);
          await file.writeFile(chunk);
          if (Date.now() - lastUpdate > 300) {
            progress(`Downloading ${model.label} · ${Math.round((finished + bytes) / total * 100)}% · ${(total / 1e9).toFixed(2)} GB`);
            lastUpdate = Date.now();
          }
        }
      } finally { await file.close(); }
      if (bytes !== entry.bytes || hash.digest('hex') !== entry.sha256) throw new Error('Model verification failed. Please retry the download.');
      signal.throwIfAborted();
      await fs.rename(partial, target);
      finished += entry.bytes;
    } finally { await fs.rm(partial, { force: true }); }
  }
  // llama.cpp discovers adjacent numbered GGUF shards from the first filename.
  return path.join(root, model.files[0].name);
}
