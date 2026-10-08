import type { ModelDownloadProgress } from "../types/easy-whisper";
import styles from "./styles/LoadingBar.module.css";

function bytes(value: number): string {
  return value >= 1024 ** 3 ? `${(value / 1024 ** 3).toFixed(2)} GB`
    : `${(value / 1024 ** 2).toFixed(1)} MB`;
}

export default function ModelDownloadBar({ progress }: { progress?: ModelDownloadProgress }) {
  const total = progress?.totalBytes;
  const received = progress?.receivedBytes ?? 0;
  const speed = progress?.bytesPerSecond ?? 0;
  const complete = progress?.state === "complete";
  const percent = complete ? 100 : total ? Math.min(99, Math.floor(received / total * 100)) : undefined;
  const seconds = total && speed > 0 ? Math.ceil(Math.max(0, total - received) / speed) : undefined;
  const remaining = seconds === undefined ? "" : seconds >= 60
    ? ` · ~${Math.ceil(seconds / 60)} min left` : ` · ~${seconds}s left`;
  return <div className={styles.loading}>
    <progress className={styles.measured} aria-label="Model download" value={percent} max={100} />
    <span className={styles.caption}>
      {complete ? "Download complete" : !progress || received === 0 ? "Connecting…" :
        `${percent === undefined ? "" : `${percent}% · `}${bytes(received)}${total ? ` / ${bytes(total)}` : ""} · ${bytes(speed)}/s${remaining}`}
    </span>
  </div>;
}
