const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const Module = require('node:module');
let root;
let opened;
let openError = '';
const originalLoad = Module._load;
Module._load = function (name, ...args) {
  if (name === 'electron') return {
    app: { getPath: () => root },
    shell: { openPath: async target => { opened = target; return openError; } }
  };
  return originalLoad.call(this, name, ...args);
};
const settings = require('../dist/main/services/appSettings');
Module._load = originalLoad;
async function fixture(t) {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'whisper-settings-'));
  const dir = root;
  opened = undefined;
  openError = '';
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
}

test('cache preference defaults on, persists both choices, and rejects non-booleans', async t => {
  await fixture(t);
  assert.equal(settings.getClearAudioCacheOnExit(), true);
  settings.setClearAudioCacheOnExit(false);
  assert.equal(settings.getClearAudioCacheOnExit(), false);
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(root, 'app-settings.json'), 'utf8')), { clearAudioCacheOnExit: false });
  settings.setClearAudioCacheOnExit(true);
  assert.equal(settings.getClearAudioCacheOnExit(), true);
  for (const value of ['false', null, {}, 0]) assert.throws(() => settings.setClearAudioCacheOnExit(value), /Invalid/);
  await fs.writeFile(path.join(root, 'app-settings.json'), '{}');
  assert.equal(settings.getClearAudioCacheOnExit(), true);
  await fs.writeFile(path.join(root, 'app-settings.json'), 'invalid');
  t.mock.method(console, 'error', () => {});
  assert.equal(settings.getClearAudioCacheOnExit(), true);
});

test('folder shortcut opens the workspace root and reports shell failures', async t => {
  await fixture(t);
  await settings.openWorkspaceFolder();
  assert.equal(opened, path.join(root, 'whisper-workspace'));
  assert.ok((await fs.stat(opened)).isDirectory());
  openError = 'Could not launch file manager';
  await assert.rejects(settings.openWorkspaceFolder(), /Could not launch/);
});

test('log shortcut handles missing logs without fabricating one and opens existing logs unchanged', async t => {
  await fixture(t);
  await assert.rejects(settings.showSetupLog(), /No setup log yet/);
  assert.equal(opened, undefined);
  const log = path.join(root, 'whisper-workspace', 'log.txt');
  await fs.mkdir(path.dirname(log), { recursive: true });
  await fs.writeFile(log, 'setup details');
  await settings.showSetupLog();
  assert.equal(opened, log);
  assert.equal(await fs.readFile(log, 'utf8'), 'setup details');
  openError = 'No text viewer';
  await assert.rejects(settings.showSetupLog(), /No text viewer/);
});
