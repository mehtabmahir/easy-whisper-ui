const { test } = require('node:test');
const assert = require('node:assert/strict');
const { TranscriptStream } = require('../dist/main/services/transcriptStream');
test('streams complete timestamped segments across arbitrary byte boundaries without logs', () => {
 const segments = [];
 const stream = new TranscriptStream((key, text) => segments.push([key, text]));
 const bytes = Buffer.from('model loaded\n[00:00:00.000 --> 00:00:01.000] 你好.\n[00:00:01.000 --> 00:00:02.000] Yes.\n[00:00:02.000 --> 00:00:03.000] Yes.');
 for (const byte of bytes) stream.push(Buffer.from([byte]));
 stream.finish();
 assert.deepEqual(segments.map(s => s[1]), ['你好.', 'Yes.', 'Yes.']);
 assert.notEqual(segments[1][0], segments[2][0]);
});
