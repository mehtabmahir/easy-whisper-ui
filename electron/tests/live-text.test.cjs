const { test } = require('node:test');
const assert = require('node:assert/strict');
const { prepareLiveText } = require('../dist/main/services/liveText');
test('LLM input removes markers and reconciles progressive live hypotheses', () => {
 const raw = '[Start speaking]\n[BLANK_AUDIO]\nHello.\nHello test.\nHello testing this is\nHello testing.\nThis is a test\nHello testing, this is a test.\nHello testing this is a test\n[BLANK_AUDIO]\nThis is a test.\nThis is a test of the\nThis is a test of the model.\nI\nI am current.\nI am currently watching\nI am currently watching regular\nI am currently watching regular show.';
 const text = prepareLiveText(raw);
 assert.doesNotMatch(text, /BLANK_AUDIO|Start speaking|Hello test\.|I am current\./);
 assert.match(text, /I am currently watching regular show\./);
 assert.equal((text.match(/Hello testing/g) ?? []).length, 1);
});
test('distinct statements and nonadjacent repeated statements stay in order', () => {
 assert.equal(prepareLiveText('We use TCP.\nUDP differs.\nWe use TCP.'), 'We use TCP.\n\nUDP differs.\n\nWe use TCP.');
 assert.equal(prepareLiveText('[BLANK_AUDIO]'), '');
});
