const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');
let userData;
const originalLoad = Module._load;
Module._load = function(name, ...args) {
  if (name === 'electron') return { app: { getPath: () => userData } };
  return originalLoad.call(this, name, ...args);
};
const { CompileManager } = require('../dist/main/services/compileManager');
Module._load = originalLoad;

test('Windows missing binaries reset local dependencies but preserve user data; ready installs skip cleanup', { skip: process.platform !== 'win32' }, async () => {
  userData = await fs.mkdtemp(path.join(os.tmpdir(), 'clean-setup-test-'));
  const root = path.join(userData, 'whisper-workspace');
  try {
    for (const folder of ['bin', 'whisper.cpp', 'toolchain', 'downloads', 'models', 'audio-cache']) {
      await fs.mkdir(path.join(root, folder), { recursive: true });
      await fs.writeFile(path.join(root, folder, 'keep.txt'), 'data');
    }
    await fs.writeFile(path.join(userData, 'app-settings.json'), '{}');
    const manager = new CompileManager();
    manager.ensureWorkDirs = async () => root;
    manager.startLog = async () => {};
    manager.stopLog = () => {};
    manager.hasExistingBinaries = async () => ({ installed: true });
    manager.prepareToolchain = async () => { throw new Error('stop before downloads'); };
    assert.equal((await manager.ensureDependencies()).success, true);
    assert.equal(await fs.readFile(path.join(root, 'toolchain', 'keep.txt'), 'utf8'), 'data');
    manager.hasExistingBinaries = async () => ({ installed: false });
    assert.equal((await manager.ensureDependencies()).error, 'stop before downloads');
    for (const folder of ['bin', 'whisper.cpp', 'toolchain', 'downloads']) {
      await assert.rejects(fs.stat(path.join(root, folder)), { code: 'ENOENT' });
    }
    for (const folder of ['models', 'audio-cache']) {
      assert.equal(await fs.readFile(path.join(root, folder, 'keep.txt'), 'utf8'), 'data');
    }
    assert.equal(await fs.readFile(path.join(userData, 'app-settings.json'), 'utf8'), '{}');
  } finally { await fs.rm(userData, { recursive: true, force: true }); }
});
