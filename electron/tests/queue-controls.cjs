const { test } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const Module = require('node:module');
const originalLoad = Module._load;
Module._load = function (name, ...args) {
  if (name === 'electron') return { app: {}, shell: {} };
  return originalLoad.call(this, name, ...args);
};
const { TranscriptionManager } = require('../dist/main/services/transcriptionManager');
Module._load = originalLoad;
const settings = { model: 'tiny', openAfterComplete: false };
const tick = () => new Promise(resolve => setImmediate(resolve));

test('skip stops the current transcription and runs remaining files in order', async () => {
  const manager = new TranscriptionManager();
  const started = [];
  let rejectCurrent;
  manager.ensureMp3 = async file => ({ path: file, deleteAfter: false });
  manager.ensureModel = async () => 'model';
  manager.runWhisper = async file => {
    started.push(file);
    if (file === 'first.wav') await new Promise((_, reject) => { rejectCurrent = reject; });
  };
  manager.stopActiveProcess = async () => { rejectCurrent?.(new Error('terminated')); };
  const finished = once(manager, 'finished');
  manager.enqueue({ files: ['first.wav', 'second.wav', 'third.wav'], settings });
  await tick();
  await manager.skipCurrent();
  await finished;
  assert.deepEqual(started, ['first.wav', 'second.wav', 'third.wav']);
  assert.equal(manager.processing, false);
});

test('skip aborts a model download and never transcribes the skipped file', async () => {
  const manager = new TranscriptionManager();
  const started = [];
  let calls = 0;
  manager.ensureMp3 = async file => ({ path: file, deleteAfter: false });
  manager.ensureModel = async (_, signal) => {
    if (++calls === 1) await new Promise((_, reject) => {
      signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
    });
    return 'model';
  };
  manager.runWhisper = async file => { started.push(file); };
  const finished = once(manager, 'finished');
  manager.enqueue({ files: ['first.wav', 'second.wav'], settings });
  await tick();
  await manager.skipCurrent();
  await finished;
  assert.deepEqual(started, ['second.wav']);
});

test('Stop clears the queue without allowing a pending preparation to launch Whisper', async () => {
  const manager = new TranscriptionManager();
  let completeConversion;
  let ran = false;
  manager.ensureMp3 = file => new Promise(resolve => { completeConversion = () => resolve({ path: file, deleteAfter: false }); });
  manager.ensureModel = async () => 'model';
  manager.runWhisper = async () => { ran = true; };
  const finished = once(manager, 'finished');
  manager.enqueue({ files: ['first.wav', 'second.wav'], settings });
  await manager.cancelAll();
  assert.equal(manager.processing, true);
  assert.equal(manager.queue.length, 0);
  completeConversion();
  await finished;
  assert.equal(ran, false);
  assert.equal(manager.processing, false);
});
