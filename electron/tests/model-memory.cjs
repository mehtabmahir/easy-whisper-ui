const { test } = require('node:test');
const assert = require('node:assert/strict');
const { modelMemoryStatus } = require('../dist/main/services/modelCatalog');
const hardware = (gpus, ramGiB = 16) => ({ cpu: 'CPU', ramGiB, gpus });

test('VRAM colors handle exceeded, exact capacity, and 1 GB headroom', () => {
  const info = hardware([{ name: 'Dedicated GPU', memoryKind: 'dedicated', memoryGiB: 4 }]);
  assert.equal(modelMemoryStatus(4.1, info), 'red');
  assert.equal(modelMemoryStatus(4, info), 'yellow');
  assert.equal(modelMemoryStatus(3.1, info), 'yellow');
  assert.equal(modelMemoryStatus(3, info), 'green');
  assert.equal(modelMemoryStatus(undefined, info), 'unknown');
  assert.equal(modelMemoryStatus(1, hardware([])), 'unknown');
});

test('integrated GPUs use 70 percent of RAM, not their small reserved VRAM', () => {
  for (const gpu of [
    { name: 'Intel(R) UHD Graphics 770', memoryKind: 'dedicated', memoryGiB: 0.125 },
    { name: 'AMD Radeon(TM) 780M Graphics', memoryKind: 'dedicated', memoryGiB: 0.5 },
    { name: 'Apple M4', memoryKind: 'unified', memoryGiB: 16 }
  ]) {
    assert.equal(modelMemoryStatus(10, hardware([gpu])), 'green');
    assert.equal(modelMemoryStatus(11, hardware([gpu])), 'yellow');
    assert.equal(modelMemoryStatus(12, hardware([gpu])), 'red');
  }
});

test('dedicated Intel cards stay dedicated and adapters are never summed', () => {
  const gpu = { name: 'Intel Arc A380', memoryKind: 'dedicated', memoryGiB: 6 };
  assert.equal(modelMemoryStatus(7, hardware([gpu, gpu], 64)), 'red');
  assert.equal(modelMemoryStatus(1, hardware([{ name: 'Unknown GPU', memoryKind: 'unknown' }])), 'unknown');
});
