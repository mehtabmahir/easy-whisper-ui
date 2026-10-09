import React, { useEffect, useRef } from "react";
import styles from "./styles/FirstLaunchLoader.module.css";
import LoadingBar from "./LoadingBar";

interface FirstLaunchLoaderProps {
  progress: number;
  estimateLimit: number;
  paceSeconds: number;
  message: string;
  canContinue: boolean;
  failed: boolean;
  onContinue: () => void;
  onReinstall?: () => void;
  reinstalling?: boolean;
}

const FirstLaunchLoader: React.FC<FirstLaunchLoaderProps> = ({ progress, estimateLimit, paceSeconds, message, canContinue, failed, onContinue, onReinstall, reinstalling }) => {
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = dialogRef.current!;
    dialog.showModal();
    return () => dialog.close();
  }, []);

  return (
      <dialog ref={dialogRef} className={styles.loaderCard} aria-labelledby="setup-title"
        onCancel={event => event.preventDefault()}>
        <div className={styles.logoArea}>
          <img src="./icon.png" alt="App Logo" className={styles.logo} />
          <h2 id="setup-title">{failed ? "Whisper setup failed" : "Welcome to EasyWhisperUI"}</h2>
        </div>
        <div className={styles.progressBlock}>
          <span className={styles.progressMessage}>{message}</span>
          <LoadingBar label="Initial setup" progress={progress} estimateLimit={estimateLimit} paceSeconds={paceSeconds} complete={progress === 100 && !failed} paused={failed} />
        </div>
        <div className={styles.actions}>
        {failed && onReinstall && <button type="button" className={styles.continueButton}
          onClick={onReinstall} disabled={reinstalling}>{reinstalling ? "Starting…" : "Reinstall"}</button>}
        <button
          className={styles.continueButton}
          onClick={onContinue}
          disabled={!canContinue}
        >
          Continue to App
        </button>
        </div>
      </dialog>
  );
};

export default FirstLaunchLoader;
