import Link from "next/link";
import type { LaunchSummary, QuoteAsset } from "@launchpad/contract";
import { formatMarketValue } from "@/lib/board";
import { quoteTicker } from "@/lib/format";
import { quoteKind } from "@/lib/landing";
import { CoinImage } from "./CoinImage";
import { Price } from "./Price";
import { QuoteLogo } from "./QuoteLogo";
import styles from "./PairCards.module.css";

/*
 * The coin page's pair pieces (docs/design/layout.md): the lockup of both marks, the pair's stats strip and the Quote
 * Asset's card, the pair's other half beside the trade panel.
 */

const usd = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: n < 1 ? 6 : 2 });
const compactUsd = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD", notation: "compact", maximumSignificantDigits: 3 });

/** How far the curve is toward its Graduation Target, to a hundredth of a percent as CurveProgress has it; a sold-out curve is done. */
function progressOf(launch: LaunchSummary) {
  if (launch.curve.status !== "live") return 100;
  const target = BigInt(launch.graduationTarget);
  return target === 0n ? 0 : Math.min(100, Number((BigInt(launch.curve.raised) * 10_000n) / target) / 100);
}

/** The coin's image with the Quote Asset's logo over its corner: the pair drawn, not only written. */
export function PairLockup({ launch, size = 96 }: { launch: LaunchSummary; size?: number }) {
  return (
    <span className={styles.lockup} style={{ width: size, height: size }}>
      <CoinImage src={launch.image} symbol={launch.symbol} size={size} className={styles.image} />
      <span className={styles.quoteLogo}><QuoteLogo quote={launch.quote} size={Math.round(size * 0.4)} /></span>
    </span>
  );
}

/** The pair's figures in one strip: the price in the Quote Asset and in USD, market cap, 24h volume, the curve. */
export function PairStats({ launch, quoteAsset }: { launch: LaunchSummary; quoteAsset: QuoteAsset | null }) {
  const quote = quoteTicker(launch.quote);
  const price = launch.market.price;
  const quoteUsd = quoteAsset?.price?.usd ? Number(quoteAsset.price.usd) : null;
  const pct = progressOf(launch);
  const { status } = launch.curve;
  return (
    <dl className={`card ${styles.stats}`}>
      <div>
        <dt>Price</dt>
        <dd>
          <span className={styles.figure}>{price === null ? "-" : <Price value={price} />} <small>{quote}</small></span>
          {price !== null && quoteUsd !== null && <span className={styles.sub}>{usd(price * quoteUsd)}</span>}
        </dd>
      </div>
      <div>
        <dt>Market cap</dt>
        <dd><span className={styles.figure}>{launch.market.marketCap ? formatMarketValue(launch.market.marketCap, launch.quote) : "-"}</span></dd>
      </div>
      <div>
        <dt>24h volume</dt>
        <dd><span className={styles.figure}>{formatMarketValue(launch.market.volume24h, launch.quote)}</span></dd>
      </div>
      <div className={styles.curve}>
        <dt>{status === "live" ? "Graduation" : status === "graduating" ? "Sold out" : "Graduated"}</dt>
        <dd>
          <span className={styles.figure}>{status === "live" ? `${pct.toFixed(pct > 0 && pct < 10 ? 1 : 0)}%` : status === "graduating" ? "graduating" : "trades on Raydium"}</span>
          {status === "live" && (
            <span className={styles.track} aria-hidden>
              <span className={styles.fill} style={{ width: `${Math.max(pct, 1)}%` }} />
            </span>
          )}
        </dd>
      </div>
    </dl>
  );
}

/** The Quote Asset's own card: what the other half of the pair is, what it is worth and what its issuer can do. */
export function QuoteCard({ launch, quoteAsset }: { launch: LaunchSummary; quoteAsset: QuoteAsset | null }) {
  const q = quoteAsset ?? launch.quote;
  const ticker = quoteTicker(q);
  const priceUsd = quoteAsset?.price?.usd ? Number(quoteAsset.price.usd) : null;
  const cautions = quoteAsset?.labels?.length ?? 0;
  return (
    <section className={`card ${styles.quoteCard}`} aria-labelledby="quote-card-title">
      <p className="eyebrow">Paired with</p>
      <div className={styles.quoteHead}>
        <QuoteLogo quote={q} size={40} />
        <div>
          <h2 id="quote-card-title" className={`t-h3 ${styles.quoteTitle}`}>{ticker}</h2>
          <p className={styles.quoteKind}>{q.name && q.name.toLowerCase() !== ticker.toLowerCase() ? `${q.name}, ` : ""}{quoteKind(q)}</p>
        </div>
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
        <div>
          <dt>Labels</dt>
          <dd>{quoteAsset?.labels === null || quoteAsset === null ? "not checked yet" : cautions === 0 ? "nothing to flag" : `${cautions} to read`}</dd>
        </div>
      </dl>
      <p className={styles.quoteNote}>Every trade of {launch.symbol} is paid in {ticker}, and so is the Creator&apos;s share.</p>
      <Link href={`/assets/${q.mint}`} className={styles.link}>Everything about {ticker}</Link>
    </section>
  );
}
