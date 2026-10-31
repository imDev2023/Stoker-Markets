import Link from "next/link";
import type { LaunchSummary, QuoteAsset } from "@launchpad/contract";
import { quoteTicker } from "@/lib/format";
import { quoteKind } from "@/lib/landing";
import { CoinImage } from "./CoinImage";
import { Price } from "./Price";
import { QuoteLogo } from "./QuoteLogo";
import styles from "./PairCards.module.css";

/*
 * The coin page's pair pieces (docs/design/layout.md; reworked in phase 3, #134): the lockup of both marks in the title
 * row and the Quote Asset's card, the pair's other half under the trade panel. The pair's figures strip went with the
 * rework: the price stands in the title row, the market cap and the volume in the chart's head, the graduation as one
 * bar under the chart, each once.
 */

const usd = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: n < 1 ? 6 : 2 });
const compactUsd = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD", notation: "compact", maximumSignificantDigits: 3 });

/** The coin's image with the Quote Asset's logo over its corner: the pair drawn, not only written. */
export function PairLockup({ launch, size = 96 }: { launch: LaunchSummary; size?: number }) {
  return (
    <span className={styles.lockup} style={{ width: size, height: size }}>
      <CoinImage src={launch.image} symbol={launch.symbol} size={size} className={styles.image} />
      <span className={styles.quoteLogo}><QuoteLogo quote={launch.quote} size={Math.round(size * 0.4)} /></span>
    </span>
  );
}

/** The Quote Asset's own card: what the other half of the pair is, what it is worth and whether anything is flagged about it. */
export function QuoteCard({ launch, quoteAsset }: { launch: LaunchSummary; quoteAsset: QuoteAsset | null }) {
  const q = quoteAsset ?? launch.quote;
  const ticker = quoteTicker(q);
  const priceUsd = quoteAsset?.price?.usd ? Number(quoteAsset.price.usd) : null;
  const cautions = quoteAsset?.labels?.length ?? 0;
  // "SOL · Solana" once: the name only where it says more than the ticker, the kind after it.
  const kind = [...new Set([q.name && q.name.toLowerCase() !== ticker.toLowerCase() ? q.name : null, quoteKind(q)].filter((w): w is string => Boolean(w)))].join(" · ");
  return (
    <section className={`card ${styles.quoteCard}`} aria-labelledby="quote-card-title">
      <p className="eyebrow">Paired with</p>
      <div className={styles.quoteHead}>
        <QuoteLogo quote={q} size={36} />
        <div className={styles.quoteWords}>
          <h2 id="quote-card-title" className={`t-h3 ${styles.quoteTitle}`}>{ticker}</h2>
          <p className={styles.quoteKind}>{kind}</p>
        </div>
        {quoteAsset?.labels === null || quoteAsset === null ? (
          <span className="tag">Labels not checked yet</span>
        ) : cautions === 0 ? (
          <span className="tag tag-up">No risk labels</span>
        ) : (
          <span className="tag tag-caution">{cautions} {cautions === 1 ? "label" : "labels"} to read</span>
        )}
      </div>
      <dl className={styles.quoteFacts}>
        <div>
          <dt>1 {ticker}</dt>
          <dd>{priceUsd !== null ? usd(priceUsd) : "no reliable price"}</dd>
        </div>
        <div>
          <dt>Liquidity</dt>
          <dd>{quoteAsset?.liquidityUsd != null ? compactUsd(quoteAsset.liquidityUsd) : "-"}</dd>
        </div>
        <div>
          <dt>Graduates at</dt>
          <dd>{quoteAsset?.graduationTarget ? <><Price value={Number(quoteAsset.graduationTarget.raw) / 10 ** q.decimals} /> {ticker}</> : "-"}</dd>
        </div>
      </dl>
      <Link href={`/assets/${q.mint}`} className={styles.link}>Everything about {ticker}</Link>
    </section>
  );
}
