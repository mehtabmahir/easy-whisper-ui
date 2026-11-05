import { useEffect, useState } from 'react';
import Markdown from 'react-markdown';
import type { CleanupEvent, CleanupPreferences } from '../types/easy-whisper';
import styles from './styles/CleanupPanel.module.css';

export default function CleanupPanel({ results, preferences, onPreferences, onClose, busy }: {
  results: CleanupEvent[]; preferences: CleanupPreferences;
  onPreferences: (preferences: CleanupPreferences) => void; onClose: () => void; busy: boolean;
}) {
  const [selected, setSelected] = useState('');
  const [tab, setTab] = useState<'cleaned' | 'original'>('cleaned');
  const [settings, setSettings] = useState(false);
  const [key, setKey] = useState('');
  const [keySaved, setKeySaved] = useState(false);
  const [notice, setNotice] = useState('');
  const [now, setNow] = useState(Date.now());
  const result = results.find(item => item.id === selected) ?? results.at(-1);
  useEffect(() => { setSelected(results.at(-1)?.id ?? ''); }, [results.at(-1)?.id]);
  useEffect(() => { void window.easyWhisper?.hasCleanupApiKey().then(setKeySaved); }, []);
  useEffect(() => {
    if (result?.status !== 'working') return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [result?.status, result?.id]);
  const saveKey = async () => {
    try { await window.easyWhisper?.setCleanupApiKey(key); setKeySaved(!!key.trim()); setKey(''); setNotice('Key updated for this session.'); }
    catch { setNotice('Could not save the key. Check its format.'); }
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(tab === 'original' ? result?.original ?? '' : result?.markdown ?? ''); setNotice('Copied to clipboard.'); }
    catch { setNotice('Could not copy. You can select and copy the text below.'); }
  };
  const fileName = (value: string) => value.split(/[\\/]/).pop() ?? value;
  const elapsed = result ? Math.max(0, Math.floor((now - result.startedAt) / 1000)) : 0;
  return <aside className={styles.panel} aria-label="Transcript reader">
    <header className={styles.header}>
      <div><span className={styles.eyebrow}>YOUR TRANSCRIPT</span><h2>A clearer read.</h2></div>
      <div className={styles.actions}>
        <button type="button" onClick={() => setSettings(!settings)} aria-expanded={settings} aria-label="Cleanup settings" title="Cleanup settings">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3" fill="var(--glass)"/><circle cx="15" cy="17" r="3" fill="var(--glass)"/></svg>
        </button>
        <button type="button" onClick={onClose} aria-label="Close transcript reader">×</button>
      </div>
    </header>
    {settings && <div className={styles.settings}>
      <label>Cleanup runs<select disabled={busy} value={preferences.provider}
        onChange={event => onPreferences({ ...preferences, provider: event.target.value as CleanupPreferences['provider'] })}>
        <option value="local">On this device</option><option value="openai">With an OpenAI API key</option>
      </select></label>
      {preferences.provider === 'local' ? <p>Qwen 2.5 · 0.5B. A one-time 491 MB download, then offline. Uses available graphics acceleration.</p> : <>
        <p>Transcript text is sent to OpenAI for cleanup. API usage is billed to your account. Audio stays on this device.</p>
        <label>Model ID<input disabled={busy} value={preferences.apiModel} placeholder="Enter your OpenAI model ID" onChange={event => onPreferences({ ...preferences, apiModel: event.target.value })}/></label>
        <label>API key<input type="password" autoComplete="off" spellCheck={false} disabled={busy} value={key} placeholder={keySaved ? 'Key set for this session' : 'Paste your API key'} onChange={event => setKey(event.target.value)}/></label>
        <div className={styles.keyActions}><button disabled={busy || !key.trim()} onClick={() => void saveKey()}>Use key for this session</button>
          {keySaved && <button disabled={busy} onClick={() => { void window.easyWhisper?.setCleanupApiKey('').then(() => { setKeySaved(false); setNotice('Key removed.'); }); }}>Remove key</button>}</div>
        <p>The key is never saved to disk. Add it again after restarting.</p>
      </>}
    </div>}
    {results.length > 1 && <select className={styles.history} aria-label="Recent transcripts" value={result?.id} onChange={event => setSelected(event.target.value)}>
      {results.map(item => <option key={item.id} value={item.id}>{fileName(item.source)}</option>)}
    </select>}
    <div className={styles.tabs} role="tablist" aria-label="Transcript version">
      <button role="tab" aria-selected={tab === 'cleaned'} onClick={() => setTab('cleaned')}>Cleaned</button>
      <button role="tab" aria-selected={tab === 'original'} onClick={() => setTab('original')}>Original</button>
      <span className={styles.badge}>{result?.status === 'complete' ? '.md saved' : preferences.provider === 'local' ? 'LOCAL AI' : 'OPENAI'}</span>
    </div>
    {result && <div className={styles.status}>
      <div><span role="status">{result.message}</span>{result.status === 'working' && <span>{Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, '0')}</span>}</div>
      {result.status === 'working' && <>
        <progress aria-label="Cleanup sections completed" max={result.total || 1} value={result.completed}/>
        <small>{result.completed} / {result.total || '…'} sections · You can read the original now.</small>
      </>}
    </div>}
    <div className={styles.document} role="tabpanel" tabIndex={0} aria-label={tab === 'original' ? 'Original transcript' : 'Cleaned Markdown'}>
      {!result ? <div className={styles.empty}><div className={styles.documentIcon}>Aa</div><h3>From spoken to readable.</h3><p>After transcription, a tiny model tidies punctuation and paragraphs into a separate Markdown file.</p><p>Your original is always kept.</p><button onClick={() => setSettings(true)}>Choose cleanup model</button></div>
        : tab === 'original' ? <><h3>{fileName(result.source)}</h3><div className={styles.original}>{result.original}</div></>
        : result.markdown ? <Markdown skipHtml components={{ a: ({ children }) => <span>{children}</span>, img: ({ alt }) => <span>{alt ?? ''}</span> }}>{result.markdown}</Markdown>
        : <div className={styles.empty}><div className={styles.documentIcon}>Aa</div><h3>{result.status === 'working' ? 'Making room to read.' : 'Your original is safe.'}</h3><p>{result.status === 'working' ? 'Cleaned text will appear here as it is written. Switch to Original to start reading.' : 'Switch to Original to read the transcript. Check cleanup settings before your next run.'}</p></div>}
    </div>
    <footer className={styles.footer}>
      <span>{notice || (result?.status === 'working' ? 'Draft · not saved yet' : 'AI edits can be imperfect. Compare with Original.')}</span>
      <div className={styles.actions}><button disabled={!result || (tab === 'cleaned' && !result.markdown)} onClick={() => void copy()}>Copy</button>
        <button disabled={!result?.outputPath} onClick={() => { if (result) void window.easyWhisper?.revealCleanupFile(result.id); }}>Show file</button></div>
    </footer>
  </aside>;
}
