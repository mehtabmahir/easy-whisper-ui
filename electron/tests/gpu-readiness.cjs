const { test } = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const originalLoad = Module._load;
Module._load = function(name, ...args) {
  if (name === 'electron') return { app: {} };
  return originalLoad.call(this, name, ...args);
};
const { classifyGpuProbe, ensureGpuCheckModel, GPU_CHECK_MODEL } = require('../dist/main/services/gpuReadiness');
Module._load = originalLoad;
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

test('GPU check downloads the small model once and repairs an empty cached file', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'gpu-model-test-'));
  try {
    let downloads = 0;
    const modelPath = path.join(dir, `ggml-${GPU_CHECK_MODEL}.bin`);
    const download = async name => {
      assert.equal(name, 'tiny.en-q5_1');
      downloads++;
      await fs.writeFile(modelPath, 'model');
    };
    assert.equal(await ensureGpuCheckModel(dir, download), modelPath);
    await ensureGpuCheckModel(dir, download);
    assert.equal(downloads, 1);
    await fs.writeFile(modelPath, '');
    await ensureGpuCheckModel(dir, download);
    assert.equal(downloads, 2);
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});

test('GPU check rejects failed downloads instead of probing an absent model', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'gpu-model-test-'));
  try {
    await assert.rejects(ensureGpuCheckModel(dir, async () => { throw new Error('offline'); }), /offline/);
    await assert.rejects(ensureGpuCheckModel(dir, async () => {}), /ENOENT/);
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});

test('GPU preference or device discovery alone never means ready', () => {
  assert.equal(classifyGpuProbe('use gpu = 1\nfound GPU device 0: Metal', true).state, 'unverified');
});
test('completed Metal or Vulkan check reports ready', () => {
  for (const name of ['Metal', 'Vulkan0']) {
    assert.equal(classifyGpuProbe(`whisper_backend_init_gpu: using ${name} backend`, true).state, 'ready');
  }
});
test('timeout or failed process never reports ready', () => {
  assert.equal(classifyGpuProbe('whisper_backend_init_gpu: using Metal backend', false).state, 'unverified');
});
test('CPU fallback overrides earlier GPU selection', () => {
  assert.equal(classifyGpuProbe('whisper_backend_init_gpu: using Metal backend\nwhisper_backend_init_gpu: failed to initialize Metal backend', true).state, 'unavailable');
  assert.equal(classifyGpuProbe('whisper_backend_init_gpu: no GPU found', true).state, 'unavailable');
});
