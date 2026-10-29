import styles from "./Stats.module.css";

/** A figure for the row; null while there is nothing behind it, and the row leaves it out rather than headline a zero. */
export type Figure = { value: string | null; label: string; heat?: boolean };

/**
 * The landing's figures as a bento of raised cards: what the platform has done so far, each one read from the API at
 * render, the value in figure-xl mono over its label, and the money moving to Creators in the heat. A figure still
 * at zero is left out (#131): the row shows what has happened, never what has not.
 */
export function Stats({ figures }: { figures: Figure[] }) {
  const shown = figures.filter((f): f is Figure & { value: string } => f.value !== null);
  if (shown.length === 0) return null;
  return (
    <section className={`shell ${styles.stats}`} aria-label="Figures">
      <dl className={styles.list}>
        {shown.map((f) => (
          <div key={f.label} className={`card card-raised ${styles.stat}`}>
            <dt className={styles.label}>{f.label}</dt>
            <dd className={`t-figure-xl ${styles.value} ${f.heat ? "heat-text" : ""}`}>{f.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
