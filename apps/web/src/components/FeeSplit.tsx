import styles from "./FeeSplit.module.css";

const PARTS = [
  { label: "Creator", pct: 0.5, tone: "creator", note: "Paid by the chain" },
  { label: "Platform", pct: 0.5, tone: "platform", note: null },
  { label: "Raydium", pct: 0.25, tone: "raydium", note: null },
] as const;

/** The 1.25% every curve trade pays, and where each part goes (ADR 0001). */
export function FeeSplit() {
  const total = PARTS.reduce((s, p) => s + p.pct, 0);
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
