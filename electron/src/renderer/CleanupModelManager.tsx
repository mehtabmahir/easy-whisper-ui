import { useEffect, useState } from 'react';
import type { DownloadedModel } from '../types/easy-whisper';
import { CLEANUP_MODELS } from '../main/services/cleanupModelCatalog';
import LoadingBar from './LoadingBar';
import styles from './styles/SettingsPanel.module.css';
export default function CleanupModelManager({ busy, onBusy, mode }: { mode: "download" | "delete"; busy: boolean; onBusy: (value: boolean) => void }) {
  const [models, setModels] = useState<DownloadedModel[]>();
  const modelsOpen = mode === "delete";
  const downloadsOpen = mode === "download";
  useEffect(() => { if (mode === "delete") void showModels(); }, [mode]);
  const [selectedModel, setSelectedModel] = useState("");
  const [modelBusy, setModelBusy] = useState(false);
  const [modelMessage, setModelMessage] = useState<string>();
  const [downloadSelection, setDownloadSelection] = useState("qwen-1.5b");
  const [downloading, setDownloading] = useState(false);
  const [downloadMessage, setDownloadMessage] = useState<string>();
  const working = modelBusy || downloading;
  useEffect(() => { onBusy(working); return () => onBusy(false); }, [working, onBusy]);
  const [downloadProgress, setDownloadProgress] = useState('');
  useEffect(() => window.easyWhisper?.onCleanupDownload(setDownloadProgress), []);

  async function downloadModel() {
    if (!window.easyWhisper || busy || working) return;
    setDownloading(true);
    setDownloadMessage(undefined);
    try {
      const response = await window.easyWhisper.downloadCleanupModel(downloadSelection);
      if (!response.success) {
        setDownloadMessage(response.error ?? "Download failed. Try again.");
        return;
      }
      setDownloadMessage(`${downloadSelection} is ready to use.`);
      if (modelsOpen) {
        try { setModels(await window.easyWhisper.listCleanupModels()); }
        catch { setModelMessage("Could not refresh models. Close this list and retry."); }
      }
    } catch { setDownloadMessage("Download failed. Check your connection and retry."); }
    finally { setDownloading(false); }
  }

  async function showModels() {
    if (!window.easyWhisper || working) return;
    setModels(undefined);
    setSelectedModel("");
    setModelMessage(undefined);
    setModelBusy(true);
    try { setModels(await window.easyWhisper.listCleanupModels()); }
    catch { setModelMessage("Could not load models. Close this list and retry."); }
    finally { setModelBusy(false); }
  }

  async function deleteModel() {
    if (!window.easyWhisper || !selectedModel || busy || working) return;
    setModelBusy(true);
    setModelMessage(undefined);
    try {
      const result = await window.easyWhisper.deleteCleanupModel(selectedModel);
      if (!result.success) { setModelMessage(result.error ?? "Could not delete model."); return; }
      setModels((items) => items?.filter((item) => item.file !== selectedModel));
      setSelectedModel("");
      setModelMessage("Model deleted.");
    } catch { setModelMessage("Could not delete model. Try again."); }
    finally { setModelBusy(false); }
  }

  return <>
      {downloadsOpen && <div>
        <p className={styles.note}>Download a model for offline use. Existing downloads are reused.</p>
        <div className={styles.modelActions}>
          <select aria-label="Model to download" value={downloadSelection} disabled={working}
            onChange={(event) => { setDownloadSelection(event.target.value); setDownloadMessage(undefined); }}>
            {CLEANUP_MODELS.map(model => <option key={model.id} value={model.id}>{model.label} · {(model.files.reduce((sum, f) => sum + f.bytes, 0) / 1e9).toFixed(2)} GB</option>)}
          </select>
          <button type="button" onClick={() => void downloadModel()} disabled={busy || working || !window.easyWhisper}>
            {downloading ? "Downloading…" : "Download selected"}
          </button>
        </div>
        {busy && <p role="status">Finish setup or stop transcription first.</p>}
        {downloadMessage && <p role="status">{downloadMessage}</p>}
      </div>}
      {downloading && <div role="status">
        <p>{downloadProgress || "Preparing download…"}</p>
        <LoadingBar label="Downloading model" paceSeconds={60} />
        <button type="button" onClick={() => void window.easyWhisper?.cancelCleanupDownload()}>Stop download</button>
      </div>}
      {modelsOpen && <div>
        <p className={styles.note}>Choose a downloaded model. It can be downloaded again when needed.</p>
        {models?.length === 0 && <p>No downloaded models.</p>}
        {modelBusy && !models && <p role="status">Loading models…</p>}
        {modelBusy && <LoadingBar label={models ? "Deleting model" : "Loading models"} paceSeconds={5} />}
        {!!models?.length && <>
          <div className={styles.modelList} role="group" aria-label="Downloaded models">
            {models.map((model) => <label key={model.file} className={styles.modelRow}>
              <input type="radio" name="downloaded-llm" value={model.file} checked={selectedModel === model.file}
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
</>;
}
