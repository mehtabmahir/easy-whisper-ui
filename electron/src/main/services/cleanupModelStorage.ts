import { app } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import { CLEANUP_MODELS } from './cleanupModelCatalog';
import type { DownloadedModel } from '../../types/easy-whisper';
export const cleanupModelsDirectory = () => path.join(app.getPath('userData'), 'whisper-workspace', 'cleanup-models');
async function filesFor(id: string) {
  const model = CLEANUP_MODELS.find(model => model.id === id);
  if (!model) throw new Error('Invalid model selection.');
  const root = cleanupModelsDirectory();
  const folder = await fs.lstat(root).catch(error => { if (error.code === 'ENOENT') return undefined; throw error; });
  if (!folder) return [];
  if (!folder.isDirectory() || folder.isSymbolicLink()) throw new Error('Invalid models folder.');
  const files = [];
  for (const file of model.files) {
    const target = path.join(root, file.name);
    const stat = await fs.lstat(target).catch(error => { if (error.code === 'ENOENT') return undefined; throw error; });
    if (!stat) continue;
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('Invalid downloaded model file.');
    files.push({ target, bytes: stat.size });
  }
  return files;
}
export async function listCleanupModels(): Promise<DownloadedModel[]> {
  const models: DownloadedModel[] = [];
  for (const model of CLEANUP_MODELS) {
    const files = await filesFor(model.id);
    if (files.length) models.push({ file: model.id, name: model.label + (files.length < model.files.length ? ' (incomplete)' : ''), bytes: files.reduce((sum, file) => sum + file.bytes, 0) });
  }
  return models;
}
export async function deleteCleanupModel(id: string): Promise<void> {
  for (const file of await filesFor(id)) await fs.unlink(file.target);
}
