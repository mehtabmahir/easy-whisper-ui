const { test } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');
let userData;
const originalLoad = Module._load;
Module._load = function (name, ...args) {
  if (name === 'electron') return { app: { getPath: () => userData }, shell: {} };
  if (name === './binaryResolver') return { resolveBinary: name => ({ command: name, found: true, searched: [] }) };
  return originalLoad.call(this, name, ...args);
};
const { TranscriptionManager } = require('../dist/main/services/transcriptionManager');
Module._load = originalLoad;
const settings = { model: 'tiny', language: 'en', extraArgs: '', outputTxt: true, openAfterComplete: false };

async function fixture(t) {
  userData = await fs.mkdtemp(path.join(os.tmpdir(), 'whisper-retention-'));
  const root = userData;
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const source = path.join(root, 'media.mp3');
  await fs.writeFile(source, 'source media');
  const manager = new TranscriptionManager();
  const conversions = [];
  manager.spawnWithLogs = async (_, args) => {
    conversions.push(args.at(-1));
    await fs.writeFile(args.at(-1), Buffer.alloc(128));
  };
  manager.ensureModel = async () => 'model';
  manager.runWhisper = async () => {};
  return { root, source, manager, conversions };
}
async function run(manager, source, overrides = {}) {
  const done = once(manager, 'finished');
  manager.enqueue({ files: [source], settings: { ...settings, ...overrides } });
  await done;
}

test('manual cleanup deletes only the cached WAV and preserves source, sibling WAV and exports', async t => {
  const { source, manager } = await fixture(t);
  const sibling = source.replace('.mp3', '.wav');
  await fs.writeFile(sibling, 'original WAV');
  let cached;
  manager.runWhisper = async (audio, _, __, output) => {
    cached = audio;
    assert.equal(output, sibling);
    await fs.writeFile(`${output}.txt`, 'transcript');
  };
  await run(manager, source);
  assert.ok((await fs.stat(cached)).size > 44);
  await manager.clearAudioCache();
  await assert.rejects(fs.stat(cached), { code: 'ENOENT' });
  assert.equal(await fs.readFile(source, 'utf8'), 'source media');
  assert.equal(await fs.readFile(sibling, 'utf8'), 'original WAV');
  assert.equal(await fs.readFile(`${sibling}.txt`, 'utf8'), 'transcript');
});

test('successful transcription retains audio across a new manager and a model change; changed source reconverts', async t => {
  const { source, manager, conversions } = await fixture(t);
  await run(manager, source, {});
  const cached = await manager.ensureMp3(source);
  assert.equal(conversions.length, 1);
  const restarted = new TranscriptionManager();
  restarted.spawnWithLogs = async () => assert.fail('must reuse completed conversion');
  restarted.ensureModel = async s => { assert.equal(s.model, 'large'); return 'large-model'; };
  restarted.runWhisper = async audio => assert.equal(audio, cached.path);
  await run(restarted, source, { model: 'large' });
  await fs.appendFile(source, ' changed');
  const fresh = await manager.ensureMp3(source);
  assert.notEqual(fresh.path, cached.path);
  assert.equal(conversions.length, 2);
});

for (const stage of ['model', 'whisper']) {
  test(`${stage} failure retains conversion for a successful retry`, async t => {
    const { source, manager, conversions } = await fixture(t);
    const method = stage === 'model' ? 'ensureModel' : 'runWhisper';
    const original = manager[method];
    manager[method] = async () => { throw new Error('simulated failure'); };
    await run(manager, source);
    const cached = await manager.ensureMp3(source);
    manager[method] = original;
    await run(manager, source);
    assert.equal(conversions.length, 1);
    assert.ok((await fs.stat(cached.path)).size > 44);
  });
}

for (const action of ['cancelAll', 'skipCurrent']) {
  test(`${action} retains a completed conversion even if the child reports success`, async t => {
    const { source, manager, conversions } = await fixture(t);
    let ready;
    const started = new Promise(resolve => { ready = resolve; });
    let release;
    manager.runWhisper = async () => { ready(); await new Promise(resolve => { release = resolve; }); };
    const finished = run(manager, source);
    await started;
    await manager[action]();
    release();
    await finished;
    const cached = await manager.ensureMp3(source);
    assert.equal(conversions.length, 1);
    assert.ok((await fs.stat(cached.path)).size > 44);
  });
}

test('failed conversion removes partial output and the next attempt converts again', async t => {
  const { source, manager } = await fixture(t);
  let partial;
  const convert = manager.spawnWithLogs;
  manager.spawnWithLogs = async (_, args) => {
    partial = args.at(-1);
    await fs.writeFile(partial, 'incomplete');
    throw new Error('ffmpeg failed');
  };
  await assert.rejects(manager.ensureMp3(source), /ffmpeg failed/);
  await assert.rejects(fs.stat(partial), { code: 'ENOENT' });
  manager.spawnWithLogs = convert;
  assert.ok((await fs.stat((await manager.ensureMp3(source)).path)).size > 44);
});

