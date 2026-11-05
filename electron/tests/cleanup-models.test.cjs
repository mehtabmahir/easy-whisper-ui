const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { CLEANUP_MODELS, cleanupModel } = require('../dist/main/services/cleanupModelCatalog');
const { ensureCleanupModel } = require('../dist/main/services/cleanupModel');
test('catalog has verified official models up to 8 GB, including all shards', () => {
  assert.equal(CLEANUP_MODELS.length, 3);
  for (const model of CLEANUP_MODELS) {
    assert.match(model.repo, /^Qwen\//);
    assert.match(model.revision, /^[a-f0-9]{40}$/);
    assert.ok(model.files.reduce((n, f) => n + f.bytes, 0) < 8e9);
    for (const file of model.files) assert.match(file.sha256, /^[a-f0-9]{64}$/);
  }
  assert.equal(cleanupModel('qwen-1.5b').id, 'qwen-3b');
  assert.equal(cleanupModel().id, 'qwen-3b');
  assert.equal(cleanupModel('qwen-0.5b').id, 'qwen-3b');
  assert.equal(cleanupModel('qwen-7b').id, 'qwen-7b');
  assert.throws(() => cleanupModel('unknown'), /Unknown/);
  assert.equal(cleanupModel('qwen-14b').files.length, 2);
});
test('multipart download verifies every shard and reuses completed files', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cleanup-shards-'));
  const fetch = global.fetch;
  const data = Buffer.from('GGUFtest');
  const files = [1, 2].map(i => ({ name: `test-${i}.gguf`, bytes: data.length, sha256: createHash('sha256').update(data).digest('hex') }));
  CLEANUP_MODELS.push({ id: 'test', repo: 'test', revision: 'revision', label: 'Test', files });
  let calls = 0;
  try {
    global.fetch = async () => { calls++; return { ok: true, body: (async function* () { yield data; })() }; };
    assert.equal(await ensureCleanupModel(root, new AbortController().signal, () => {}, 'test'), path.join(root, files[0].name));
    assert.equal(calls, 2);
    await ensureCleanupModel(root, new AbortController().signal, () => {}, 'test');
    assert.equal(calls, 2);
    await fs.writeFile(path.join(root, files[1].name), 'bad');
    global.fetch = async () => ({ ok: true, body: (async function* () { yield Buffer.from('bad-data'); })() });
    await assert.rejects(ensureCleanupModel(root, new AbortController().signal, () => {}, 'test'), /verification/);
    await assert.rejects(fs.stat(path.join(root, files[1].name + '.partial')), /ENOENT/);
  } finally { CLEANUP_MODELS.pop(); global.fetch = fetch; await fs.rm(root, { recursive: true, force: true }); }
});

test('automatic default reuses GPU memory rules without pooling adapters or falling back to system RAM', () => {
 const { recommendedCleanupModel } = require('../dist/main/services/cleanupModelCatalog');
 const gpu = (memoryGiB, memoryKind = 'dedicated', name = 'NVIDIA GPU') => ({name, memoryGiB, memoryKind});
 const pick = (gpus, ramGiB = 64) => recommendedCleanupModel({cpu: 'test', ramGiB, gpus}).id;
 assert.equal(pick([gpu(4)]), 'qwen-3b');
 assert.equal(pick([gpu(6)]), 'qwen-7b');
 assert.equal(pick([gpu(10)]), 'qwen-14b');
 assert.equal(pick([gpu(8)]), 'qwen-7b');
 assert.equal(pick([gpu(12)]), 'qwen-14b');
 assert.equal(pick([gpu(16)]), 'qwen-14b');
 assert.equal(pick([gpu(8), gpu(8)]), 'qwen-7b');
 assert.equal(pick([gpu(undefined)]), 'qwen-3b');
 assert.equal(pick([]), 'qwen-3b');
 assert.equal(pick([gpu(32, 'unified', 'Apple M1')], 32), 'qwen-14b');
 assert.equal(pick([gpu(1, 'dedicated', 'Intel UHD Graphics')], 24), 'qwen-14b');
 assert.equal(pick([gpu(16, 'unified', 'Apple M1')], 16), 'qwen-14b');
});
