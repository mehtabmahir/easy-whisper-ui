import { useEffect, useRef } from 'react';
import type { AppUpdateState } from '../types/easy-whisper';
import styles from './styles/SettingsPanel.module.css';
import LoadingBar from './LoadingBar';
export default function UpdatePanel({ state, onClose }: { state: AppUpdateState; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => { const dialog = dialogRef.current!; dialog.showModal(); return () => dialog.close(); }, []);
  const working = ['downloading', 'verifying', 'waiting', 'opening'].includes(state.status);
  const mac = window.easyWhisper?.platform() === 'darwin';
  const run = (action: 'checkAppUpdate' | 'installAppUpdate' | 'cancelAppUpdate') => { void window.easyWhisper?.[action](); };
  return <dialog ref={dialogRef} className={styles.panel} aria-labelledby="update-title"
    onCancel={event => { event.preventDefault(); if (!working) onClose(); }}>
    <header className={styles.header}><h2 id="update-title">{state.version ? 'Update available' : 'App updates'}</h2>
      <button disabled={working} onClick={onClose} aria-label="Close updates">Close</button></header>
    <section>
      <p className={styles.note}>Installed version: {state.currentVersion}</p>
      {state.version && <h3>EasyWhisperUI {state.version}</h3>}
      {state.status === 'checking' && <LoadingBar label="Checking for updates" paceSeconds={10}/>}
      {state.status === 'current' && <p role="status">You’re up to date.</p>}
      {state.status === 'available' && <>
        <p>{state.totalBytes ? `${Math.ceil(state.totalBytes / 1e6)} MB download. ` : ''}The app will close after opening the {mac ? 'DMG' : 'installer'}.</p>
        {mac && <p className={styles.note}>Drag the new app into Applications to replace the old version.</p>}
      </>}
      {state.status === 'downloading' && <div role="status"><p>Downloading update… {Math.round((state.receivedBytes ?? 0) / (state.totalBytes || 1) * 100)}%</p>
        <progress aria-label="Update download" value={state.receivedBytes ?? 0} max={state.totalBytes || 1}/></div>}
      {state.status === 'verifying' && <p role="status">Verifying download…</p>}
      {state.message && <p role={state.status === 'error' ? 'alert' : 'status'}>{state.message}</p>}
      <div className={styles.modelActions}>
        {state.status === 'available' && <><button className={styles.reinstall} onClick={() => run('installAppUpdate')}>Update</button><button onClick={onClose}>Later</button></>}
        {['idle', 'current', 'error'].includes(state.status) && <button onClick={() => run('checkAppUpdate')}>{state.status === 'error' ? 'Try again' : 'Check for updates'}</button>}
        {working && state.status !== 'opening' && <button onClick={() => run('cancelAppUpdate')}>Cancel update</button>}
      </div>
    </section>
  </dialog>;
}
