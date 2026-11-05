import { useEffect, useRef, useState } from 'react';
import Markdown from 'react-markdown';
import type { CleanupEvent, CleanupPreferences } from '../types/easy-whisper';
import styles from './styles/CleanupPanel.module.css';

export default function CleanupPanel({ results, preferences, onPreferences, onClose, busy }: {
  results: CleanupEvent[]; preferences: CleanupPreferences;
  onPreferences: (preferences: CleanupPreferences) => void; onClose: () => void; busy: boolean;
}) {
  const documentRef = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState('');
  const [tab, setTab] = useState<'cleaned' | 'original'>('cleaned');
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
  const changeDestination = async (next: CleanupPreferences) => {
    await window.easyWhisper?.setCleanupApiKey('');
    setKey(''); setKeySaved(false); setNotice('');
    onPreferences(next);
  };
  const saveKey = async () => {
    try { await window.easyWhisper?.setCleanupApiKey(key); setKeySaved(!!key.trim()); setKey(''); setNotice('Key updated for this session.'); }
    catch { setNotice('Could not save the key. Check its format.'); }
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(tab === 'original' ? result?.original ?? '' : result?.markdown ?? ''); setNotice('Copied to clipboard.'); }
    catch { setNotice('Could not copy. You can select and copy the text below.'); }
  };
  const topics = (result?.markdown.match(/^#{2,3} .+$/gm) ?? []).map(line => line.replace(/^#{2,3} /, '').replace(/[*`]/g, ''));
  const fileName = (value: string) => value.split(/[\\/]/).pop() ?? value;
  const elapsed = result ? Math.max(0, Math.floor((now - result.startedAt) / 1000)) : 0;
  return <aside className={styles.panel} aria-label="Transcript reader" onKeyDown={event => { if (event.key === "Escape" && !(event.target instanceof HTMLSelectElement)) onClose(); }}>
    <header className={styles.header}>
      <div><h2>Transcript</h2></div>
      <div className={styles.actions}>
        <button type="button" onClick={onClose} aria-label="Close transcript reader">×</button>
      </div>
    </header>
    <div className={styles.readerLayout}>
    <nav className={styles.sidebar} aria-label="Transcript controls">
    <div className={styles.settings}>
      <span className={styles.eyebrow}>CLEANUP SETTINGS</span>
      <label>Model<select disabled={busy} value={preferences.provider}
        onChange={event => void changeDestination({ ...preferences, provider: event.target.value as CleanupPreferences['provider'] })}>
        <option value="local">Qwen 2.5 · 0.5B (built-in)</option><option value="custom">Custom model file</option><option value="openai">OpenAI API Key</option><option value="compatible">Other API Key</option>
      </select></label>
      {preferences.provider === 'local' ? <p>Qwen 2.5 · 0.5B. A one-time 491 MB download, then offline. Uses available graphics acceleration.</p> : preferences.provider === 'custom' ? <>
        <p>Choose a GGUF instruction-tuned language model. Runs on this device. Whisper speech models cannot be used for cleanup.</p>
        <button disabled={busy} onClick={async () => {
          const customModelPath = await window.easyWhisper?.openCleanupModelFile();
          if (customModelPath) onPreferences({ ...preferences, customModelPath });
        }}>Choose model file</button>
        <p title={preferences.customModelPath}>{preferences.customModelPath ? fileName(preferences.customModelPath) : 'No model selected'}</p>
      </> : <>
        <p>Transcript text is sent to {preferences.provider === 'openai' ? 'OpenAI' : 'the provider at your endpoint'} for cleanup. API usage may be billed to your account. Audio stays on this device.</p>
        {preferences.provider === 'compatible' && <label>Chat completions endpoint<input type="url" disabled={busy} value={preferences.apiEndpoint ?? ''} placeholder="https://provider.example/v1/chat/completions" onChange={event => void changeDestination({ ...preferences, apiEndpoint: event.target.value })}/><small>Requires an OpenAI-compatible API.</small></label>}
        <label>Model ID<input disabled={busy} value={preferences.apiModel} placeholder="Enter your provider’s model ID" onChange={event => onPreferences({ ...preferences, apiModel: event.target.value })}/></label>
        <label>API key<input type="password" autoComplete="off" spellCheck={false} disabled={busy} value={key} placeholder={keySaved ? 'Key set for this session' : 'Paste your API key'} onChange={event => setKey(event.target.value)}/></label>
        <div className={styles.keyActions}><button disabled={busy || !key.trim()} onClick={() => void saveKey()}>Use key for this session</button>
          {keySaved && <button disabled={busy} onClick={() => { void window.easyWhisper?.setCleanupApiKey('').then(() => { setKeySaved(false); setNotice('Key removed.'); }); }}>Remove key</button>}</div>
        <p>The key is never saved to disk. Add it again after restarting.</p>
      </>}
    </div>
    {results.length > 1 && <select className={styles.history} aria-label="Recent transcripts" value={result?.id} onChange={event => setSelected(event.target.value)}>
      {results.map(item => <option key={item.id} value={item.id}>{fileName(item.source)}</option>)}
    </select>}
    <div className={styles.tabs} role="tablist" aria-label="Transcript version">
      <button role="tab" aria-selected={tab === 'cleaned'} onClick={() => setTab('cleaned')}>Cleaned</button>
      <button role="tab" aria-selected={tab === 'original'} onClick={() => setTab('original')}>Original</button>
      <span className={styles.badge}>{result?.status === 'complete' ? '.md saved' : preferences.provider === 'local' || preferences.provider === 'custom' ? 'LOCAL AI' : preferences.provider === 'openai' ? 'OPENAI' : 'API'}</span>
    </div>
    {result && <div className={styles.status}>
      <div><span role="status">{result.message}</span>{result.status === 'working' && <span>{Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, '0')}</span>}</div>
      {result.status === 'working' && <>
        <progress aria-label="Cleanup sections completed" max={result.total || 1} value={result.completed}/>
        <small>{result.completed} / {result.total || '…'} sections · You can read the original now.</small>
      </>}
    </div>}
    {tab === 'cleaned' && topics.length > 0 && <details className={styles.contents}>
      <summary>On this page · {topics.length} topics</summary>
      <ol>{topics.map((topic, index) => <li key={index}><button onClick={() => documentRef.current?.querySelectorAll('h2, h3')[index]?.scrollIntoView({ block: 'start' })}>{topic}</button></li>)}</ol>
    </details>}
    <footer className={styles.footer}>
      <span>{notice || (result?.status === 'working' ? 'Draft · not saved yet' : 'AI edits can be imperfect. Compare with Original.')}</span>
      <div className={styles.actions}><button disabled={!result || (tab === 'cleaned' && !result.markdown)} onClick={() => void copy()}>Copy</button>
        <button disabled={!result?.outputPath} onClick={() => { if (result) void window.easyWhisper?.revealCleanupFile(result.id); }}>Show file</button></div>
    </footer>
    </nav>
    <section className={styles.reading} aria-label="Transcript output">
    <div ref={documentRef} className={styles.document} role="tabpanel" tabIndex={0} aria-label={tab === 'original' ? 'Original transcript' : 'Cleaned Markdown'}>
      {!result ? <div className={styles.empty}><div className={styles.documentIcon}>Aa</div><h3>No transcript yet</h3><p>After transcription, the selected model formats the text into a separate Markdown file.</p><p>Your original is always kept.</p></div>
        : tab === 'original' ? <><h3>{fileName(result.source)}</h3><div className={styles.original}>{result.original}</div></>
        : result.markdown ? <Markdown skipHtml components={{ a: ({ children }) => <span>{children}</span>, img: ({ alt }) => <span>{alt ?? ''}</span> }}>{result.markdown}</Markdown>
        : <div className={styles.empty}><div className={styles.documentIcon}>Aa</div><h3>{result.status === 'working' ? 'Formatting transcript…' : 'Original transcript available'}</h3><p>{result.status === 'working' ? 'Cleaned text will appear here as it is written. Switch to Original to start reading.' : 'Switch to Original to read the transcript. Check cleanup settings before your next run.'}</p></div>}
    </div>

    </section>
    </div>
  </aside>;
}
