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
  const gpus = windowsGpus([{ name: 'NVIDIA RTX', pnpDeviceId: 'PCI\\NVIDIA', dedicatedBytes: 24564 * 1024 ** 2, shared: '32768 MB' }, { name: 'Intel', pnpDeviceId: 'PCI\\INTEL' }]);
  assert.ok(gpus[0].memoryGiB > 23);
  assert.ok(gpus[0].memoryGiB < 24);
  assert.equal(gpus[1].memoryGiB, undefined);
  assert.equal(windowsGpus({ name: 'AMD', pnpDeviceId: 'PCI\\AMD', dedicatedBytes: 8 * 1024 ** 3 })[0].memoryGiB, 8);
});

test('missing or invalid memory remains unknown', () => {
  assert.equal(parseMemory('N/A'), undefined);
  assert.equal(parseMemory('0 MB'), undefined);
  assert.equal(parseMemory('16,384 MB'), 16);
  assert.deepEqual(macGpus({}, 16), []);
  assert.deepEqual(windowsGpus(null), []);
});

test('Windows counts physical adapters, not monitors or display-only drivers sharing their VRAM', () => {
  const card = { name: 'AMD Radeon RX 9070 XT', dedicatedBytes: 16191 * 1024 ** 2, pnpDeviceId: 'PCI\\VEN_1002&DEV_7550\\INSTANCE_1' };
  const gpus = windowsGpus([card, card,
    { ...card, name: 'Virtual Display Driver', pnpDeviceId: 'ROOT\\DISPLAY\\0001' },
    { ...card, name: 'Meta Virtual Monitor', pnpDeviceId: 'ROOT\\DISPLAY\\0000' }]);
  assert.equal(gpus.length, 1);
  assert.equal(gpus[0].name, card.name);
  assert.equal(gpus[0].memoryGiB, 16191 / 1024);
});

test('Windows preserves two identical physical cards and never borrows VRAM by name', () => {
  const gpus = windowsGpus([
    { name: 'Radeon', pnpDeviceId: 'PCI\\VEN_1002&DEV_1\\A', dedicatedBytes: 8 * 1024 ** 3 },
    { name: 'Radeon', pnpDeviceId: 'PCI\\VEN_1002&DEV_1\\B', dedicatedBytes: 8 * 1024 ** 3 },
    { name: 'Radeon', pnpDeviceId: 'PCI\\VEN_1002&DEV_2\\C' }
  ]);
  assert.deepEqual(gpus.map(gpu => gpu.memoryGiB), [8, 8, undefined]);
});

test('invalid driver memory stays unknown and software adapters are excluded regardless of name', () => {
  for (const dedicatedBytes of [null, 0, -1, 'invalid']) {
    assert.equal(windowsGpus({ name: 'GPU', pnpDeviceId: 'PCI\\GPU', dedicatedBytes })[0].memoryGiB, undefined);
  }
  assert.deepEqual(windowsGpus([{ name: 'Streaming adapter', pnpDeviceId: 'SWD\\DISPLAY' }, { name: 'Remote', pnpDeviceId: 'ROOT\\DISPLAY' }]), []);
});
