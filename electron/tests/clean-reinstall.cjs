const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');

// Exercise real cleanup in an isolated workspace; never download or compile dependencies.
let userData;
const originalLoad = Module._load;
Module._load = function (name, ...args) {
  if (name === 'electron') return { app: { getPath: () => userData } };
  return originalLoad.call(this, name, ...args);
};
const { CompileManager } = require('../dist/main/services/compileManager');
Module._load = originalLoad;

async function fixture(t) {
  userData = await fs.mkdtemp(path.join(os.tmpdir(), 'whisper-reinstall-test-'));
  const tempRoot = userData;
  t.after(async () => {
    assert.equal(path.dirname(tempRoot), path.resolve(os.tmpdir()));
    assert.ok(path.basename(tempRoot).startsWith('whisper-reinstall-test-'));
    await fs.rm(tempRoot, { recursive: true, force: true });
  });
  const root = path.join(userData, 'whisper-workspace');
  for (const name of ['bin', 'whisper.cpp', 'toolchain', 'downloads', 'models']) {
    await fs.mkdir(path.join(root, name), { recursive: true });
    await fs.writeFile(path.join(root, name, 'sentinel'), name);
  }
  await fs.writeFile(path.join(userData, 'preferences.json'), 'preferences');
  await fs.writeFile(path.join(root, 'recording.wav'), 'media');
  await fs.writeFile(path.join(root, 'recording.txt'), 'transcript');
  return { root, manager: new CompileManager() };
}

test('cleans only installation directories, preserves user data, and installs once', async (t) => {
  const { root, manager } = await fixture(t);
  const calls = [];
  manager.ensureDependencies = async (options) => {
    assert.equal(options, undefined);
    for (const name of ['bin', 'whisper.cpp', 'toolchain', 'downloads']) {
      await assert.rejects(fs.stat(path.join(root, name)), { code: 'ENOENT' });
    }
    await fs.mkdir(path.join(root, 'toolchain'));
    await fs.writeFile(path.join(root, 'toolchain', 'new'), 'new toolchain');
    calls.push('dependencies');
    return { success: true };
  };
  manager.compile = async (options) => {
    assert.equal(options, undefined);
    assert.equal(await fs.readFile(path.join(root, 'toolchain', 'new'), 'utf8'), 'new toolchain');
    calls.push('compile');
    return { success: true };
  };
  assert.equal((await manager.cleanReinstall()).success, true);
  assert.deepEqual(calls, ['dependencies', 'compile']);
  assert.equal(await fs.readFile(path.join(root, 'models', 'sentinel'), 'utf8'), 'models');
  assert.equal(await fs.readFile(path.join(userData, 'preferences.json'), 'utf8'), 'preferences');
  assert.equal(await fs.readFile(path.join(root, 'recording.wav'), 'utf8'), 'media');
  assert.equal(await fs.readFile(path.join(root, 'recording.txt'), 'utf8'), 'transcript');
});

test('dependency failure stops compilation and permits retry', async (t) => {
  const { manager } = await fixture(t);
  let compiled = false;
  manager.ensureDependencies = async () => ({ success: false, error: 'Download failed' });
  manager.compile = async () => { compiled = true; return { success: true }; };
  assert.deepEqual(await manager.cleanReinstall(), { success: false, error: 'Download failed' });
  assert.equal(compiled, false);
  manager.ensureDependencies = async () => ({ success: true });
  assert.equal((await manager.cleanReinstall()).success, true);
  assert.equal(compiled, true);
});

test('active setup prevents cleanup', async (t) => {
  const { root, manager } = await fixture(t);
  manager.running = true;
  assert.equal((await manager.cleanReinstall()).success, false);
  assert.equal(await fs.readFile(path.join(root, 'bin', 'sentinel'), 'utf8'), 'bin');
});
