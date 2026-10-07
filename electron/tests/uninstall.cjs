const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const path = require('node:path');
const Module = require('node:module');

const app = { isPackaged: false, getPath: () => path.resolve('fake-install', 'EasyWhisperUI.exe') };
let missing = false;
let launchError = false;
let launched;
const originalLoad = Module._load;
Module._load = function (name, ...args) {
  if (name === 'electron') return { app };
  if (name === 'node:fs/promises') return { lstat: async () => {
    if (missing) throw new Error('missing');
    return { isFile: () => true, isSymbolicLink: () => false };
  } };
  if (name === 'node:child_process') return { spawn: (exe, args, options) => {
    launched = { exe, args, options };
    const child = new EventEmitter();
    child.unref = () => {};
    process.nextTick(() => child.emit(launchError ? 'error' : 'spawn', new Error('Launch failed')));
    return child;
  } };
  return originalLoad.call(this, name, ...args);
};
const { getUninstallInfo, launchUninstaller } = require('../dist/main/services/uninstallManager');
Module._load = originalLoad;

test('development checkout cannot invoke an uninstaller', async () => {
  assert.equal((await getUninstallInfo()).available, false);
  await assert.rejects(launchUninstaller(), /could not be found/);
  assert.equal(launched, undefined);
});

test('installed Windows app uses only its adjacent NSIS uninstaller with data removal', { skip: process.platform !== 'win32' }, async () => {
  app.isPackaged = true;
  assert.equal((await getUninstallInfo()).available, true);
  await launchUninstaller();
  assert.equal(launched.exe, path.join(path.dirname(app.getPath()), 'Uninstall EasyWhisperUI.exe'));
  assert.deepEqual(launched.args, ['--delete-app-data']);
  assert.equal(launched.options.shell, false);
  assert.equal(launched.options.detached, true);
});

test('missing uninstaller leaves installation alone', { skip: process.platform !== 'win32' }, async () => {
  missing = true;
  launched = undefined;
  assert.equal((await getUninstallInfo()).available, false);
  await assert.rejects(launchUninstaller(), /No files were removed/);
  assert.equal(launched, undefined);
  missing = false;
});

test('launch failures propagate to the settings panel', { skip: process.platform !== 'win32' }, async () => {
  launchError = true;
  await assert.rejects(launchUninstaller(), /Launch failed/);
  launchError = false;
});

test('portable builds cannot invoke an uninstaller', { skip: process.platform !== 'win32' }, async () => {
  const previous = process.env.PORTABLE_EXECUTABLE_FILE;
  try {
    process.env.PORTABLE_EXECUTABLE_FILE = 'portable.exe';
    assert.equal((await getUninstallInfo()).available, false);
    await assert.rejects(launchUninstaller(), /could not be found/);
  } finally {
    if (previous === undefined) delete process.env.PORTABLE_EXECUTABLE_FILE;
    else process.env.PORTABLE_EXECUTABLE_FILE = previous;
  }
});
