const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');

let appPath;
let userData;
const originalLoad = Module._load;
Module._load = function (name, ...args) {
  if (name === 'electron') return { app: { getPath: () => userData, getAppPath: () => appPath } };
  return originalLoad.call(this, name, ...args);
};
const { resolveBinary } = require('../dist/main/services/binaryResolver');
Module._load = originalLoad;

for (const packaged of [false, true]) {
  test(`macOS keeps live binary beside SDL (${packaged ? 'packaged' : 'development'})`, { skip: process.platform !== 'darwin' }, (t) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'whisper-mac-resolution-'));
    const previousResources = process.resourcesPath;
    t.after(() => {
      if (previousResources === undefined) delete process.resourcesPath;
      else process.resourcesPath = previousResources;
      fs.rmSync(root, { recursive: true, force: true });
    });
    appPath = path.join(root, 'app');
    userData = path.join(root, 'profile');
    process.resourcesPath = path.join(root, 'resources');
    const bundle = packaged ? path.join(process.resourcesPath, 'mac-bin') : path.join(appPath, 'buildResources', 'mac-bin');
    const workspace = path.join(userData, 'whisper-workspace', 'bin');
    fs.mkdirSync(bundle, { recursive: true });
    fs.mkdirSync(workspace, { recursive: true });
    fs.writeFileSync(path.join(bundle, 'whisper-stream'), 'bundled stream');
    fs.writeFileSync(path.join(bundle, 'libSDL2-2.0.0.dylib'), 'SDL');
    // Reproduce an existing installation with a stale binary and missing SDL.
    fs.writeFileSync(path.join(workspace, 'whisper-stream'), 'stale stream');
    const result = resolveBinary('whisper-stream', { allowSystemFallback: false });
    assert.equal(result.found, true);
    assert.equal(result.command, path.join(bundle, 'whisper-stream'));
    assert.ok(fs.existsSync(path.join(path.dirname(result.command), 'libSDL2-2.0.0.dylib')));
    assert.equal(fs.readFileSync(path.join(workspace, 'whisper-stream'), 'utf8'), 'stale stream');
  });
}
