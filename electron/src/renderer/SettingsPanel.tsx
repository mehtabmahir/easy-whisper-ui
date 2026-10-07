import { useEffect, useRef, useState } from "react";
import type { CompileProgressEvent } from "../types/easy-whisper";
import styles from "./styles/SettingsPanel.module.css";

export default function SettingsPanel({ busy, progress, onClose }: {
  busy: boolean;
  progress: CompileProgressEvent;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [reinstalling, setReinstalling] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string }>();

  useEffect(() => {
    const dialog = dialogRef.current!;
    dialog.showModal();
    return () => dialog.close();
  }, []);

  async function reinstall() {
    if (busy || reinstalling || !window.easyWhisper) return;
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
    onCancel={(event) => { event.preventDefault(); if (!reinstalling) onClose(); }}>
    <header className={styles.header}>
      <h2 id="settings-title">Settings</h2>
      <button type="button" onClick={onClose} disabled={reinstalling} aria-label="Close settings">Close</button>
    </header>
    <section>
      <h3>Whisper installation</h3>
      <p>If setup failed or Whisper won’t start, reinstall its components from scratch.</p>
      <p>Replaces the app’s binaries, build files, local toolchain and download cache.
        Your models, preferences, original media and transcripts are kept.</p>
      <p className={styles.note}>Windows and Linux may need downloads and several minutes to build.
        On macOS, the bundled binaries are restored. Shared system dependencies are not removed.</p>
      <button type="button" className={styles.reinstall} onClick={() => void reinstall()}
        disabled={busy || reinstalling || !window.easyWhisper}>
        {reinstalling ? "Reinstalling…" : "Clean reinstall"}
      </button>
      {busy && !reinstalling && <p role="status">Finish setup or stop transcription before reinstalling.</p>}
      {reinstalling && <div role="status" aria-live="polite">
        <progress aria-label="Reinstall in progress" />
        <p>{progress.state === "running" ? progress.message : "Preparing reinstall…"}</p>
        <p className={styles.note}>Keep the app open until setup finishes.</p>
      </div>}
      {result && <p role={result.success ? "status" : "alert"} className={styles.result}>
        {result.message}{!result.success && " Check the main output log for details, then retry."}
      </p>}
    </section>
  </dialog>;
}
