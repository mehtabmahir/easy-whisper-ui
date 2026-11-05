import { useEffect, useRef, useState } from 'react';
import Markdown from 'react-markdown';
import type { CleanupEvent, CleanupPreferences } from '../types/easy-whisper';
import CleanupSettings from './CleanupSettings';
import styles from './styles/CleanupPanel.module.css';

export default function CleanupPanel({ results, preferences, onPreferences, onClose, busy: transcriptionBusy }: {
  results: CleanupEvent[]; preferences: CleanupPreferences;
  onPreferences: (preferences: CleanupPreferences) => void; onClose: () => void; busy: boolean;
}) {
  const documentRef = useRef<HTMLDivElement>(null);
  const [request, setRequest] = useState('');
  const [requestOpen, setRequestOpen] = useState(false);
  const actionWorking = results.some(item => item.action && item.status === 'working');
  const busy = transcriptionBusy || actionWorking || results.some(item => item.live && item.status === 'working');
  const [selected, setSelected] = useState('');
  const [tab, setTab] = useState<'cleaned' | 'original'>('cleaned');
  const [notice, setNotice] = useState('');
  const [now, setNow] = useState(Date.now());
  const result = results.find(item => item.id === selected) ?? results.at(-1);
  useEffect(() => { setTab(result?.live ? 'original' : 'cleaned'); }, [result?.id]);
  useEffect(() => { setSelected(results.at(-1)?.id ?? ''); }, [results.at(-1)?.id]);
  useEffect(() => {
    if (result?.status !== 'working') return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [result?.status, result?.id]);
  const runAction = async (kind: 'summary' | 'custom') => {
    if (!result || busy) return;
    setTab('cleaned'); setNotice('');
    try { await window.easyWhisper?.runTranscriptAction(result.id, preferences, { kind, request: kind === 'custom' ? request.trim() : undefined }); }
    catch (error) { setNotice((error as Error).message); }
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
    <CleanupSettings preferences={preferences} onPreferences={onPreferences} busy={busy} />
    {result && result.status !== 'working' && <section className={styles.postActions} aria-label="Transcript actions">
      <span className={styles.eyebrow}>TRANSCRIPT ACTIONS</span>
      <button disabled={busy} onClick={() => void runAction('summary')}>Summarize</button>
      <button disabled={busy} aria-expanded={requestOpen} onClick={() => setRequestOpen(!requestOpen)}>Custom request</button>
      {requestOpen && <>
        <label>Your request<textarea disabled={busy} maxLength={2000} value={request} placeholder="e.g. List the action items" onChange={event => setRequest(event.target.value)}/></label>
        <button disabled={busy || !request.trim()} onClick={() => void runAction('custom')}>Run request</button>
      </>}
      <small>Uses the selected model and original transcript. Saves a separate Markdown file.</small>
    </section>}
    {result?.live && result.status === 'working' && <div className={styles.postActions}><button onClick={() => void window.easyWhisper?.stopLiveTranscription()}>Stop Live</button></div>}
    {actionWorking && <div className={styles.postActions}><button onClick={() => void window.easyWhisper?.cancelTranscriptAction()}>Stop request</button></div>}
    {results.length > 1 && <select className={styles.history} aria-label="Recent transcripts" value={result?.id} onChange={event => setSelected(event.target.value)}>
      {results.map(item => <option key={item.id} value={item.id}>{fileName(item.source)} · {item.action?.kind === 'summary' ? 'Summary' : item.action ? 'Custom response' : 'Transcript'}</option>)}
    </select>}
    <div className={styles.tabs} role="tablist" aria-label="Transcript version">
      <button role="tab" aria-selected={tab === 'cleaned'} onClick={() => setTab('cleaned')}>{result?.live ? 'Formatted' : result?.action?.kind === 'summary' ? 'Summary' : result?.action ? 'Response' : 'Cleaned'}</button>
      <button role="tab" aria-selected={tab === 'original'} onClick={() => setTab('original')}>Original</button>
      <span className={styles.badge}>{result?.status === 'complete' ? '.md saved' : preferences.provider === 'local' || preferences.provider === 'custom' ? 'LOCAL AI' : preferences.provider === 'openai' ? 'OPENAI' : 'API'}</span>
    </div>
    {result && <div className={styles.status}>
      <div><span role="status">{result.message}</span>{result.status === 'working' && <span>{Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, '0')}</span>}</div>
      {result.status === 'working' && !result.live && <>
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
