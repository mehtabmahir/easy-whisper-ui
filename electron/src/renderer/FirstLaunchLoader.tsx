import React from "react";
import styles from "./styles/FirstLaunchLoader.module.css";

interface FirstLaunchLoaderProps {
  progress: number;
  message: string;
  canContinue: boolean;
  onContinue: () => void;
}

const FirstLaunchLoader: React.FC<FirstLaunchLoaderProps> = ({ progress, message, canContinue, onContinue }) => {
  return (
    <div className={styles.loaderOverlay}>
      <div className={styles.loaderCard}>
        <div className={styles.logoArea}>
          <img src="./icon.png" alt="App Logo" className={styles.logo} />
          <h2>Welcome to EasyWhisperUI</h2>
        </div>
        <div className={styles.progressBlock}>
          <span className={styles.progressMessage}>{message}</span>
          <div className={styles.progressBarTrack}>
            <div className={styles.progressBarFill} style={{ width: `${progress}%` }} />
          </div>
        </div>
        <button
          className={styles.continueButton}
          onClick={onContinue}
          disabled={!canContinue}
        >
          Continue to App
        </button>
      </div>
    </div>
  );
};

export default FirstLaunchLoader;
