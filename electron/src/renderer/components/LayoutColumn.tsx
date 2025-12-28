import { PropsWithChildren } from "react";
import classNames from "../utils/classNames";
import styles from "../styles/LayoutColumn.module.css";

type LayoutColumnProps = PropsWithChildren<{
  title: string;
  accent: "blue" | "green" | "orange" | "purple";
}>;

function LayoutColumn({ children, title, accent }: LayoutColumnProps): JSX.Element {
  return (
    <section className={styles.column}>
      <header className={classNames(styles.columnHeader, styles[accent])}>
        <h2>{title}</h2>
      </header>
      <div className={styles.columnBody}>{children}</div>
    </section>
  );
}

export default LayoutColumn;
