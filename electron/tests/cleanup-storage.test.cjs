const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const Module = require('node:module');
let root;
const load = Module._load;
Module._load = function(name, ...args) { return name === 'electron' ? { app: { getPath: () => root } } : load.call(this, name, ...args); };
const storage = require('../dist/main/services/cleanupModelStorage');
Module._load = load;
const { CLEANUP_MODELS } = require('../dist/main/services/cleanupModelCatalog');
test('LLM management lists and deletes every shard without touching unrelated files', async () => {
 root = await fs.mkdtemp(path.join(os.tmpdir(), 'llm-storage-'));
 try {
  assert.deepEqual(await storage.listCleanupModels(), []);
  const folder = storage.cleanupModelsDirectory();
  await fs.mkdir(folder, { recursive: true });
  const model = CLEANUP_MODELS.find(m => m.id === 'qwen-7b');
  for (const file of model.files) await fs.writeFile(path.join(folder, file.name), 'test');
  await fs.writeFile(path.join(folder, 'custom.gguf'), 'keep');
  const list = await storage.listCleanupModels();
  assert.equal(list[0].file, model.id);
  assert.equal(list[0].bytes, 8);
  await assert.rejects(storage.deleteCleanupModel('../custom.gguf'), /Invalid/);
  await storage.deleteCleanupModel(model.id);
  assert.deepEqual(await storage.listCleanupModels(), []);
  assert.equal(await fs.readFile(path.join(folder, 'custom.gguf'), 'utf8'), 'keep');
 } finally { await fs.rm(root, { recursive: true, force: true }); }
});
