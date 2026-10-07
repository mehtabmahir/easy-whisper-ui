import { app } from "electron";
import fsp from "node:fs/promises";
import path from "node:path";
import { WORK_ROOT_NAME } from "./compileManager";
import type { DownloadedModel } from "../../types/easy-whisper";

const modelName = /^ggml-[a-zA-Z0-9][a-zA-Z0-9._-]*\.bin$/;

async function modelsDirectory(): Promise<string> {
  const root = path.join(app.getPath("userData"), WORK_ROOT_NAME, "models");
  const stat = await fsp.lstat(root);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("The models folder is not a regular directory.");
  return root;
}

export async function listDownloadedModels(): Promise<DownloadedModel[]> {
  let root: string;
  try { root = await modelsDirectory(); } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  const models: DownloadedModel[] = [];
  for (const file of await fsp.readdir(root)) {
    if (!modelName.test(file)) continue;
    const stat = await fsp.lstat(path.join(root, file));
    if (stat.isFile() && !stat.isSymbolicLink()) {
      models.push({ file, name: file.slice(5, -4), bytes: stat.size });
    }
  }
  return models.sort((a, b) => a.name.localeCompare(b.name));
}

export async function deleteDownloadedModel(file: unknown): Promise<void> {
  if (typeof file !== "string" || !modelName.test(file)) throw new Error("Invalid model selection.");
  const root = await modelsDirectory();
  const target = path.join(root, file);
  const stat = await fsp.lstat(target);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("Select a downloaded model file.");
  await fsp.unlink(target);
}
