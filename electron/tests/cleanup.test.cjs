const { test } = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { splitTranscript, reviewedText, markdownDocument } = require('../dist/main/services/cleanupText');
const originalLoad = Module._load;
Module._load = function(name, ...args) {
  if (name === 'electron') return { app: { getPath: () => os.tmpdir() } };
  return originalLoad.call(this, name, ...args);
};
const { cleanupTranscript, cleanWithApi, setCleanupApiKey } = require('../dist/main/services/transcriptCleanup');
Module._load = originalLoad;

test('long transcript chunking preserves all text, including Unicode and long words', () => {
  const input = ('Hello there. Keep every sentence. 你好。 😀\n').repeat(200) + 'a'.repeat(3000);
  const chunks = splitTranscript(input);
  assert.ok(chunks.length > 2);
  assert.equal(chunks.join('').replace(/\s/g,''), input.replace(/\s/g,''));
  assert.ok(chunks.every(c => c.length <= 2200 && !/[\uD800-\uDBFF]$/.test(c)));
});
test('cleanup rejects summaries and altered numbers but accepts punctuation edits', () => {
  assert.equal(reviewedText('we ordered 45 boxes today', 'We ordered 45 boxes today.').keptOriginal, false);
  assert.equal(reviewedText('we ordered 45 boxes today', 'We ordered 54 boxes today.').keptOriginal, true);
  assert.equal(reviewedText('hello everyone we need to discuss the project and its budget', 'Project summary.').keptOriginal, true);
  assert.match(markdownDocument('test [link](file)', ['Hello.'], 1), /1 section\(s\) kept unchanged/);
});
test('API cleanup sends bounded requests without storage, rejects incomplete output and hides response errors', async () => {
  const fetch = global.fetch;
  try {
    global.fetch = async (url, options) => {
      assert.equal(url, 'https://api.openai.com/v1/chat/completions');
      assert.equal(options.redirect, 'error');
      const body = JSON.parse(options.body);
      assert.equal(body.store, false);
      assert.equal(body.messages[1].content, 'test');
      return { ok: true, json: async () => ({ choices: [{ finish_reason: 'length', message: { content: 'partial' } }] }) };
    };
    await assert.rejects(cleanWithApi('test', 'test-model', 'fake-test-key', new AbortController().signal), /incomplete/);
    global.fetch = async () => ({ ok: false, status: 401, text: async () => 'secret' });
    await assert.rejects(cleanWithApi('test', 'test-model', 'fake-test-key', new AbortController().signal), /HTTP 401/);
  } finally { global.fetch = fetch; }
});
test('cleanup emits original immediately, saves Markdown without overwriting, and preserves originals on failure or cancellation', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cleanup-test-'));
  const outputBase = path.join(root, 'recording.wav');
  const fetch = global.fetch;
  const events = [];
  setCleanupApiKey('fake-test-key');
  const original = 'hello everyone we ordered 45 boxes today';
  const run = signal => cleanupTranscript({ source: 'recording.wav', outputBase, original,
    preferences: { provider: 'openai', apiModel: 'test-model' }, signal, emit: e => events.push(e) });
  try {
    await fs.writeFile(outputBase + '.txt', original);
    global.fetch = async () => ({ ok: true, json: async () => ({ choices: [{ finish_reason: 'stop', message: { content: 'Hello everyone. We ordered 45 boxes today.' } }] }) });
    await run(new AbortController().signal);
    assert.equal(events[0].original, original);
    assert.equal(events.at(-1).status, 'complete');
    assert.match(await fs.readFile(outputBase + '.cleaned.md', 'utf8'), /45 boxes/);
    await run(new AbortController().signal);
    assert.equal(events.at(-1).outputPath, outputBase + '.cleaned-1.md');
    const controller = new AbortController();
    global.fetch = async () => { controller.abort(); throw new Error('aborted'); };
    await run(controller.signal);
    assert.equal(events.at(-1).status, 'stopped');
    global.fetch = async () => ({ ok: false, status: 429 });
    await run(new AbortController().signal);
    assert.equal(events.at(-1).status, 'error');
    assert.equal(await fs.readFile(outputBase + '.txt', 'utf8'), original);
    assert.equal((await fs.readdir(root)).length, 3);
  } finally { global.fetch = fetch; setCleanupApiKey(''); await fs.rm(root, { recursive: true, force: true }); }
});
