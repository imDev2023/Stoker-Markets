import Link from "next/link";
import type { QuoteAsset } from "@launchpad/contract";
import { quoteTicker } from "@/lib/format";
import { issuerCounts, proofQuotes, quoteKind } from "@/lib/landing";
import { QuoteLogo } from "./QuoteLogo";
import styles from "./Proof.module.css";

/**
 * The proof row under the hero (#133): the assets the lede names, one of each kind with its logo, and the stock issuers
 * whose stocks a coin can be priced in here, with how many each brings. Everything comes from this chain's Quote
 * Registry, so the first screen proves the lede with the assets it can keep, and a chain without stocks shows none.
 */
export function Proof({ quotes }: { quotes: QuoteAsset[] }) {
  const picks = proofQuotes(quotes);
  const issuers = issuerCounts(quotes);
  if (picks.length === 0) return null;
  return (
    <section className={`shell ${styles.proof}`} aria-label="Pairs from">
      <div className={styles.rows}>
        <div className={styles.row}>
          <p className={`eyebrow ${styles.lead}`}>Pairs from</p>
          <ul className={styles.assets} aria-label="Pairs from">
          {picks.map((q) => (
            <li key={q.mint} className={styles.asset}>
              <QuoteLogo quote={q} size={28} />
              <span className={styles.ticker}>{quoteTicker(q)}</span>
              <span className={styles.kind}>{quoteKind(q)}</span>
            </li>
            ))}
          </ul>
        </div>
        {issuers.length > 0 && (
          <div className={styles.row}>
            <p className={`t-caption ${styles.lead}`}>Stocks by</p>
            <ul className={styles.issuers} aria-label="Stocks by">
              {issuers.map((i) => (
                <li key={i.issuer}>
                  <Link href="/assets" className={styles.issuer}>
                    <span className={styles.issuerName}>{i.label}</span>
                    <span className={styles.issuerCount}>{i.stocks.toLocaleString("en-US")} stocks</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}
