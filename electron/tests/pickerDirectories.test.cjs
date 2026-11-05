const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
test('picker folders persist independently, preserve preferences, and fall back when missing', () => {
  let saved;
  const audioDir = path.resolve('picker-test', 'Audio');
  const modelDir = path.resolve('picker-test', 'Models');
  const documentsDir = path.resolve('picker-test', 'Documents');
  const settingsDir = path.resolve('picker-test', 'Settings');
  const folders = new Set([audioDir, modelDir]);
  const mockFs = { readFileSync: () => saved || '{}', mkdirSync() {}, writeFileSync: (_, value) => saved = value, renameSync() {}, statSync: folder => ({ isDirectory: () => folders.has(folder) }) };
  const source = fs.readFileSync(path.join(__dirname, '../src/main/services/appSettings.ts'), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
  function load() {
    const exports = {};
    vm.runInNewContext(code, { exports, console, require: name => name === 'node:fs' ? mockFs : name === 'electron' ? { app: { getPath: key => key === 'documents' ? documentsDir : settingsDir } } : require(name) });
    return exports;
  }
  let settings = load();
  settings.setClearAudioCacheOnExit(false);
  settings.rememberPickerDirectory('input', path.join(audioDir, 'sample.mp3'));
  settings.rememberPickerDirectory('model', path.join(modelDir, 'tiny.bin'));
  settings = load();
  assert.equal(settings.getPickerDirectory('input'), audioDir);
  assert.equal(settings.getPickerDirectory('model'), modelDir);
  assert.equal(settings.getClearAudioCacheOnExit(), false);
  settings.setClearAudioCacheOnExit(true);
  settings.rememberPickerDirectory('input', undefined);
  assert.equal(settings.getPickerDirectory('input'), audioDir);
  assert.equal(settings.getPickerDirectory('model'), modelDir);
  folders.delete(modelDir);
  assert.equal(settings.getPickerDirectory('model'), documentsDir);
});
