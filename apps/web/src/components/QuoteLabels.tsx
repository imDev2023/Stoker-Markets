import type { QuoteAsset, QuoteLabel } from "@launchpad/contract";
import { quoteTicker } from "@/lib/format";
import styles from "./QuoteLabels.module.css";

/** Chips fit a row in the picker; past this many, the rest are counted, and every title is in the tooltip. */
const CHIPS_MAX = 3;

/**
 * A Quote Asset's Quote Risk Labels as chips: a fact each, coloured by how much it matters, never a verdict. Labels
 * inform and never block, so a labelled asset is picked like any other.
 */
export function QuoteLabelChips({ labels, max = CHIPS_MAX }: { labels: QuoteLabel[] | null; max?: number }) {
  if (!labels?.length) return null;
  const shown = labels.slice(0, max);
  const more = labels.length - shown.length;
  return (
    <span className={styles.chips} aria-label="Quote Risk Labels" title={labels.map((l) => l.title).join(" · ")}>
      {shown.map((l) => (
        <span key={l.kind} className={`${styles.chip} ${styles[l.severity]}`}>{l.title}</span>
      ))}
      {more > 0 && <span className={`${styles.chip} ${styles.more}`}>+{more}</span>}
    </span>
  );
}

/** The labels in full, each with what it means and where it was read from; or that there is nothing to flag, or no check yet. */
export function QuoteLabelList({ quote }: { quote: Pick<QuoteAsset, "mint" | "symbol" | "labels"> }) {
  const ticker = quoteTicker(quote);
  if (quote.labels === null) return <p className={styles.empty}>{ticker} has not been checked yet; its labels appear with the next Quote Registry refresh.</p>;
  if (quote.labels.length === 0)
    return <p className={styles.empty}>Nothing to flag on {ticker}: no issuer authority over wallets, no transfer fee, and on the verified list.</p>;
  return (
    <ul className={styles.list} aria-label={`${ticker} risk labels`}>
      {quote.labels.map((l) => (
        <li key={l.kind} className={styles.item}>
          <span className={`${styles.chip} ${styles[l.severity]}`}>{l.title}</span>
          <span className={styles.detail}>{l.detail}</span>
          <span className={styles.source}>Source: {l.source}</span>
        </li>
      ))}
    </ul>
  );
}
