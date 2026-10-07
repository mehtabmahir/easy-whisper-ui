import { useEffect, useRef, useState } from "react";
import type { CompileProgressEvent, UninstallInfo } from "../types/easy-whisper";
import styles from "./styles/SettingsPanel.module.css";

export default function SettingsPanel({ busy, progress, onClose }: {
  busy: boolean;
  progress: CompileProgressEvent;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [reinstalling, setReinstalling] = useState(false);
  const [uninstalling, setUninstalling] = useState(false);
  const [uninstallInfo, setUninstallInfo] = useState<UninstallInfo>();
  const [uninstallError, setUninstallError] = useState<string>();
  const working = reinstalling || uninstalling;
  const [result, setResult] = useState<{ success: boolean; message: string }>();

  useEffect(() => {
    const dialog = dialogRef.current!;
    dialog.showModal();
    return () => dialog.close();
  }, []);

  useEffect(() => {
    let active = true;
    window.easyWhisper?.getUninstallInfo().then((info) => {
      if (active) setUninstallInfo(info);
    }).catch(() => {
      if (active) setUninstallInfo({ available: false, reason: "Could not check uninstall availability. Close and reopen Settings to retry." });
    });
    return () => { active = false; };
  }, []);

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
    onCancel={(event) => { event.preventDefault(); if (!working) onClose(); }}>
    <header className={styles.header}>
      <h2 id="settings-title">Settings</h2>
      <button type="button" onClick={onClose} disabled={working} aria-label="Close settings">Close</button>
    </header>
    <section>
      <h3>Whisper installation</h3>
      <p>If setup failed or Whisper won’t start, reinstall its components from scratch.</p>
      <p>Replaces the app’s binaries, build files, local toolchain and download cache.
        Your models, preferences, original media and transcripts are kept.</p>
      <p className={styles.note}>Windows and Linux may need downloads and several minutes to build.
        On macOS, the bundled binaries are restored. Shared system dependencies are not removed.</p>
      <button type="button" className={styles.reinstall} onClick={() => void reinstall()}
        disabled={busy || working || !window.easyWhisper}>
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
    <section className={styles.uninstallSection}>
      <h3>Uninstall EasyWhisperUI</h3>
      <p>Remove the app and all its data, including downloaded models and saved settings.
        Original media and exported transcripts outside the app’s data folders are kept.</p>
      <p className={styles.note}>Shared dependencies such as Git and Vulkan SDK remain installed.</p>
      <button type="button" className={styles.uninstall} onClick={() => void uninstall()}
        disabled={busy || working || !uninstallInfo?.available} aria-describedby="uninstall-availability">
        {uninstalling ? "Opening uninstaller…" : "Uninstall fully"}
      </button>
      <p id="uninstall-availability" className={styles.note}>
        {!uninstallInfo ? "Checking availability…" : uninstallInfo.reason ?? (busy ? "Finish setup or stop transcription before uninstalling." : "The app will close and the Windows uninstaller will open.")}
      </p>
      {uninstallError && <p role="alert" className={styles.result}>{uninstallError}</p>}
    </section>
  </dialog>;
}
