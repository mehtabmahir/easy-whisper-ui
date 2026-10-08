const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const Module = require('node:module');
const source = fs.readFileSync(path.join(__dirname, '../src/renderer/setupProgress.ts'), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const helper = new Module(__filename);
helper._compile(compiled, __filename);
const { setupProgress } = helper.exports;
const event = (step, progress = 0, state = 'running') => ({ step, progress, state, message: step });

test('full install moves forward across dependency and compile phases without early completion', () => {
  const steps = ['reset', 'git', 'vulkan', 'vulkan-env', 'ffmpeg', 'ffmpeg-env', 'msys', 'packages',
    'dependencies', 'prepare', 'build-toolchain', 'build-packages', 'source', 'configure', 'build', 'copy'];
  let previous = 0;
  for (const step of steps) {
    for (const progress of [0, 100]) {
      const current = setupProgress(event(step, progress));
      assert.ok(current.progress >= previous, `${step} must not move backward`);
      assert.ok(current.progress < 100);
      assert.equal(current.complete, false);
      assert.ok(current.estimateLimit <= 99);
      previous = current.progress;
    }
  }
  assert.equal(setupProgress(event('completed', 100, 'success')).progress, 100);
});

test('long stages get most of the budget and cannot animate into the next stage', () => {
  const ranges = { msys: [12, 22], packages: [22, 50], 'build-packages': [54, 64], configure: [66, 80], build: [80, 99] };
  for (const [step, [start, end]] of Object.entries(ranges)) {
    const current = setupProgress(event(step));
    assert.equal(current.progress, start);
    assert.ok(current.estimateLimit < end);
    assert.ok(current.paceSeconds >= 24);
  }
});

test('skipped steps advance their share but only completed installations reach 100', () => {
  assert.equal(setupProgress(event('packages', 100, 'success')).progress, 50);
  assert.equal(setupProgress(event('dependencies', 100, 'success')).complete, false);
  for (const step of ['completed', 'check-cache', 'prebuilt']) {
    assert.equal(setupProgress(event(step, 100, 'success')).complete, true);
    assert.equal(setupProgress(event(step, 100, 'error')).complete, false);
    assert.equal(setupProgress(event(step, 100, 'running')).progress, 99);
  }
});

test('compile service keeps successful substeps running until final completion', () => {
  const originalLoad = Module._load;
  Module._load = function (name, ...args) {
    if (name === 'electron') return { app: {} };
    return originalLoad.call(this, name, ...args);
  };
  let CompileManager;
  try { ({ CompileManager } = require('../dist/main/services/compileManager')); }
  finally { Module._load = originalLoad; }
  const manager = new CompileManager();
  const events = [];
  manager.on('progress', item => events.push(item));
  manager.emitProgress(event('packages', 100, 'success'));
  manager.emitProgress(event('dependencies', 100, 'success'));
  manager.emitProgress(event('completed', 100, 'success'));
  assert.deepEqual(events.map(item => item.state), ['running', 'running', 'success']);
});
