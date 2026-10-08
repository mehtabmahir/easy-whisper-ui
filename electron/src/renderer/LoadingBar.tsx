import { useEffect, useState } from "react";
import styles from "./styles/LoadingBar.module.css";

export default function LoadingBar({ label, progress = 0, complete = false, paused = false, paceSeconds = 45, estimateLimit = 95 }: {
  label: string;
  progress?: number;
  complete?: boolean;
  paused?: boolean;
  paceSeconds?: number;
  estimateLimit?: number;
}) {
  const [estimated, setEstimated] = useState(4);
  const baseline = Number.isFinite(progress) ? Math.max(0, Math.min(99, progress)) : 0;
  const ceiling = Math.max(baseline, Math.min(99, estimateLimit));

  useEffect(() => {
    setEstimated((current) => Math.min(ceiling, Math.max(current, baseline)));
    if (complete || paused) return;
    const timer = window.setInterval(() => {
      // Stay within this stage's budget; only confirmed completion reaches 100%.
      setEstimated((current) => {
        const start = Math.min(ceiling, Math.max(current, baseline));
        return start + (ceiling - start) * (1 - Math.exp(-0.5 / paceSeconds));
      });
    }, 500);
    return () => window.clearInterval(timer);
  }, [baseline, ceiling, complete, paused, paceSeconds]);

  const value = complete ? 100 : Math.min(ceiling, Math.max(estimated, baseline));
  return <div className={styles.loading}>
    <div className={styles.track} role="progressbar" aria-label={label}
      aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.floor(value)}
      aria-valuetext={complete ? "Complete" : paused ? "Paused" : `Estimated ${Math.floor(value)} percent`}>
      <div className={styles.fill} style={{ width: `${value}%` }} />
    </div>
    <span className={styles.caption}>{complete ? "Complete" : paused ? "Stopped" : `Estimated progress · ${Math.floor(value)}%`}</span>
  </div>;
}
