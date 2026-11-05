const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../src/main/services/transcriptionManager.ts'), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
const exportsObject = {};
vm.runInNewContext(code, { exports: exportsObject, require: name => {
  if (name === 'electron') return {};
  if (name.startsWith('./')) return {};
  return require(name);
}, AbortController, console, process, setTimeout, clearTimeout });
const settings = { model: 'tiny', language: 'en', openAfterComplete: false };
function manager() {
  const m = new exportsObject.TranscriptionManager();
  m.ensureMp3 = async file => ({ path: file, deleteAfter: false });
  m.ensureModel = async () => 'model';
  m.stopActiveProcess = async () => {};
  return m;
}
const finish = m => new Promise(resolve => m.once('finished', resolve));
test('failure stays visible, later files continue, retry uses new settings', async () => {
  const m = manager(); let fail = true; const ran = [];
  m.runWhisper = async file => { ran.push(file); if (file === 'bad.mp3' && fail) throw Error('Test failure'); };
  const done = finish(m); m.enqueue({ files: ['bad.mp3', 'good.mp3'], settings }); await done;
  assert.deepEqual(ran, ['bad.mp3', 'good.mp3']);
  assert.equal(m.failed.length, 1); assert.equal(m.failed[0].error, 'Test failure');
  let snapshot; m.once('queue', state => snapshot = state); m.emitQueue();
  assert.equal(snapshot.items[0].status, 'failed'); assert.equal(snapshot.isProcessing, false);
  fail = false; const retried = finish(m); m.retryQueueItem(m.failed[0].id, { ...settings, cpuOnly: true });
  assert.equal(m.current.settings.cpuOnly, true); await retried; assert.equal(m.failed.length, 0);
});
test('duplicate paths have independent IDs and can be removed separately', async () => {
  const m = manager(); m.processing = true;
  m.enqueue({ files: ['same.mp3', 'same.mp3'], settings });
  assert.notEqual(m.queue[0].id, m.queue[1].id);
  const kept = m.queue[1].id; await m.removeQueueItem(m.queue[0].id);
  assert.equal(m.queue.length, 1); assert.equal(m.queue[0].id, kept);
});
test('removing active file aborts it and continues without retaining it as failed', async () => {
  const m = manager(); let started; const ready = new Promise(r => started = r); const ran = [];
  m.runWhisper = async file => { ran.push(file); if (file === 'first.mp3') { started(); await new Promise(resolve => m.currentAbort.signal.addEventListener('abort', resolve, { once: true })); } };
  const done = finish(m); m.enqueue({ files: ['first.mp3', 'next.mp3'], settings }); await ready;
  await m.removeQueueItem(m.current.id); await done;
  assert.deepEqual(ran, ['first.mp3', 'next.mp3']); assert.equal(m.failed.length, 0);
});
test('failed items can be explicitly removed', async () => {
  const m = manager(); m.runWhisper = async () => { throw Error('Failure'); };
  const done = finish(m); m.enqueue({ files: ['bad.mp3'], settings }); await done;
  await m.removeQueueItem(m.failed[0].id); assert.equal(m.failed.length, 0);
});
