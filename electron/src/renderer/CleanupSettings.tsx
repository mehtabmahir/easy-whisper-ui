import { useEffect, useState } from 'react';
import type { CleanupPreferences, HardwareInfo } from '../types/easy-whisper';
import { CLEANUP_MODELS, cleanupModel } from '../main/services/cleanupModelCatalog';
import styles from './styles/CleanupPanel.module.css';

export default function CleanupSettings({ preferences, onPreferences, busy, compact = false }: {
  preferences: CleanupPreferences; onPreferences: (value: CleanupPreferences) => void; busy: boolean; compact?: boolean;
}) {
  const [hardware, setHardware] = useState<HardwareInfo>();
  useEffect(() => { void window.easyWhisper?.getHardwareInfo().then(setHardware).catch(() => {}); }, []);
  const chosenModel = cleanupModel(preferences.localModel);
  const [key, setKey] = useState('');
  const [keySaved, setKeySaved] = useState(false);
  const [notice, setNotice] = useState('');
  useEffect(() => { void window.easyWhisper?.hasCleanupApiKey().then(setKeySaved); }, []);
  const changeDestination = async (next: CleanupPreferences) => {
    await window.easyWhisper?.setCleanupApiKey('');
    setKey(''); setKeySaved(false); setNotice('');
    onPreferences(next);
  };
  const saveKey = async () => {
    try { await window.easyWhisper?.setCleanupApiKey(key); setKeySaved(!!key.trim()); setKey(''); setNotice('Key updated for this session.'); }
    catch { setNotice('Could not save the key. Check its format.'); }
  };
  const fileName = (value: string) => value.split(/[\\/]/).pop() ?? value;
  return <div className={`${styles.settings} ${compact ? styles.embeddedSettings : ""}`}>
      {!compact && <span className={styles.eyebrow}>CLEANUP SETTINGS</span>}
      <label>Model<select disabled={busy} value={preferences.provider}
        onChange={event => void changeDestination({ ...preferences, provider: event.target.value as CleanupPreferences['provider'] })}>
        <option value="local">Built-in model</option><option value="custom">Custom model file</option><option value="openai">OpenAI API Key</option><option value="compatible">Other API Key</option>
      </select></label>
      {preferences.provider === 'local' ? <>
        <label>Local model<select disabled={busy} value={chosenModel.id} onChange={event => onPreferences({ ...preferences, localModel: event.target.value })}>
          {CLEANUP_MODELS.map(model => <option key={model.id} value={model.id}>{model.label} · {(model.files.reduce((sum, file) => sum + file.bytes, 0) / 1e9).toFixed(2)} GB</option>)}
        </select></label>
        <p className={hardware ? hardware.ramGiB < chosenModel.ramGiB ? styles.memoryWarning : styles.memoryFits : undefined}
          role="status" title="Estimated system memory recommendation; actual use varies.">
          {chosenModel.ramGiB} GB RAM suggested{hardware ? hardware.ramGiB < chosenModel.ramGiB ? ' · Low memory' : ' · Fits' : ''}<br /><span title="Relative quality estimate for built-in models; results vary.">Quality: {chosenModel.quality}</span>
        </p>
      </> : preferences.provider === 'custom' ? <>
        <p>Choose a GGUF instruction-tuned language model. Runs on this device. Whisper speech models cannot be used for cleanup.</p>
        <button disabled={busy} onClick={async () => {
          const customModelPath = await window.easyWhisper?.openCleanupModelFile();
          if (customModelPath) onPreferences({ ...preferences, customModelPath });
        }}>Choose model file</button>
        <p title={preferences.customModelPath}>{preferences.customModelPath ? fileName(preferences.customModelPath) : 'No model selected'}</p>
      </> : <>
        <p>Transcript text is sent to {preferences.provider === 'openai' ? 'OpenAI' : 'the provider at your endpoint'} for cleanup. API usage may be billed to your account. Audio stays on this device.</p>
        {preferences.provider === 'compatible' && <label>Chat completions endpoint<input type="url" disabled={busy} value={preferences.apiEndpoint ?? ''} placeholder="https://provider.example/v1/chat/completions" onChange={event => void changeDestination({ ...preferences, apiEndpoint: event.target.value })}/><small>Requires an OpenAI-compatible API.</small></label>}
        <label>Model ID<input disabled={busy} value={preferences.apiModel} placeholder="Model ID" onChange={event => onPreferences({ ...preferences, apiModel: event.target.value })}/></label>
        <label>API key<input type="password" autoComplete="off" spellCheck={false} disabled={busy} value={key} placeholder={keySaved ? 'Key set for this session' : 'Paste your API key'} onChange={event => setKey(event.target.value)}/></label>
        <div className={styles.keyActions}><button disabled={busy || !key.trim()} onClick={() => void saveKey()}>Use key for this session</button>
          {keySaved && <button disabled={busy} onClick={() => { void window.easyWhisper?.setCleanupApiKey('').then(() => { setKeySaved(false); setNotice('Key removed.'); }); }}>Remove key</button>}</div>
        <p>The key is never saved to disk. Add it again after restarting.</p>
      </>}
      {notice && <p role="status">{notice}</p>}
    </div>;
}
