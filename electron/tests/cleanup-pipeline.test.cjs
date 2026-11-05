const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');
let cleanup;
const originalLoad = Module._load;
Module._load = function(name, ...args) {
  if (name === 'electron') return { app: { getPath: () => os.tmpdir() }, shell: {} };
  if (name === './binaryResolver') return { resolveBinary: () => ({ command: '/test/whisper-cli', found: true }) };
  if (name === './transcriptCleanup') return { cleanupTranscript: input => cleanup(input) };
  return originalLoad.call(this, name, ...args);
};
const { TranscriptionManager } = require('../dist/main/services/transcriptionManager');
Module._load = originalLoad;
const settings = { model: 'tiny', language: 'en', outputTxt: false, outputSrt: true, extraArgs: '', openAfterComplete: true, cleanup: { provider: 'local', apiModel: '' } };
test('cleanup follows Whisper, sees the saved original, and opens the reader instead of an external editor', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cleanup-pipeline-'));
  try {
    const file = path.join(root, 'sample.wav');
    const manager = new TranscriptionManager();
    manager.ensureMp3 = async file => ({ path: file, deleteAfter: false });
    manager.ensureModel = async () => 'model';
    manager.runWhisper = async (_, __, ___, base) => fs.writeFile(base + '.txt', 'Original transcript');
    manager.openOutputAfterComplete = async () => assert.fail('Cleanup must open inside the app');
    const stages = [];
    manager.on('queue', state => stages.push(state.stage));
    let called = false;
    cleanup = async input => {
      called = true;
      assert.equal(input.original, 'Original transcript');
      assert.equal(await fs.readFile(file + '.txt', 'utf8'), input.original);
      input.emit({ status: 'complete' });
    };
    const finished = new Promise(resolve => manager.once('finished', resolve));
    manager.enqueue({ files: [file], settings });
    await finished;
    assert.ok(called);
    assert.ok(stages.includes('cleanup'));
    assert.equal(manager.failed.length, 0);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});
test('cleanup forces Whisper text output even when the normal text checkbox is off', async () => {
  const manager = new TranscriptionManager();
  let argumentsUsed;
  manager.spawnWithLogs = async (_, args) => { argumentsUsed = args; };
  await manager.runWhisper('/test.wav', '/model.bin', settings);
  assert.ok(argumentsUsed.includes('-otxt'));
  await manager.runWhisper('/test.wav', '/model.bin', { ...settings, cleanup: undefined });
  assert.equal(argumentsUsed.includes('-otxt'), false);
});

test('normal transcription feeds the reader unchanged without invoking the LLM', async () => {
 const root = await fs.mkdtemp(path.join(os.tmpdir(), 'normal-reader-'));
 try {
  const file = path.join(root, 'normal.wav');
  const manager = new TranscriptionManager();
  manager.ensureMp3 = async file => ({ path: file, deleteAfter: false });
  manager.ensureModel = async () => 'model';
  const original = 'Yes. Yes. This repetition is intentional.';
  manager.runWhisper = async (_, __, ___, base) => fs.writeFile(base + '.txt', original);
  manager.openOutputAfterComplete = async () => assert.fail('must use reader');
  cleanup = async () => assert.fail('must not invoke LLM');
  let result;
  manager.on('cleanup', event => { result = event; });
  const finished = new Promise(resolve => manager.once('finished', resolve));
  manager.enqueue({ files: [file], settings: { ...settings, cleanup: undefined, transcriptReader: true } });
  await finished;
  assert.equal(result.original, original);
  assert.equal(result.transcriptOnly, true);
  assert.equal(result.outputPath, file + '.txt');
  assert.equal(manager.failed.length, 0);
 } finally { await fs.rm(root, { recursive: true, force: true }); }
});
