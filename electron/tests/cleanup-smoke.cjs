// Opt-in real-model smoke test: node tests/cleanup-smoke.cjs <model-cache-profile>
// Not part of the normal suite; no downloads or API calls unless invoked explicitly.
if (process.argv[2]) {
  const Module = require('node:module');
  const originalLoad = Module._load;
  Module._load = function(name, ...args) {
    if (name === 'electron') return { app: { getPath: () => process.argv[2] } };
    return originalLoad.call(this, name, ...args);
  };
  const { cleanupTranscript } = require('../dist/main/services/transcriptCleanup');
  Module._load = originalLoad;
  const start = Date.now();
  let final;
  cleanupTranscript({ source: 'meeting-sample.wav', outputBase: require('node:path').join(process.argv[2], 'meeting-sample.wav'),
    original: 'hello everyone thanks for joining today we need to review the release plan the budget is 450 dollars and we have 3 tasks remaining first we need to finish testing on windows then we need to update the documentation finally we should check the installer please keep the original recordings until friday',
    preferences: { provider: 'local', apiModel: '' }, signal: new AbortController().signal,
    emit: event => { final = event; }
  }).then(() => {
    console.log(JSON.stringify({ seconds: (Date.now() - start) / 1000, status: final.status, message: final.message, markdown: final.markdown }));
    if (final.status !== 'complete') process.exitCode = 1;
  }).catch(error => { console.error(error); process.exitCode = 1; });
}
