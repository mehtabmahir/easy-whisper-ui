const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
test('picker folders persist independently, preserve preferences, and fall back when missing', () => {
  let saved;
  const folders = new Set(['C:\\Audio', 'C:\\Models']);
  const mockFs = { readFileSync: () => saved || '{}', mkdirSync() {}, writeFileSync: (_, value) => saved = value, renameSync() {}, statSync: folder => ({ isDirectory: () => folders.has(folder) }) };
  const source = fs.readFileSync(path.join(__dirname, '../src/main/services/appSettings.ts'), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
  function load() {
    const exports = {};
    vm.runInNewContext(code, { exports, console, require: name => name === 'node:fs' ? mockFs : name === 'electron' ? { app: { getPath: key => key === 'documents' ? 'C:\\Documents' : 'C:\\Settings' } } : require(name) });
    return exports;
  }
  let settings = load();
  settings.setClearAudioCacheOnExit(false);
  settings.rememberPickerDirectory('input', 'C:\\Audio\\sample.mp3');
  settings.rememberPickerDirectory('model', 'C:\\Models\\tiny.bin');
  settings = load();
  assert.equal(settings.getPickerDirectory('input'), 'C:\\Audio');
  assert.equal(settings.getPickerDirectory('model'), 'C:\\Models');
  assert.equal(settings.getClearAudioCacheOnExit(), false);
  settings.setClearAudioCacheOnExit(true);
  settings.rememberPickerDirectory('input', undefined);
  assert.equal(settings.getPickerDirectory('input'), 'C:\\Audio');
  assert.equal(settings.getPickerDirectory('model'), 'C:\\Models');
  folders.delete('C:\\Models');
  assert.equal(settings.getPickerDirectory('model'), 'C:\\Documents');
});
