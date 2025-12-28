import styles from "../styles/PlaceholderPanel.module.css";

export type PlaceholderPanelProps = {
  title: string;
  body: string;
  compact?: boolean;
};

function PlaceholderPanel({ title, body, compact = false }: PlaceholderPanelProps): JSX.Element {
  return (
    <article className={compact ? styles.panelCompact : styles.panel}>
      <h3>{title}</h3>
      <p>{body}</p>
    </article>
  );
}

export default PlaceholderPanel;
