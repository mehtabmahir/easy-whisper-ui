const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');
let userData;
const originalLoad = Module._load;
Module._load = function(name, ...args) {
  if (name === 'electron') return { app: { getPath: () => userData }, shell: {} };
  if (name === './binaryResolver') return { resolveBinary: () => ({ command: 'whisper-cli', found: true }) };
  return originalLoad.call(this, name, ...args);
};
const { TranscriptionManager } = require('../dist/main/services/transcriptionManager');
Module._load = originalLoad;

test('Unicode WAV/model/output paths use ASCII aliases and preserve original names', { skip: process.platform !== 'win32' }, async () => {
  userData = await fs.mkdtemp(path.join(os.tmpdir(), 'whisper-áő中文-'));
  try {
    const input = path.join(userData, 'episode： ▓ áéő.wav');
    const model = path.join(userData, '模型.bin');
    await fs.writeFile(input, 'original audio');
    await fs.writeFile(model, 'original model');
    const manager = new TranscriptionManager();
    let workDir;
    manager.spawnWithLogs = async (_, args, cwd) => {
      workDir = cwd;
      assert.equal(args[args.indexOf('-f') + 1], 'input.wav');
      assert.equal(args[args.indexOf('-m') + 1], 'model.bin');
      assert.equal(args[args.indexOf('-of') + 1], 'result');
      assert.equal(await fs.readFile(path.join(cwd, 'input.wav'), 'utf8'), 'original audio');
      assert.equal(await fs.readFile(path.join(cwd, 'model.bin'), 'utf8'), 'original model');
      await fs.writeFile(path.join(cwd, 'result.txt'), 'Hello 中文');
      await fs.writeFile(path.join(cwd, 'result.srt'), 'subtitles');
    };
    const settings = { model: 'custom', language: 'en', outputTxt: true, outputSrt: true, extraArgs: '' };
    await manager.runWhisper(input, model, settings, input);
    assert.equal(await fs.readFile(input + '.txt', 'utf8'), 'Hello 中文');
    assert.equal(await fs.readFile(input + '.srt', 'utf8'), 'subtitles');
    assert.equal(await fs.readFile(input, 'utf8'), 'original audio');
    assert.equal(await fs.readFile(model, 'utf8'), 'original model');
    await assert.rejects(fs.stat(workDir), { code: 'ENOENT' });
    await assert.rejects(manager.runWhisper(input, model, settings, path.join(userData, 'missing', 'output')), /Results retained/);
    const recoveredRoot = path.join(userData, 'whisper-workspace', 'recovered-transcripts');
    const recovered = path.join(recoveredRoot, (await fs.readdir(recoveredRoot))[0]);
    assert.equal(await fs.readFile(path.join(recovered, 'result.txt'), 'utf8'), 'Hello 中文');
    assert.deepEqual((await fs.readdir(recovered)).sort(), ['result.srt', 'result.txt']);
    manager.spawnWithLogs = async (_, args, cwd) => { workDir = cwd; throw new Error('process failed'); };
    await assert.rejects(manager.runWhisper(input, model, settings, input), /process failed/);
    await assert.rejects(fs.stat(workDir), { code: 'ENOENT' });
    assert.equal(await fs.readFile(input, 'utf8'), 'original audio');
  } finally { await fs.rm(userData, { recursive: true, force: true }); }
});
