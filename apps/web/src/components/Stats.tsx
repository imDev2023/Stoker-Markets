import styles from "./Stats.module.css";

export type Figure = { value: string; label: string; heat?: boolean };

/** The landing's figures in a row: what the platform has done so far, each one read from the API at render. */
export function Stats({ figures }: { figures: Figure[] }) {
  return (
    <section className={`shell ${styles.stats}`} aria-label="Figures">
      <dl className={styles.list}>
        {figures.map((f) => (
          <div key={f.label} className={styles.stat}>
            <dt className={styles.label}>{f.label}</dt>
            <dd className={`${styles.value} ${f.heat ? styles.heat : ""}`}>{f.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