test('metadata-only changes during and after conversion allow cache reuse', async t => {
  const { source, manager, conversions } = await fixture(t);
  const before = await fs.stat(source, { bigint: true });
  const convert = manager.spawnWithLogs;
  manager.spawnWithLogs = async (...args) => {
    await convert(...args);
    await fs.chmod(source, 0o400);
  };
  const cached = await manager.ensureMp3(source);
  const after = await fs.stat(source, { bigint: true });
  assert.equal(after.size, before.size);
  assert.equal(after.mtimeNs, before.mtimeNs);
  assert.notEqual(after.ctimeNs, before.ctimeNs);
  await fs.chmod(source, 0o600);
  assert.equal((await manager.ensureMp3(source)).path, cached.path);
  assert.equal(conversions.length, 1);
});

for (const change of ['size', 'mtime', 'replacement']) {
  test(`${change} change during conversion rejects and removes partial audio`, async t => {
    const { source, manager, conversions } = await fixture(t);
    const convert = manager.spawnWithLogs;
    manager.spawnWithLogs = async (...args) => {
      await convert(...args);
      const before = await fs.stat(source);
      if (change === 'size') await fs.appendFile(source, 'changed');
      if (change === 'mtime') {
        await fs.writeFile(source, 'edited media'); // Same size as the original.
        await fs.utimes(source, before.atime, new Date(before.mtimeMs + 2000));
      }
      if (change === 'replacement') {
        const replacement = `${source}.replacement`;
        await fs.writeFile(replacement, 'edited media');
        await fs.utimes(replacement, before.atime, before.mtime);
        await fs.rename(replacement, source);
      }
    };
    await assert.rejects(manager.ensureMp3(source), /Source media changed during conversion/);
    assert.deepEqual(await fs.readdir(path.dirname(conversions[0])), []);
    manager.spawnWithLogs = convert;
    await manager.ensureMp3(source);
    assert.equal(conversions.length, 2);
  });
}

test('cache cleanup never deletes original WAV', async t => {
  const { root, manager, conversions } = await fixture(t);
  const source = path.join(root, 'original.WAV');
  await fs.writeFile(source, 'original');
  await run(manager, source);
  await manager.clearAudioCache();
  assert.equal(await fs.readFile(source, 'utf8'), 'original');
  assert.equal(conversions.length, 0);
});

test('Whisper receives an explicit export path beside the original media', async t => {
  const { manager, source } = await fixture(t);
  let args;
  manager.spawnWithLogs = async (_, values) => { args = values; };
  const output = source.replace('.mp3', '.wav');
  await TranscriptionManager.prototype.runWhisper.call(manager, 'cache.wav', 'model', settings, output);
  assert.equal(args[args.indexOf('-f') + 1], 'cache.wav');
  assert.equal(args[args.indexOf('-of') + 1], output);
  assert.ok(args.includes('-otxt'));
});


test('shutdown waits for active transcription then clears cache and rejects new work', async t => {
  const { source, manager } = await fixture(t);
  let ready;
  const started = new Promise(resolve => { ready = resolve; });
  let release;
  manager.runWhisper = async () => { ready(); await new Promise(resolve => { release = resolve; }); };
  const finished = run(manager, source);
  await started;
  const cached = await manager.ensureMp3(source);
  await assert.rejects(manager.clearAudioCache(), /Stop transcription/);
  manager.stopActiveProcess = async () => { release(); };
  await manager.shutdown();
  await finished;
  await assert.rejects(fs.stat(cached.path), { code: 'ENOENT' });
  manager.enqueue({ files: [source], settings });
  assert.equal(manager.processing, false);
  assert.equal(manager.queue.length, 0);
});

test('idle shutdown clears retained and partial audio but preserves models', async t => {
  const { source, manager } = await fixture(t);
  const cached = await manager.ensureMp3(source);
  const partial = path.join(path.dirname(cached.path), 'orphan.partial.wav');
  await fs.writeFile(partial, 'partial');
  const models = path.join(path.dirname(path.dirname(cached.path)), 'models');
  await fs.mkdir(models, { recursive: true });
  await fs.writeFile(path.join(models, 'model.bin'), 'model');
  await manager.shutdown();
  await assert.rejects(fs.stat(cached.path), { code: 'ENOENT' });
  await assert.rejects(fs.stat(partial), { code: 'ENOENT' });
  assert.equal(await fs.readFile(path.join(models, 'model.bin'), 'utf8'), 'model');
  await manager.clearAudioCache();
});

test('Settings download publishes only a complete model and reuses it', async t => {
  const { root, manager } = await fixture(t);
  delete manager.ensureModel;
  let downloads = 0;
  const target = path.join(root, 'whisper-workspace', 'models', 'ggml-base.bin');
  manager.downloadFile = async (url, destination) => {
    downloads++;
    assert.ok(url.endsWith('/ggml-base.bin'));
    assert.notEqual(destination, target);
    await fs.writeFile(destination, 'complete model');
    await assert.rejects(fs.stat(target), { code: 'ENOENT' });
  };
  await manager.downloadModel('base');
  assert.equal(await fs.readFile(target, 'utf8'), 'complete model');
  await manager.downloadModel('base');
  assert.equal(downloads, 1);
});

