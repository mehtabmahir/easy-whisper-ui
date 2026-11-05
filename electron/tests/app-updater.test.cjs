const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { AppUpdater, selectUpdate } = require('../dist/main/services/appUpdater');
const data = Buffer.from('test installer');
function release(platform = 'macOS-arm64.dmg') {
 const name = platform.startsWith('win') ? `EasyWhisperUI-Setup-3.2.0-${platform}` : `EasyWhisperUI-3.2.0-${platform}`;
 return { tag_name: 'v3.2', draft: false, prerelease: false, assets: [{ name, size: data.length, digest: `sha256:${createHash('sha256').update(data).digest('hex')}`, browser_download_url: `https://github.com/mehtabmahir/easy-whisper-ui/releases/download/v3.2/${name}` }] };
}
test('selects stable installers for the exact platform and architecture', () => {
 assert.equal(selectUpdate(release(), '3.1.0', 'darwin', 'arm64').version, '3.2.0');
 assert.ok(selectUpdate(release('win-x64.exe'), '3.1.0', 'win32', 'x64'));
 assert.equal(selectUpdate(release(), '3.2.0', 'darwin', 'arm64'), undefined);
 assert.equal(selectUpdate(release(), '3.3.0', 'darwin', 'arm64'), undefined);
 assert.equal(selectUpdate({...release(), prerelease:true}, '3.1.0', 'darwin', 'arm64'), undefined);
 assert.throws(() => selectUpdate(release(), '3.1.0', 'darwin', 'x64'), /no installer/);
 const bad = release(); bad.assets[0].digest = '';
 assert.throws(() => selectUpdate(bad, '3.1.0', 'darwin', 'arm64'), /verification/);
 bad.assets[0] = {...release().assets[0], browser_download_url:'https://example.com/install.dmg'};
 assert.throws(() => selectUpdate(bad, '3.1.0', 'darwin', 'arm64'), /address/);
});
for (const scenario of ['success', 'corrupt', 'truncated', 'redirect', 'cancel', 'busy', 'open failure']) {
 test(`update handoff: ${scenario}`, async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'updater-test-'));
  const originalFetch = global.fetch;
  const states = []; let handedOff = false, busy = scenario === 'busy';
  global.fetch = async url => String(url).includes('api.github.com') ? Response.json(release()) : scenario === 'redirect' ? new Response(null, {status:302, headers:{location:'https://example.com/installer'}}) : new Response(scenario === 'corrupt' ? Buffer.alloc(data.length) : scenario === 'truncated' ? data.subarray(1) : data);
  const updater = new AppUpdater({current:'3.1.0', platform:'darwin', arch:'arm64', directory, busy:()=>busy,
   emit: state => {states.push(state.status); if(state.status === 'verifying' && scenario === 'cancel') updater.cancel(); if(state.status === 'waiting') {assert.equal(handedOff,false); busy=false;}},
   handoff: async file => {if(scenario === 'open failure') throw new Error('Cannot open installer'); assert.deepEqual(await fs.readFile(file),data); handedOff=true;}
  });
  try {
   await updater.check(); assert.equal(updater.snapshot().status,'available'); await updater.install();
   assert.equal(handedOff, ['success','busy'].includes(scenario));
   if(scenario === 'busy') assert.ok(states.includes('waiting'));
   if(!handedOff) {assert.equal(updater.snapshot().status,scenario === 'cancel' ? 'available' : 'error'); assert.deepEqual(await fs.readdir(directory),[]);}
  } finally {global.fetch=originalFetch; await fs.rm(directory,{recursive:true,force:true});}
 });
}
