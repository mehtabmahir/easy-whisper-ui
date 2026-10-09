const { test } = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const originalLoad = Module._load;
Module._load = function(name, ...args) {
  if (name === 'electron') return { app: {} };
  return originalLoad.call(this, name, ...args);
};
const { classifyGpuProbe } = require('../dist/main/services/gpuReadiness');
Module._load = originalLoad;

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
