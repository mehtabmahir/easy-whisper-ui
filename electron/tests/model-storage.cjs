const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const Module = require('node:module');
let userData;
const originalLoad = Module._load;
Module._load = function (name, ...args) {
  if (name === 'electron') return { app: { getPath: () => userData } };
  return originalLoad.call(this, name, ...args);
};
const { listDownloadedModels, deleteDownloadedModel } = require('../dist/main/services/modelStorage');
const { WORK_ROOT_NAME } = require('../dist/main/services/compileManager');
Module._load = originalLoad;

async function fixture(t) {
  userData = await fs.mkdtemp(path.join(os.tmpdir(), 'whisper-models-'));
  const root = userData;
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  return path.join(root, WORK_ROOT_NAME, 'models');
}

test('missing download directory returns an empty list', async t => {
  await fixture(t);
  assert.deepEqual(await listDownloadedModels(), []);
});

test('lists only model files and deletes only the selected download', async t => {
  const dir = await fixture(t);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, 'ggml-tiny.bin'), 'tiny');
  await fs.writeFile(path.join(dir, 'ggml-medium.en.bin'), 'medium');
  await fs.writeFile(path.join(dir, 'notes.txt'), 'keep');
  await fs.mkdir(path.join(dir, 'ggml-folder.bin'));
  assert.deepEqual(await listDownloadedModels(), [
    { file: 'ggml-medium.en.bin', name: 'medium.en', bytes: 6 },
    { file: 'ggml-tiny.bin', name: 'tiny', bytes: 4 }
  ]);
  await deleteDownloadedModel('ggml-tiny.bin');
  assert.deepEqual((await listDownloadedModels()).map(m => m.name), ['medium.en']);
  assert.equal(await fs.readFile(path.join(dir, 'notes.txt'), 'utf8'), 'keep');
  await assert.rejects(deleteDownloadedModel('ggml-folder.bin'), /downloaded model/);
});

test('rejects arbitrary paths and invalid selections without touching external files', async t => {
  const dir = await fixture(t);
  await fs.mkdir(dir, { recursive: true });
  const external = path.join(userData, 'ggml-custom.bin');
  await fs.writeFile(external, 'custom model');
  for (const value of [external, '../ggml-custom.bin', '..\\ggml-custom.bin', 'notes.txt', null, 42, 'ggml-x.bin/../ggml-y.bin']) {
    await assert.rejects(deleteDownloadedModel(value), /Invalid model/);
  }
  assert.equal(await fs.readFile(external, 'utf8'), 'custom model');
});
