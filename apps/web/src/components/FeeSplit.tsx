import styles from "./FeeSplit.module.css";

/** Raydium's protocol fee on every LaunchLab curve trade, the same on every GlobalConfig. */
const RAYDIUM_PCT = 0.25;

type Part = { label: string; pct: number; tone: "platform" | "creator" | "raydium"; aside: string | null };

/**
 * What every curve trade pays, and where each part goes (ADR 0009): the Platform Fee and Creator Fee as the chain has
 * them now, and how much of its fee the platform sends on to the Creator.
 */
export function FeeSplit({ platformFeeBps, creatorFeeBps, forwardBps }: { platformFeeBps: number; creatorFeeBps: number; forwardBps: number }) {
  const parts: Part[] = [
    { label: "Platform", pct: platformFeeBps / 100, tone: "platform", aside: forwardBps > 0 ? `${forwardBps / 100}% goes on to the creator` : null },
    // Our platform pays no Creator Fee on-chain; the row only appears if the admin ever sets one.
    ...(creatorFeeBps > 0 ? [{ label: "Creator", pct: creatorFeeBps / 100, tone: "creator", aside: null } satisfies Part] : []),
    { label: "Raydium", pct: RAYDIUM_PCT, tone: "raydium", aside: null },
  ];
  const total = Math.round(parts.reduce((s, p) => s + p.pct, 0) * 100) / 100;
  return (
    <figure className={styles.split}>
      <figcaption className={styles.caption}>Every trade pays {total}%</figcaption>
      <div className={styles.bar} aria-hidden>
        {parts.map((p) => (
          <span key={p.label} className={styles[p.tone]} style={{ flexGrow: p.pct }} />
        ))}
      </div>
      <ul className={styles.legend}>
        {parts.map((p) => (
          <li key={p.label}>
            <span className={`${styles.dot} ${styles[p.tone]}`} aria-hidden />
            <span className={styles.part}>{p.label}</span>
            <span className={styles.pct}>{p.pct.toFixed(2)}%</span>
            {p.aside && <span className={styles.aside}>{p.aside}</span>}
          </li>
        ))}
      </ul>
    </figure>
  );
}
