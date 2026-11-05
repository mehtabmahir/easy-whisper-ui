const { test } = require('node:test');
const assert = require('node:assert/strict');
const { sectionPass } = require('../dist/main/services/sectionPass');
const { IncompleteCleanupError } = require('../dist/main/services/cleanupText');
test('output limits retry smaller pieces without losing content', async () => {
 const input = 'Technical detail. '.repeat(150);
 let retries = 0;
 const result = await sectionPass(input, async text => { retries++; if (text.length > 800) throw new IncompleteCleanupError('limit'); return text; }, new AbortController().signal, () => assert.fail('should recover'));
 assert.ok(retries > 1);
 assert.equal(result.replace(/\s/g, ''), input.replace(/\s/g, ''));
});
test('persistent limits retain earlier text with bounded retries', async () => {
 let calls = 0, retained = 0;
 const input = 'Source sentence. '.repeat(200);
 const result = await sectionPass(input, async () => { calls++; throw new IncompleteCleanupError('limit'); }, new AbortController().signal, () => retained++);
 assert.ok(calls <= 7); assert.ok(retained > 0);
 assert.equal(result.replace(/\s/g, ''), input.replace(/\s/g, ''));
});
test('cancellation and unrelated failures are not swallowed', async () => {
 const controller = new AbortController(); controller.abort();
 await assert.rejects(sectionPass('text', async () => 'result', controller.signal, () => {}));
 await assert.rejects(sectionPass('text', async () => { throw new Error('network'); }, new AbortController().signal, () => {}), /network/);
});
