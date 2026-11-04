const { test } = require('node:test');
const assert = require('node:assert/strict');
const { isEnglishOnlyModel } = require('../dist/main/services/modelCatalog');

test('English-only detection covers every shipped model, including quantized ones', () => {
  for (const model of ['tiny.en', 'base.en', 'small.en', 'medium.en', 'tiny.en-q5_1']) {
    assert.equal(isEnglishOnlyModel(model), true, model);
  }
  for (const model of ['tiny', 'base', 'small', 'medium', 'large-v3', 'large-v3-turbo']) {
    assert.equal(isEnglishOnlyModel(model), false, model);
  }
});

test('custom models are judged by file name and never guessed', () => {
  assert.equal(isEnglishOnlyModel('custom', '/models/ggml-medium.en.bin'), true);
  assert.equal(isEnglishOnlyModel('custom', '/models/ggml-tiny.en-q5_1.bin'), true);
  assert.equal(isEnglishOnlyModel('custom', 'C:\\models\\ggml-base.en.gguf'), true);
  assert.equal(isEnglishOnlyModel('custom', '/models/ggml-medium.bin'), false);
  assert.equal(isEnglishOnlyModel('custom', '/models/english-model.bin'), false);
  assert.equal(isEnglishOnlyModel('custom'), false);
  assert.equal(isEnglishOnlyModel(undefined), false);
});
