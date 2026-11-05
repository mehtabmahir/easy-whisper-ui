const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { LiveTranscript } = require('../dist/main/services/liveTranscript');
test('live text opens the reader, preserves chunk boundaries, and saves in order', async () => {
 const root = await fs.mkdtemp(path.join(os.tmpdir(), 'live-reader-'));
 try {
  const events = [];
  const session = new LiveTranscript(root, event => events.push(event));
  assert.equal(events[0].live, true);
  assert.equal(events[0].status, 'working');
  session.append('Hello '); session.append('world.\n'); session.append('你好');
  await session.finish();
  const final = events.at(-1);
  assert.equal(final.status, 'complete');
  assert.equal(final.original, 'Hello world.\n\n你好');
  assert.equal(await fs.readFile(final.outputPath, 'utf8'), 'Hello world.\n你好');
  const second = new LiveTranscript(root, () => {}); await second.finish();
  assert.equal((await fs.readdir(root)).length, 2);
 } finally { await fs.rm(root, { recursive: true, force: true }); }
});
test('save failures keep live text available in the reader', async () => {
 const root = await fs.mkdtemp(path.join(os.tmpdir(), 'live-reader-error-'));
 try {
  const file = path.join(root, 'file'); await fs.writeFile(file, 'occupied');
  let final;
  const session = new LiveTranscript(file, e => { final = e; });
  session.append('Keep this text'); await session.finish();
  assert.equal(final.status, 'error'); assert.equal(final.original, 'Keep this text');
  assert.equal(final.outputPath, undefined);
 } finally { await fs.rm(root, { recursive: true, force: true }); }
});
test('reader and LLM receive the merged live line while raw updates stay on disk', async () => {
 const root = await fs.mkdtemp(path.join(os.tmpdir(), 'live-growing-'));
 try {
  let latest;
  const session = new LiveTranscript(root, e => { latest = e; });
  session.append('I am currently watch\n');
  session.append('I am currently watching regular show.\n');
  assert.equal(latest.original, 'I am currently watching regular show.');
  const finished = await session.finish();
  assert.equal(finished.original, latest.original);
  assert.match(await fs.readFile(finished.outputPath, 'utf8'), /watch\nI am/);
 } finally { await fs.rm(root, { recursive: true, force: true }); }
});
