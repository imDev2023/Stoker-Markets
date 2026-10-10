import styles from "./Stats.module.css";

export type Figure = { value: string; label: string; heat?: boolean };

/**
 * The landing's figures as a bento of raised cards: what the platform has done so far, each one read from the API at
 * render, the value in figure-xl mono over its label, and the money moving to Creators in the heat.
 */
export function Stats({ figures }: { figures: Figure[] }) {
  return (
    <section className={`shell ${styles.stats}`} aria-label="Figures">
      <dl className={styles.list}>
        {figures.map((f) => (
          <div key={f.label} className={`card card-raised ${styles.stat}`}>
            <dt className={styles.label}>{f.label}</dt>
            <dd className={`t-figure-xl ${styles.value} ${f.heat ? "heat-text" : ""}`}>{f.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
