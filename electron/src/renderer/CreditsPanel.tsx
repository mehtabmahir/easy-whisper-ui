import { useEffect, useRef } from "react";
import readme from "../../../README.md?raw";
import styles from "./styles/SettingsPanel.module.css";

const appLicense = readme.split("```text")[1].split("This application includes")[0].trim();
const components = [
  { name: "whisper.cpp", role: "Transcription engine · Georgi Gerganov and contributors", license: "MIT", url: "https://github.com/ggml-org/whisper.cpp/blob/master/LICENSE" },
  { name: "Whisper", role: "Speech recognition models · OpenAI", license: "MIT", url: "https://github.com/openai/whisper/blob/main/LICENSE" },
  { name: "FFmpeg", role: "Audio conversion", license: "GPL builds on Windows and macOS; varies on Linux", url: "https://ffmpeg.org/legal.html" },
  { name: "SDL2", role: "Live audio capture", license: "zlib", url: "https://www.libsdl.org/license.php" },
  { name: "Electron", role: "Desktop runtime · includes Chromium and Node.js", license: "MIT and third-party licenses", url: "https://www.electronjs.org/docs/latest/tutorial/licensing" },
  { name: "React / React DOM", role: "User interface · Meta and contributors", license: "MIT", url: "https://github.com/facebook/react/blob/main/LICENSE" },
  { name: "electron-builder", role: "Installer and packaging", license: "MIT", url: "https://github.com/electron-userland/electron-builder/blob/master/LICENSE" }
];

export default function CreditsPanel({ onClose }: { onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const trigger = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current!;
    dialog.showModal();
    return () => { dialog.close(); trigger?.focus(); };
  }, []);

  return <dialog ref={dialogRef} className={styles.panel} aria-labelledby="credits-title"
    onCancel={event => { event.preventDefault(); onClose(); }}>
    <header className={styles.header}>
      <h2 id="credits-title">Credits</h2>
      <button type="button" onClick={onClose} aria-label="Close Credits">Close</button>
    </header>
    <section>
      <h3>EasyWhisperUI</h3>
      <p>Copyright © 2026 <a href="https://mehtab.work" target="_blank" rel="noreferrer">Mehtab Mahir</a>.</p>
      <details>
        <summary>App license · Personal use only</summary>
        <p style={{ whiteSpace: "pre-wrap" }}>{appLicense}</p>
      </details>
    </section>
    <section className={styles.uninstallSection}>
      <h3>Components</h3>
      {components.map(component => <div key={component.name}>
        <p><strong>{component.name}</strong><br />
          <span className={styles.note}>{component.role}</span><br />
          <a href={component.url} target="_blank" rel="noreferrer">{component.license}</a>
        </p>
      </div>)}
      <p className={styles.note}>FFmpeg builds: <a href="https://github.com/BtbN/FFmpeg-Builds" target="_blank" rel="noreferrer">Windows</a> · <a href="https://ffmpeg.martin-riedl.de/" target="_blank" rel="noreferrer">macOS</a></p>
    </section>
  </dialog>;
}
