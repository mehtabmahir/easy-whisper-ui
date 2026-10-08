import React from "react";
import styles from "./styles/FirstLaunchLoader.module.css";
import LoadingBar from "./LoadingBar";

interface FirstLaunchLoaderProps {
  progress: number;
  message: string;
  canContinue: boolean;
  failed: boolean;
  onContinue: () => void;
}

const FirstLaunchLoader: React.FC<FirstLaunchLoaderProps> = ({ progress, message, canContinue, failed, onContinue }) => {
  return (
    <div className={styles.loaderOverlay}>
      <div className={styles.loaderCard}>
        <div className={styles.logoArea}>
          <img src="./icon.png" alt="App Logo" className={styles.logo} />
          <h2>Welcome to EasyWhisperUI</h2>
        </div>
        <div className={styles.progressBlock}>
          <span className={styles.progressMessage}>{message}</span>
          <LoadingBar label="Initial setup" progress={progress} complete={progress === 100 && !failed} paused={failed} />
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
