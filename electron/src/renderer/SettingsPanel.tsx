import { useEffect, useRef, useState } from "react";
import type { CleanupPreferences, CompileProgressEvent, ModelDownloadProgress, UninstallInfo } from "../types/easy-whisper";
import styles from "./styles/SettingsPanel.module.css";
import CleanupSettings from "./CleanupSettings";
import LoadingBar from "./LoadingBar";
import { setupProgress } from "./setupProgress";

export default function SettingsPanel({ busy, progress, downloadProgress, onClose, cleanupEnabled, onCleanupEnabled, cleanupPreferences, onCleanupPreferences }: {
  busy: boolean;
  cleanupEnabled: boolean;
  onCleanupEnabled: (value: boolean) => void;
  cleanupPreferences: CleanupPreferences;
  onCleanupPreferences: (value: CleanupPreferences) => void;
  downloadProgress?: ModelDownloadProgress;
  progress: CompileProgressEvent;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const isMac = window.easyWhisper?.platform() === "darwin";
  const [reinstalling, setReinstalling] = useState(false);
  const [uninstalling, setUninstalling] = useState(false);
  const [uninstallInfo, setUninstallInfo] = useState<UninstallInfo>();
  const [uninstallError, setUninstallError] = useState<string>();
  const [clearOnExit, setClearOnExit] = useState(true);
  const [cachePreferenceReady, setCachePreferenceReady] = useState(false);
  const [savingCachePreference, setSavingCachePreference] = useState(false);
  const [cacheBytes, setCacheBytes] = useState<number>();
  useEffect(() => {
    let active = true;
    const refresh = async () => {
      try { const bytes = await window.easyWhisper?.getAudioCacheSize(); if (active) setCacheBytes(bytes); }
      catch { if (active) setCacheBytes(undefined); }
    };
    void refresh();
    const timer = setInterval(() => void refresh(), 5000);
    return () => { active = false; clearInterval(timer); };
  }, []);
  const [logResult, setLogResult] = useState<string>();
  useEffect(() => {
    let active = true;
    window.easyWhisper?.getClearAudioCacheOnExit().then((value) => {
      if (active) { setClearOnExit(value); setCachePreferenceReady(true); }
    }).catch(() => { if (active) setCacheResult("Could not load cache preference. Reopen Settings to retry."); });
    return () => { active = false; };
  }, []);

  async function changeCachePreference(value: boolean) {
    if (!window.easyWhisper || savingCachePreference) return;
    setSavingCachePreference(true);
    setCacheResult(undefined);
    try {
      await window.easyWhisper.setClearAudioCacheOnExit(value);
      setClearOnExit(value);
    } catch { setCacheResult("Could not save cache preference. Try again."); }
    finally { setSavingCachePreference(false); }
  }

  async function openAudioCacheFolder() {
    setCacheResult(undefined);
    try {
      const response = await window.easyWhisper?.openAudioCacheFolder();
      if (response && !response.success) setCacheResult(response.error ?? "Could not open the audio folder.");
    }
    catch (error) { setCacheResult((error as Error).message); }
  }

  async function showLog() {
    setLogResult(undefined);
    try {
      const response = await window.easyWhisper?.showSetupLog();
      if (response && !response.success) setLogResult(response.error ?? "Could not open the log file.");
    }
    catch (error) { setLogResult((error as Error).message); }
  }

  const [clearingCache, setClearingCache] = useState(false);
  const [cacheResult, setCacheResult] = useState<string>();
  const working = savingCachePreference || reinstalling || uninstalling || clearingCache || Boolean(downloadProgress);
  const closeBlocked = working && !reinstalling && !downloadProgress;

  async function clearCache() {
    if (busy || working || !window.easyWhisper) return;
    setClearingCache(true);
    setCacheResult(undefined);
    try {
      const result = await window.easyWhisper.clearAudioCache();
      if (result.success) setCacheBytes(await window.easyWhisper.getAudioCacheSize());
      setCacheResult(result.success ? "Audio cache cleared." : result.error ?? "Could not clear the audio cache.");
    } catch (error) {
      setCacheResult((error as Error).message);
    } finally { setClearingCache(false); }
  }
  const [result, setResult] = useState<{ success: boolean; message: string }>();

  useEffect(() => {
    const dialog = dialogRef.current!;
    dialog.showModal();
    return () => dialog.close();
  }, []);

  useEffect(() => {
    if (isMac) return;
    let active = true;
    window.easyWhisper?.getUninstallInfo().then((info) => {
      if (active) setUninstallInfo(info);
    }).catch(() => {
      if (active) setUninstallInfo({ available: false, reason: "Could not check uninstall availability. Close and reopen Settings to retry." });
    });
    return () => { active = false; };
  }, [isMac]);

  async function uninstall() {
    if (busy || working || !uninstallInfo?.available || !window.easyWhisper) return;
    setUninstalling(true);
    setUninstallError(undefined);
    try {
      const response = await window.easyWhisper.uninstallFully();
      if (!response.success && !response.canceled) setUninstallError(response.error ?? "Could not open the uninstaller.");
    } catch (error) {
      setUninstallError((error as Error).message);
    } finally {
      setUninstalling(false);
    }
  }

  async function reinstall() {
    if (busy || working || !window.easyWhisper) return;
    setReinstalling(true);
    setResult(undefined);
    try {
      const response = await window.easyWhisper.cleanReinstall();
      if (!response.canceled) {
        setResult({ success: response.success, message: response.success
          ? "Whisper is reinstalled and ready to use."
          : response.error ?? "Reinstall failed. You can try again." });
      }
    } catch (error) {
      setResult({ success: false, message: (error as Error).message });
    } finally {
      setReinstalling(false);
    }
  }

  return <dialog ref={dialogRef} className={styles.panel} aria-labelledby="settings-title"
    onCancel={(event) => { event.preventDefault(); if (!closeBlocked) onClose(); }}>
    <header className={styles.header}>
      <h2 id="settings-title">Settings</h2>
      <button type="button" onClick={onClose} disabled={closeBlocked} aria-label="Close settings">Close</button>
    </header>
    <section>
      <h3>Audio cache</h3>
      <p role="status">Size: {cacheBytes === undefined ? 'Unavailable' : cacheBytes >= 1e9 ? `${(cacheBytes / 1e9).toFixed(2)} GB` : `${(cacheBytes / 1e6).toFixed(1)} MB`}</p>
      <p className={styles.note}>Reuses converted audio across retries and model changes.</p>
      <label className={styles.modelRow}>
        <input type="checkbox" checked={clearOnExit} disabled={!cachePreferenceReady || working}
          onChange={(event) => void changeCachePreference(event.target.checked)} />
        <span>Clear audio cache on exit</span>
      </label>
      <p className={styles.note}>Enabled by default. Turn off to keep cached audio between sessions. Original files and transcripts are preserved.</p>
      <div className={styles.modelActions}>
      <button type="button" onClick={() => void openAudioCacheFolder()} disabled={working || !window.easyWhisper}>Open audio folder</button>
      <button type="button" onClick={() => void clearCache()} disabled={busy || working || !window.easyWhisper}>
        {clearingCache ? "Clearing…" : "Clear audio cache"}
      </button>
      </div>
      {busy && <p role="status">Available when setup and transcription finish.</p>}
      {cacheResult && <p role="status">{cacheResult}</p>}
      {clearingCache && <LoadingBar label="Clearing audio cache" paceSeconds={5} />}
    </section>
    <section className={styles.uninstallSection}>
      <h3>Models</h3>
      <label className={styles.modelRow}><input type="checkbox" checked={cleanupEnabled} disabled={busy || working}
        onChange={event => onCleanupEnabled(event.target.checked)}/><span>Clean up after transcription</span></label>
      <CleanupSettings preferences={cleanupPreferences} onPreferences={onCleanupPreferences} busy={busy || working} compact />
    </section>
    <section className={styles.uninstallSection}>
      <h3>Logs</h3>
      <p className={styles.note}>View dependency setup and compilation details.</p>
      <button type="button" onClick={() => void showLog()} disabled={!window.easyWhisper}>Show log file</button>
      {logResult && <p role="status">{logResult}</p>}
    </section>
    {!isMac && <>
    <section className={styles.uninstallSection}>
      <h3>Whisper installation</h3>
      <p className={styles.note}>Fix setup issues by reinstalling Whisper. Keeps your models and settings.</p>
      <button type="button" className={styles.reinstall} onClick={() => void reinstall()}
        disabled={busy || working || !window.easyWhisper}>
        {reinstalling ? "Reinstalling…" : "Clean reinstall"}
      </button>
      {busy && !reinstalling && progress.state !== "running" && <p role="status">Finish setup or stop transcription before reinstalling.</p>}
      {!downloadProgress && (reinstalling || progress.state === "running") && <div role="status" aria-live="polite">
        <LoadingBar label="Whisper reinstall" {...setupProgress(progress)} paused={progress.state === "error"} />
        <p>{progress.state === "running" ? progress.message : "Preparing reinstall…"}</p>
        <p className={styles.note}>Keep the app open until setup finishes.</p>
      </div>}
      {result && <p role={result.success ? "status" : "alert"} className={styles.result}>
        {result.message}{!result.success && " See the output log for details."}
      </p>}
    </section>
    <section className={styles.uninstallSection}>
      <h3>Uninstall</h3>
      <p className={styles.note}>Removes the app, downloaded models and settings. Keeps original media and exported transcripts outside the app’s data folder.</p>
      <button type="button" className={styles.uninstall} onClick={() => void uninstall()}
        disabled={busy || working || !uninstallInfo?.available} aria-describedby="uninstall-availability">
        {uninstalling ? "Opening uninstaller…" : "Uninstall"}
      </button>
      <p id="uninstall-availability" className={styles.note}>
        {!uninstallInfo ? "Checking availability…" : uninstallInfo.reason ?? (busy ? "Finish setup or stop transcription first." : "")}
      </p>
      {uninstallError && <p role="alert" className={styles.result}>{uninstallError}</p>}
      {uninstalling && <LoadingBar label="Opening uninstaller" paceSeconds={5} />}
    </section>
    </>}
  </dialog>;
}
