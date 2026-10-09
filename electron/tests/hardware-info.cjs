const { test } = require('node:test');
const assert = require('node:assert/strict');
const { macGpus, windowsGpus, parseMemory } = require('../dist/main/services/hardwareInfo');

test('Apple Silicon reports system memory as unified, not dedicated VRAM', () => {
  const [gpu] = macGpus({ SPDisplaysDataType: [{ sppci_model: 'Apple M1 Pro', spdisplays_metal: 'spdisplays_supported' }] }, 16);
  assert.equal(gpu.name, 'Apple M1 Pro');
  assert.equal(gpu.memoryKind, 'unified');
  assert.equal(gpu.memoryGiB, 16);
  assert.equal(gpu.metal, true);
});

test('Mac dedicated and shared memory stay distinct', () => {
  const gpus = macGpus({ SPDisplaysDataType: [
    { sppci_model: 'AMD Radeon', spdisplays_vram: '8 GB' },
    { sppci_model: 'Intel Iris', spdisplays_vram_shared: '1536 MB' }
  ] }, 32);
  assert.equal(gpus[0].memoryGiB, 8);
  assert.equal(gpus[0].memoryKind, 'dedicated');
  assert.equal(gpus[1].memoryGiB, 1.5);
  assert.equal(gpus[1].memoryKind, 'shared');
});

test('Windows uses dedicated VRAM over 4 GB without counting shared RAM', () => {
  const gpus = windowsGpus([{ name: 'NVIDIA RTX', dedicated: '24564 MB', shared: '32768 MB' }, { name: 'Intel', dedicated: '' }]);
  assert.ok(gpus[0].memoryGiB > 23);
  assert.ok(gpus[0].memoryGiB < 24);
  assert.equal(gpus[1].memoryGiB, undefined);
  assert.equal(windowsGpus({ name: 'AMD', dedicated: '8 GB' })[0].memoryGiB, 8);
});

test('missing or invalid memory remains unknown', () => {
  assert.equal(parseMemory('N/A'), undefined);
  assert.equal(parseMemory('0 MB'), undefined);
  assert.equal(parseMemory('16,384 MB'), 16);
  assert.deepEqual(macGpus({}, 16), []);
  assert.deepEqual(windowsGpus(null), []);
});
