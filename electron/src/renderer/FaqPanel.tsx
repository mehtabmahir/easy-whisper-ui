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
      <h3>How do I read my transcript?</h3>
      <p>Enable <strong>Open transcript reader</strong> to watch file transcriptions appear as Whisper processes them. You can also open the reader using its button on the main screen. The console shows raw output.</p>
      <p>Live microphone sessions always open the reader. Overlapping partial phrases are merged to reduce repetition.</p>
    </section>
    <section className={styles.uninstallSection}>
      <h3>How do cleanup and summaries work?</h3>
      <p><strong>AI Cleanup</strong> runs after file transcription. In the reader, <strong>Clean up</strong> runs the same formatting process on demand. Choose <strong>Summarize</strong> for key points or <strong>Custom request</strong> for your own instructions.</p>
      <p>Stop live recording before running AI actions. Results save as separate Markdown files; the original transcript is preserved. Review important details against the original.</p>
      <p className={styles.note}>AI Cleanup and Open transcript reader start enabled for new users. Your saved choices are remembered.</p>
    </section>
    <section className={styles.uninstallSection}>
      <h3>Which AI model should I choose?</h3>
      <p>Built-in models are <strong>3B, 7B and 14B</strong>. With no saved selection, the app chooses the largest estimated to fit your GPU memory. Integrated and unified-memory graphics use a portion of system memory instead. If memory is unknown or insufficient, 3B is the fallback.</p>
      <p>Quality labels compare the built-in models: <strong>Low, Medium, High (Recommended)</strong>. Memory fit and quality are estimates; larger models can be slower.</p>
      <p>Use <strong>Settings → Manage Models</strong> to select, download or delete Whisper and AI models. Custom AI models must be instruction-tuned GGUF files, not Whisper speech models.</p>
    </section>
    <section className={styles.uninstallSection}>
      <h3>Does my audio leave my computer?</h3>
      <p>Whisper transcription and local AI run on your device. Models download once, then work offline. Choosing an API provider sends transcript text—not audio—to that provider and may incur charges. API keys are kept only for the current session.</p>
    </section>
    <section className={styles.uninstallSection}>
      <h3>How do I create subtitles?</h3>
      <p>Enable <strong>Output File with Timestamps (.srt)</strong> before opening a video. Import the saved SRT into your video editor or player. AI cleanup creates a separate document and does not change subtitle timing.</p>
    </section>
    <section className={styles.uninstallSection}>
      <h3>Where are my files saved?</h3>
      <p>File transcripts, subtitles and AI Markdown results are saved beside the source media. Live transcripts are saved in the app’s <strong>whisper-workspace/live-transcripts</strong> folder, with merged and raw text copies. Use the reader’s saved-file control to locate a result.</p>
      <p><strong>Settings → Audio cache</strong> shows temporary audio storage and opens its folder. Clearing this cache does not delete original recordings or exported transcripts.</p>
    </section>
    <section className={styles.uninstallSection}>
      <h3>What should I put in Arguments?</h3>
      <p>Leave it empty for Whisper’s standard settings. Use <strong>Help</strong> to see available advanced arguments. The previous default preset is cleared once during migration; you can enter it again if you prefer, and it will stay saved.</p>
      <p>Use a multilingual Whisper model for non-English audio. English-only models ending in <strong>.en</strong> cannot transcribe other languages. Choose <strong>Auto-detect</strong> if you do not know the input language.</p>
    </section>
    <section className={styles.uninstallSection}>
      <h3>How do I retry or stop a file?</h3>
      <p>Open the queue dropdown to remove waiting files or retry failed ones. <strong>Skip</strong> moves to the next file; <strong>Stop</strong> stops processing and clears the waiting queue. An AI cleanup error does not erase a successful Whisper transcript.</p>
    </section>
    <section className={styles.uninstallSection}>
      <h3>How do I update the app?</h3>
      <p>On Windows and macOS, use <strong>Update</strong> or <strong>Settings → Maintenance → Check for updates</strong>. The app also checks after launch. It downloads and verifies the matching installer, waits for active work, opens the installer, then quits.</p>
      <p>On Mac, drag the new app into Applications to finish installation. Linux updates are manual. Replaced downloads with the same version number do not trigger an update prompt.</p>
    </section>
    <section className={styles.uninstallSection}>
      <h3>Why isn't it working?</h3>
      {isMac
        ? <p>Restart the app and try again. macOS includes its transcription tools and has no reinstall button.</p>
        : <p>Open <strong>Settings → Clean reinstall</strong> to repair the transcription tools, then try again. Your models and settings are kept.</p>}
      <p>Still not working? Open <strong>Settings → Maintenance → View logs</strong>, then <a href="https://github.com/mehtabmahir/easy-whisper-ui/issues/new" target="_blank" rel="noreferrer">submit a GitHub issue</a> with the log, what went wrong, and your specs: OS version, CPU, GPU, RAM, app version, and selected model.</p>
      <p className={styles.note}>If no setup log exists, copy the error from the output console instead. Remove any private file paths or transcript text before sharing.</p>
    </section>
  </dialog>;
}
