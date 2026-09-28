import styles from "./FeeSplit.module.css";

/** Raydium's protocol fee on every LaunchLab curve trade, the same on every GlobalConfig. */
const RAYDIUM_PCT = 0.25;

/** What every curve trade pays, and where each part goes (ADR 0001): the Creator Fee and Platform Fee as the chain has them now. */
export function FeeSplit({ platformFeeBps, creatorFeeBps }: { platformFeeBps: number; creatorFeeBps: number }) {
  const PARTS = [
    { label: "Creator", pct: creatorFeeBps / 100, tone: "creator", note: "Paid by the chain" },
    { label: "Platform", pct: platformFeeBps / 100, tone: "platform", note: null },
    { label: "Raydium", pct: RAYDIUM_PCT, tone: "raydium", note: null },
  ] as const;
  const total = Math.round(PARTS.reduce((s, p) => s + p.pct, 0) * 100) / 100;
  return (
    <figure className={styles.split}>
      <figcaption className={styles.caption}>Every trade pays {total}%</figcaption>
      <div className={styles.bar} aria-hidden>
        {PARTS.map((p) => (
          <span key={p.label} className={styles[p.tone]} style={{ flexGrow: p.pct }} />
        ))}
      </div>
      <ul className={styles.legend}>
        {PARTS.map((p) => (
          <li key={p.label}>
            <span className={`${styles.dot} ${styles[p.tone]}`} aria-hidden />
            <span className={styles.part}>{p.label}</span>
            <span className={styles.pct}>{p.pct.toFixed(2)}%</span>
            {p.note && <span className={styles.note}>{p.note}</span>}
          </li>
        ))}
      </ul>
    </figure>
  );
}
