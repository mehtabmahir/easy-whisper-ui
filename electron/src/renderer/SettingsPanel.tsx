import { useEffect, useRef, useState } from "react";
import type { CompileProgressEvent, DownloadedModel, ModelDownloadProgress, UninstallInfo } from "../types/easy-whisper";
import styles from "./styles/SettingsPanel.module.css";
import { DOWNLOADABLE_MODELS } from "../main/services/modelCatalog";
import LoadingBar from "./LoadingBar";
import { setupProgress } from "./setupProgress";
import ModelDownloadBar from "./ModelDownloadBar";

export default function SettingsPanel({ busy, progress, onClose }: {
  busy: boolean;
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

  async function openWorkspaceFolder() {
    setCacheResult(undefined);
    try {
      const response = await window.easyWhisper?.openWorkspaceFolder();
      if (response && !response.success) setCacheResult(response.error ?? "Could not open the workspace folder.");
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
  const [models, setModels] = useState<DownloadedModel[]>();
  const [modelsOpen, setModelsOpen] = useState(false);
  const [selectedModel, setSelectedModel] = useState("");
  const [modelBusy, setModelBusy] = useState(false);
  const [modelMessage, setModelMessage] = useState<string>();
  const [downloadsOpen, setDownloadsOpen] = useState(false);
  const [downloadSelection, setDownloadSelection] = useState("base");
  const [downloading, setDownloading] = useState(false);
  const [downloadMessage, setDownloadMessage] = useState<string>();
  const [downloadProgress, setDownloadProgress] = useState<ModelDownloadProgress>();
  useEffect(() => window.easyWhisper?.onModelDownloadProgress((event) => {
    if (event.model === downloadSelection) setDownloadProgress(event);
  }), [downloadSelection]);
  const working = savingCachePreference || reinstalling || uninstalling || clearingCache || modelBusy || downloading;
  const closeBlocked = working && !reinstalling;

  async function downloadModel() {
    if (!window.easyWhisper || busy || working) return;
    setDownloading(true);
    setDownloadProgress(undefined);
    setDownloadMessage(undefined);
    try {
      const response = await window.easyWhisper.downloadModel(downloadSelection);
      if (!response.success) {
        setDownloadMessage(response.error ?? "Download failed. Try again.");
        return;
      }
      setDownloadMessage(`${downloadSelection} is ready to use.`);
      if (modelsOpen) {
        try { setModels(await window.easyWhisper.listDownloadedModels()); }
        catch { setModelMessage("Could not refresh models. Close this list and retry."); }
      }
    } catch { setDownloadMessage("Download failed. Check your connection and retry."); }
    finally { setDownloading(false); }
  }

  async function showModels() {
    if (!window.easyWhisper || working) return;
    setModelsOpen(true);
    setModels(undefined);
    setSelectedModel("");
    setModelMessage(undefined);
    setModelBusy(true);
    try { setModels(await window.easyWhisper.listDownloadedModels()); }
    catch { setModelMessage("Could not load models. Close this list and retry."); }
    finally { setModelBusy(false); }
  }

  async function deleteModel() {
    if (!window.easyWhisper || !selectedModel || busy || working) return;
    setModelBusy(true);
    setModelMessage(undefined);
    try {
      const result = await window.easyWhisper.deleteDownloadedModel(selectedModel);
      if (!result.success) { setModelMessage(result.error ?? "Could not delete model."); return; }
      setModels((items) => items?.filter((item) => item.file !== selectedModel));
      setSelectedModel("");
      setModelMessage("Model deleted.");
    } catch { setModelMessage("Could not delete model. Try again."); }
    finally { setModelBusy(false); }
  }

  async function clearCache() {
    if (busy || working || !window.easyWhisper) return;
    setClearingCache(true);
    setCacheResult(undefined);
    try {
      const result = await window.easyWhisper.clearAudioCache();
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
      <p className={styles.note}>Reuses converted audio across retries and model changes.</p>
      <label className={styles.modelRow}>
        <input type="checkbox" checked={clearOnExit} disabled={!cachePreferenceReady || working}
          onChange={(event) => void changeCachePreference(event.target.checked)} />
        <span>Clear audio cache on exit</span>
      </label>
      <p className={styles.note}>Enabled by default. Turn off to keep cached audio between sessions. Original files and transcripts are preserved.</p>
      <div className={styles.modelActions}>
      <button type="button" onClick={() => void openWorkspaceFolder()} disabled={working || !window.easyWhisper}>Open workspace folder</button>
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
      <div className={styles.modelActions}>
      <button type="button" onClick={() => setDownloadsOpen(!downloadsOpen)}
        disabled={working || !window.easyWhisper} aria-expanded={downloadsOpen}>
        {downloadsOpen ? "Close downloads" : "Download models"}
      </button>
      <button type="button" onClick={() => modelsOpen ? setModelsOpen(false) : void showModels()}
        disabled={working || !window.easyWhisper} aria-expanded={modelsOpen}>
        {modelsOpen ? "Close model list" : "Delete models"}
      </button>
      </div>
      {downloadsOpen && <div>
        <p className={styles.note}>Download a model for offline use. Existing downloads are reused.</p>
        <div className={styles.modelActions}>
          <select aria-label="Model to download" value={downloadSelection} disabled={working}
            onChange={(event) => { setDownloadSelection(event.target.value); setDownloadMessage(undefined); setDownloadProgress(undefined); }}>
            {DOWNLOADABLE_MODELS.map((model) => <option key={model} value={model}>{model}</option>)}
          </select>
          <button type="button" onClick={() => void downloadModel()} disabled={busy || working || !window.easyWhisper}>
            {downloading ? "Downloading…" : "Download selected"}
          </button>
        </div>
        {(downloading || downloadProgress?.state === "complete") && <ModelDownloadBar progress={downloadProgress} />}
        {busy && <p role="status">Finish setup or stop transcription first.</p>}
        {downloadMessage && <p role="status">{downloadMessage}</p>}
      </div>}
      {modelsOpen && <div>
        <p className={styles.note}>Choose a downloaded model. It can be downloaded again when needed.</p>
        {models?.length === 0 && <p>No downloaded models.</p>}
        {modelBusy && !models && <p role="status">Loading models…</p>}
        {modelBusy && <LoadingBar label={models ? "Deleting model" : "Loading models"} paceSeconds={5} />}
        {!!models?.length && <>
          <div className={styles.modelList} role="group" aria-label="Downloaded models">
            {models.map((model) => <label key={model.file} className={styles.modelRow}>
              <input type="radio" name="downloaded-model" value={model.file} checked={selectedModel === model.file}
                disabled={busy || working} onChange={() => setSelectedModel(model.file)} />
              <span>{model.name}</span>
              <small>{model.bytes >= 1024 ** 3 ? `${(model.bytes / 1024 ** 3).toFixed(1)} GB` : `${Math.ceil(model.bytes / 1024 ** 2)} MB`}</small>
            </label>)}
          </div>
          <button type="button" className={styles.uninstall} disabled={!selectedModel || busy || working}
            onClick={() => void deleteModel()}>{modelBusy ? "Deleting…" : "Delete selected"}</button>
        </>}
        {busy && <p role="status">Finish setup or stop transcription first.</p>}
        {modelMessage && <p role="status">{modelMessage}</p>}
      </div>}
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
      {(reinstalling || progress.state === "running") && <div role="status" aria-live="polite">
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
