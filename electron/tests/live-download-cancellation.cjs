const { test } = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const originalLoad = Module._load;
Module._load = function(name, ...args) {
  if (name === 'electron') return { app: { getPath: () => '/unused-test-profile' } };
  if (name === './binaryResolver') return { resolveBinary: () => ({ found: true, command: '/unused-whisper-stream' }) };
  return originalLoad.call(this, name, ...args);
};
const { LiveManager } = require('../dist/main/services/liveManager');
Module._load = originalLoad;

test('stopping Live aborts model preparation and never starts the process', async () => {
  let signal;
  const manager = new LiveManager(async (_, suppliedSignal) => {
    signal = suppliedSignal;
    await new Promise((_, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }));
  });
  const pending = manager.start({ settings: { model: 'tiny', language: 'en' }, stepMs: 3000, lengthMs: 10000 });
  const cancelled = assert.rejects(pending, { name: 'AbortError' });
  await manager.stop();
  await cancelled;
  assert.equal(signal.aborted, true);
  assert.equal(manager.proc, undefined);
  assert.equal(manager.preparing, undefined);
});
