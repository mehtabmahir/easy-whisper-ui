import { useEffect, useState } from "react";
import styles from "./styles/LoadingBar.module.css";

export default function LoadingBar({ label, progress = 0, complete = false, paused = false, paceSeconds = 45 }: {
  label: string;
  progress?: number;
  complete?: boolean;
  paused?: boolean;
  paceSeconds?: number;
}) {
  const [estimated, setEstimated] = useState(4);
  const baseline = Number.isFinite(progress) ? Math.max(0, Math.min(99, progress)) : 0;

  useEffect(() => {
    setEstimated((current) => Math.max(current, baseline));
    if (complete || paused) return;
    const timer = window.setInterval(() => {
      // Ease toward 95%; only a confirmed completion may show 100%.
      setEstimated((current) => {
        const start = Math.max(current, baseline);
        return Math.max(start, start + (95 - start) * (1 - Math.exp(-0.5 / paceSeconds)));
      });
    }, 500);
    return () => window.clearInterval(timer);
  }, [baseline, complete, paused, paceSeconds]);

  const value = complete ? 100 : Math.min(99, Math.max(estimated, baseline));
  return <div className={styles.loading}>
    <div className={styles.track} role="progressbar" aria-label={label}
      aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.floor(value)}
      aria-valuetext={complete ? "Complete" : paused ? "Paused" : `Estimated ${Math.floor(value)} percent`}>
      <div className={styles.fill} style={{ width: `${value}%` }} />
    </div>
    <span className={styles.caption}>{complete ? "Complete" : paused ? "Stopped" : `Estimated progress · ${Math.floor(value)}%`}</span>
  </div>;
}
