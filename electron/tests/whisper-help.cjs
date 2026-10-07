const { test } = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
let found = true;
let failure = null;
let invocation;
const originalLoad = Module._load;
Module._load = function (name, ...args) {
  if (name === './binaryResolver') return { resolveBinary: () => ({ found, command: 'installed-whisper' }) };
  if (name === 'node:child_process') return { execFile: (command, args, options, callback) => {
    invocation = { command, args, options };
    callback(failure, 'Usage: whisper-cli\n', '  --language LANG\n');
  } };
  return originalLoad.call(this, name, ...args);
};
const { showWhisperHelp } = require('../dist/main/services/whisperHelp');
Module._load = originalLoad;

test('Help runs installed CLI --help and preserves output from both streams', async () => {
  const output = [];
  await showWhisperHelp(text => output.push(text));
  assert.equal(invocation.command, 'installed-whisper');
  assert.deepEqual(invocation.args, ['--help']);
  assert.equal(invocation.options.timeout, 15000);
  assert.ok(output.includes('Usage: whisper-cli\n'));
  assert.ok(output.includes('  --language LANG\n'));
  assert.equal(output.join(''), 'Usage: whisper-cli\n  --language LANG\n');
});
test('missing binary reports recovery instructions without launching', async () => {
  found = false;
  invocation = undefined;
  await assert.rejects(showWhisperHelp(() => {}), /Clean reinstall/);
  assert.equal(invocation, undefined);
  found = true;
});
test('Help reports execution errors', async () => {
  failure = new Error('spawn failed');
  await assert.rejects(showWhisperHelp(() => {}), /spawn failed/);
});
