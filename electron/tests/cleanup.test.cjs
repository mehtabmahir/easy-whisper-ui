const { test } = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { CLEANUP_PROMPT, splitTranscript, reviewedText, markdownDocument, hasRepetitionLoop, readableSection, structuredOriginal, outlinePassages } = require('../dist/main/services/cleanupText');
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
  assert.match(markdownDocument('test [link](file)', ['Hello.'], 1), /1 section\(s\) keep original wording/);
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

test('repetition loops are detected and prose receives readable Markdown structure', () => {
  assert.equal(hasRepetitionLoop('The producer enters the vault and locks the door. The consumer waits outside. '.repeat(8)), true);
  assert.equal(hasRepetitionLoop('A short ordinary sentence.'), false);
  const structured = readableSection('This is an ordinary sentence with all of its original words. '.repeat(20), 2);
  assert.match(structured, /^## Section 3/);
  assert.ok(structured.split('\n\n').length > 3);
  assert.equal(readableSection('## Locking\n\n- Obtain the lock.\n- Release the lock.', 0), '## Locking\n\n- Obtain the lock.\n- Release the lock.');
});
test('an hour-sized transcript completes after one section hits the output limit', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cleanup-long-'));
  const fetch = global.fetch;
  let calls = 0, last;
  setCleanupApiKey('fake-test-key');
  const original = 'The producer holds the lock while updating the shared counter. The consumer waits until the lock is released. '.repeat(600);
  try {
    global.fetch = async (_, options) => {
      const text = JSON.parse(options.body).messages[1].content;
      calls++;
      return { ok: true, json: async () => ({ choices: [{ finish_reason: calls === 2 ? 'length' : 'stop', message: { content: '## Shared counter\n\n' + text } }] }) };
    };
    await cleanupTranscript({ source: 'lecture.wav', outputBase: path.join(root, 'lecture'), original,
      preferences: { provider: 'openai', apiModel: 'test' }, signal: new AbortController().signal, emit: event => { last = event; } });
    assert.equal(last.status, 'complete');
    assert.equal(last.completed, splitTranscript(original).length);
    assert.equal(last.preserved, 1);
    assert.ok(calls > 25);
    assert.match(await fs.readFile(last.outputPath, 'utf8'), /### /);
  } finally { global.fetch = fetch; setCleanupApiKey(''); await fs.rm(root, { recursive: true, force: true }); }
});

test('preserved wording still receives topic headings without losing content', () => {
  const text = 'The producer updates the counter. The consumer waits for the lock. '.repeat(30);
  const passages = outlinePassages(text);
  const result = structuredOriginal(text, JSON.stringify({ title: 'Shared Counter Updates', headings: passages.map(() => 'Counter Lock Ownership') }));
  assert.match(result, /^## Shared Counter Updates/);
  assert.equal((result.match(/^### Counter Lock Ownership/gm) ?? []).length, passages.length);
  assert.equal(result.replace(/^#{2,3} .+$/gm, '').replace(/\s/g, ''), text.replace(/\s/g, ''));
  assert.doesNotMatch(structuredOriginal(text, 'invalid'), /## Section/);
});

test('compatible API uses the chosen endpoint and portable token parameter', async () => {
  const savedFetch = global.fetch;
  try {
    global.fetch = async (url, options) => {
      assert.equal(url, 'https://provider.example/v1/chat/completions');
      const body = JSON.parse(options.body);
      assert.equal(body.max_tokens, 4096);
      assert.equal(body.store, undefined);
      assert.equal(options.headers.Authorization, 'Bearer test-key');
      return { ok: true, json: async () => ({ choices: [{ finish_reason: 'stop', message: { content: 'Done.' } }] }) };
    };
    assert.equal(await cleanWithApi('text', 'custom-model', 'test-key', new AbortController().signal, 'prompt', 'https://provider.example/v1/chat/completions'), 'Done.');
    for (const endpoint of ['http://provider.example/v1', 'https://key@provider.example/v1', 'https://provider.example/v1?key=secret']) {
      await assert.rejects(cleanWithApi('text', 'model', 'test-key', new AbortController().signal, 'prompt', endpoint), /HTTPS/);
    }
  } finally { global.fetch = savedFetch; }
});

test('custom models require an existing GGUF file with the correct header', async () => {
  const { validateCustomModel } = require('../dist/main/services/transcriptCleanup');
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cleanup-model-test-'));
  try {
    await assert.rejects(validateCustomModel(), /Choose a GGUF/);
    await assert.rejects(validateCustomModel(path.join(root, 'whisper.bin')), /Choose a GGUF/);
    const file = path.join(root, 'model.gguf');
    await fs.writeFile(file, 'invalid');
    await assert.rejects(validateCustomModel(file), /not a GGUF/);
    await fs.writeFile(file, 'GGUFtest');
    assert.equal(await validateCustomModel(file), file);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

test('post-transcription actions accept concise responses, use custom instructions, and save separately', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'transcript-action-'));
  const savedFetch = global.fetch;
  const events = [];
  const outputBase = path.join(root, 'meeting.wav');
  setCleanupApiKey('test-key');
  try {
    await fs.writeFile(outputBase + '.cleaned.md', 'Existing cleaned transcript');
    for (const action of [{ kind: 'summary' }, { kind: 'custom', request: 'List decisions only.' }]) {
      global.fetch = async (_url, options) => {
        const body = JSON.parse(options.body);
        assert.match(body.messages[0].content, action.kind === 'summary' ? /Summarize/ : /List decisions only/);
        return { ok: true, json: async () => ({ choices: [{ finish_reason: 'stop', message: { content: '## Decisions\n\n- Release on Friday.' } }] }) };
      };
      await cleanupTranscript({ source: 'meeting.wav', outputBase, original: 'The team discussed testing documentation and the remaining bugs for a long time before deciding to release on Friday.',
        preferences: { provider: 'openai', apiModel: 'test' }, action, signal: new AbortController().signal, emit: e => events.push(e) });
      const final = events.at(-1);
      assert.equal(final.status, 'complete');
      assert.equal(final.action.kind, action.kind);
      assert.match(final.markdown, /Release on Friday/);
      assert.doesNotMatch(final.markdown, /discussed testing documentation/);
      assert.equal(final.outputPath, outputBase + (action.kind === 'summary' ? '.summary.md' : '.response.md'));
    }
    assert.equal(await fs.readFile(outputBase + '.cleaned.md', 'utf8'), 'Existing cleaned transcript');
  } finally { global.fetch = savedFetch; await fs.rm(root, { recursive: true, force: true }); }
});

test('long summaries merge into a coherent result without assuming meetings', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'summary-merge-'));
  const savedFetch = global.fetch;
  let merges = 0, final;
  setCleanupApiKey('test-key');
  try {
    global.fetch = async (_url, options) => {
      const prompt = JSON.parse(options.body).messages[0].content;
      const merging = prompt.startsWith('Combine these');
      if (merging) merges++; else assert.match(prompt, /Do not assume this is a meeting/);
      return { ok: true, json: async () => ({ choices: [{ finish_reason: 'stop', message: { content: merging ? '## Streams and Sockets\n\nSockets support bidirectional communication.' : 'Sockets can send and receive data.' } }] }) };
    };
    await cleanupTranscript({ source: 'lecture.wav', outputBase: path.join(root, 'lecture'), original: 'Sockets can send and receive data. '.repeat(150),
      preferences: { provider: 'openai', apiModel: 'test' }, action: { kind: 'summary' }, signal: new AbortController().signal, emit: e => { final = e; } });
    assert.equal(final.status, 'complete');
    assert.ok(merges > 0);
    assert.match(final.markdown, /Streams and Sockets/);
    assert.doesNotMatch(final.markdown, /## Part/);
  } finally { global.fetch = savedFetch; await fs.rm(root, { recursive: true, force: true }); }
});

test('summary is saved when the final combining pass repeatedly hits its limit', async () => {
 const root = await fs.mkdtemp(path.join(os.tmpdir(), 'summary-limit-'));
 const savedFetch = global.fetch;
 let final;
 setCleanupApiKey('test-key');
 try {
  global.fetch = async (_url, options) => {
   const merge = JSON.parse(options.body).messages[0].content.startsWith('Combine these');
   return { ok: true, json: async () => ({ choices: [{ finish_reason: merge ? 'length' : 'stop', message: { content: 'Sockets send and receive data.' } }] }) };
  };
  await cleanupTranscript({ source: 'lecture.wav', outputBase: path.join(root, 'lecture'), original: 'Sockets send and receive data. '.repeat(180), preferences: { provider: 'openai', apiModel: 'test' }, action: { kind: 'summary' }, signal: new AbortController().signal, emit: e => { final = e; } });
  assert.equal(final.status, 'complete');
  assert.match(await fs.readFile(final.outputPath, 'utf8'), /Sockets send and receive data/);
  assert.match(final.markdown, /retain their earlier text/);
 } finally { global.fetch = savedFetch; await fs.rm(root, { recursive: true, force: true }); }
});

test('Clean up action uses the automatic cleanup prompt and saves a cleaned copy', async () => {
 const root = await fs.mkdtemp(path.join(os.tmpdir(), 'verbatim-cleanup-'));
 const savedFetch = global.fetch;
 let final;
 setCleanupApiKey('test-key');
 try {
  global.fetch = async (_url, options) => {
   assert.equal(JSON.parse(options.body).messages[0].content, CLEANUP_PROMPT);
   return { ok: true, json: async () => ({ choices: [{ finish_reason: 'stop', message: { content: 'Hello everyone. We ordered 45 boxes today.' } }] }) };
  };
  await cleanupTranscript({ source: 'test.wav', outputBase: path.join(root, 'test'), original: 'hello everyone we ordered 45 boxes today', preferences: { provider: 'openai', apiModel: 'test' }, action: { kind: 'cleanup' }, signal: new AbortController().signal, emit: e => { final = e; } });
  assert.equal(final.status, 'complete');
  assert.match(final.outputPath, /\.cleaned\.md$/);
  assert.match(final.markdown, /45 boxes/);
 } finally { global.fetch = savedFetch; await fs.rm(root, { recursive: true, force: true }); }
});