test('Settings download removes failed partial files and permits retry', async t => {
  const { root, manager } = await fixture(t);
  delete manager.ensureModel;
  manager.downloadFile = async (_, destination) => {
    await fs.writeFile(destination, 'partial');
    throw new Error('connection lost');
  };
  await assert.rejects(manager.downloadModel('tiny'), /connection lost/);
  const modelsDir = path.join(root, 'whisper-workspace', 'models');
  assert.deepEqual(await fs.readdir(modelsDir), []);
  manager.downloadFile = async (_, destination) => fs.writeFile(destination, 'complete');
  await manager.downloadModel('tiny');
  assert.deepEqual(await fs.readdir(modelsDir), ['ggml-tiny.bin']);
});

test('Settings downloads validate model names and prevent overlapping operations', async t => {
  const { manager } = await fixture(t);
  for (const model of ['../../outside', 'custom', '', null]) {
    await assert.rejects(manager.downloadModel(model), /supported model/);
  }
  manager.processing = true;
  await assert.rejects(manager.downloadModel('base'), /current operation/);
  manager.processing = false;
  let release;
  manager.ensureModel = () => new Promise(resolve => { release = resolve; });
  const pending = manager.downloadModel('base');
  await assert.rejects(manager.downloadModel('tiny'), /current operation/);
  release('model');
  await pending;
});

for (const knownSize of [true, false]) {
  test(`download reports actual bytes and speed with ${knownSize ? 'known' : 'unknown'} size, including redirects`, async t => {
    const { root, manager } = await fixture(t);
    const { PassThrough } = require('node:stream');
    const { EventEmitter } = require('node:events');
    const https = require('node:https');
    let requests = 0;
    t.mock.method(https, 'get', (_url, _options, callback) => {
      const response = new PassThrough();
      const redirect = requests++ === 0;
      response.statusCode = redirect ? 302 : 200;
      response.headers = redirect ? { location: '/actual-model' }
        : knownSize ? { 'content-length': '12' } : {};
      setImmediate(() => {
        callback(response);
        if (redirect) response.end();
        else { response.write(Buffer.alloc(4)); response.end(Buffer.alloc(8)); }
      });
      return new EventEmitter();
    });
    const updates = [];
    const target = path.join(root, 'download.bin');
    await manager.downloadFile('https://example.test/model', target, new AbortController().signal, 0,
      (received, total, speed) => updates.push({ received, total, speed }));
    assert.equal(requests, 2);
    assert.equal(updates[0].received, 0);
    assert.equal(updates.at(-1).received, 12);
    assert.equal(updates.at(-1).total, knownSize ? 12 : undefined);
    assert.ok(Number.isFinite(updates.at(-1).speed) && updates.at(-1).speed > 0);
    assert.equal((await fs.stat(target)).size, 12);
  });
}

test('a truncated model download emits an error and never publishes a cached model', async t => {
  const { root, manager } = await fixture(t);
  delete manager.ensureModel;
  const { PassThrough } = require('node:stream');
  const { EventEmitter } = require('node:events');
  t.mock.method(require('node:https'), 'get', (_url, _options, callback) => {
    const response = new PassThrough();
    response.statusCode = 200;
    response.headers = { 'content-length': '100' };
    setImmediate(() => { callback(response); response.end(Buffer.alloc(10)); });
    return new EventEmitter();
  });
  const updates = [];
  manager.on('download', event => updates.push(event));
  await assert.rejects(manager.downloadModel('tiny'), /incomplete/);
  assert.equal(updates.at(-1).state, 'error');
  assert.ok(!updates.some(event => event.state === 'complete'));
  assert.deepEqual(await fs.readdir(path.join(root, 'whisper-workspace', 'models')), []);
});

test('shutdown with cleanup disabled cancels active work and retains reusable audio', async t => {
  const { source, manager } = await fixture(t);
  let ready;
  const started = new Promise(resolve => { ready = resolve; });
  let release;
  manager.runWhisper = async () => { ready(); await new Promise(resolve => { release = resolve; }); };
  const finished = run(manager, source);
  await started;
  const cached = await manager.ensureMp3(source);
  manager.stopActiveProcess = async () => { release(); };
  await manager.shutdown(false);
  await finished;
  assert.ok((await fs.stat(cached.path)).size > 44);
  const restarted = new TranscriptionManager();
  restarted.spawnWithLogs = async () => assert.fail('retained conversion must be reused');
  assert.equal((await restarted.ensureMp3(source)).path, cached.path);
  manager.enqueue({ files: [source], settings });
  assert.equal(manager.queue.length, 0);
  await restarted.clearAudioCache();
  await assert.rejects(fs.stat(cached.path), { code: 'ENOENT' });
});
