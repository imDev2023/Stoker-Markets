import { formatUtcDay } from "@/lib/format";
import styles from "./Stats.module.css";

/** A figure for the strip; null while there is nothing behind it, and the strip leaves it out rather than headline a zero. */
export type Figure = { value: string | null; unit?: string; label: string; heat?: boolean };

/**
 * The landing's figures as one row on the canvas (#133): each value in figure-xl mono with its unit beside it and its
 * label under, hairlines between, the money moving to Creators in the heat. Only figures with something behind them
 * (#131), so a new platform shows its assets alone and the row grows as the platform does; the line under it dates the
 * figures from the first launch.
 */
export function Stats({ figures, since }: { figures: Figure[]; since: string | null }) {
  const shown = figures.filter((f): f is Figure & { value: string } => f.value !== null);
  if (shown.length === 0) return null;
  return (
    <section className={`shell ${styles.stats}`} aria-label="Figures">
      <dl className={styles.row}>
        {shown.map((f) => (
          <div key={f.label} className={styles.stat}>
            <dt className={styles.label}>{f.label}</dt>
            <dd className={styles.value}>
              <span className={`t-figure-xl ${f.heat ? "heat-text" : ""}`}>{f.value}</span>
              {f.unit && <span className={styles.unit}>{f.unit}</span>}
            </dd>
          </div>
        ))}
      </dl>
      <p className={`t-caption ${styles.since}`}>
        Live from the chain{since && <>, since <time dateTime={since}>{formatUtcDay(since.slice(0, 10))}</time></>}.
      </p>
    </section>
  );
}
