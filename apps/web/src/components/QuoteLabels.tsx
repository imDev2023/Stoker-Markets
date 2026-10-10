import type { QuoteAsset } from "@launchpad/contract";
import { quoteTicker } from "@/lib/format";
import styles from "./QuoteLabels.module.css";

/**
 * A Quote Asset's Quote Risk Labels in full, each with what it means and where it was read from; or that there is nothing
 * to flag, or no check yet. Labels inform and never block, and they are never shown beside an asset's name (owner,
 * 2026-10-10): only here, in the further information of the launch form, a coin's page and the asset's own page.
 */
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
