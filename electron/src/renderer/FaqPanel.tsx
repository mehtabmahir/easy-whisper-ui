import { useEffect, useRef } from "react";
import styles from "./styles/SettingsPanel.module.css";

export default function FaqPanel({ onClose }: { onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const isMac = window.easyWhisper?.platform() === "darwin";
  useEffect(() => {
    const trigger = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current!;
    dialog.showModal();
    return () => { dialog.close(); trigger?.focus(); };
  }, []);

  return <dialog ref={dialogRef} className={styles.panel} aria-labelledby="faq-title"
    onCancel={(event) => { event.preventDefault(); onClose(); }}>
    <header className={styles.header}>
      <h2 id="faq-title">FAQ</h2>
      <button type="button" onClick={onClose} aria-label="Close FAQ">Close</button>
    </header>
    <section>
      <h3>How can I use my transcript?</h3>
      <p><strong>Create summaries with AI.</strong> Upload or paste the exported TXT file into your favorite LLM to create a detailed summary, study notes, action items, or a cleaned-up transcript.</p>
      <p className={styles.note}>Try: “Summarize this transcript in detail, keeping the main points, examples, and action items.”</p>
      <p><strong>Create video subtitles.</strong> Enable <strong>Output File with Timestamps (.srt)</strong> before opening your video. Import the exported SRT file into your video editor or load it as a subtitle track in your video player.</p>
    </section>
    <section className={styles.uninstallSection}>
      <h3>Where are my files saved?</h3>
      <p>TXT transcripts and SRT subtitles are saved beside the original audio or video. Enable <strong>Open Transcription</strong> to open the result automatically.</p>
    </section>
    <section className={styles.uninstallSection}>
      <h3>Why isn't it working?</h3>
      {isMac
        ? <p>Restart the app and try again. macOS includes its transcription tools and has no reinstall button.</p>
        : <p>Open <strong>Settings → Clean reinstall</strong> to repair the transcription tools, then try again. Your models and settings are kept.</p>}
      <p>Still not working? Open <strong>Settings → Show log file</strong>, then <a href="https://github.com/mehtabmahir/easy-whisper-ui/issues/new" target="_blank" rel="noreferrer">submit a GitHub issue</a> with the log, what went wrong, and your specs: OS version, CPU, GPU, RAM, app version, and selected model.</p>
      <p className={styles.note}>If no setup log exists, copy the error from the output console instead. Remove any private file paths or transcript text before sharing.</p>
    </section>
  </dialog>;
}
