import Link from "next/link";
import type { LaunchSummary, PlatformInfo, QuoteAsset } from "@launchpad/contract";
import { formatMarketValue } from "@/lib/board";
import { creatorEarnings } from "@/lib/fees";
import { COIN_SUPPLY, formatPrice, formatUtc, quoteTicker, shortAddress } from "@/lib/format";
import { quoteKind } from "@/lib/landing";
import { QuoteLogo } from "./QuoteLogo";
import styles from "./PairCards.module.css";

/*
 * The layout candidates' pair pieces (docs/design/layout.md, the coin page): the lockup of both marks, the pair's
 * stats strip, the Quote Asset's card and, for C2, the coin's own card beside it.
 */

const usd = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: n < 1 ? 6 : 2 });
const compactUsd = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD", notation: "compact", maximumSignificantDigits: 3 });

/** How far the curve is toward its Graduation Target, as a whole percentage; a sold-out curve is done. */
function progressOf(launch: LaunchSummary) {
  if (launch.curve.status !== "live") return 100;
  const target = BigInt(launch.graduationTarget);
  return target === 0n ? 0 : Math.min(100, Number((BigInt(launch.curve.raised) * 1000n) / target) / 10);
}

/** The coin's image with the Quote Asset's logo over its corner: the pair drawn, not only written. */
export function PairLockup({ launch, size = 96 }: { launch: LaunchSummary; size?: number }) {
  return (
    <span className={styles.lockup} style={{ width: size, height: size }}>
      {launch.image ? <img className={styles.image} src={launch.image} alt="" width={size} height={size} /> : <span className={styles.image} aria-hidden />}
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
          <span className={styles.figure}>{price === null ? "-" : formatPrice(price)} <small>{quote}</small></span>
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
          <dd>{quoteAsset?.graduationTarget ? `${formatPrice(Number(quoteAsset.graduationTarget.raw) / 10 ** q.decimals)} ${ticker}` : "-"}</dd>
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

/** C2's other half: the coin's own card, the same shape as the Quote Asset's. */
export function CoinCard({ launch, platform, holders }: { launch: LaunchSummary; platform: PlatformInfo; holders: number | null }) {
  const earns = creatorEarnings(platform);
  return (
    <section className={`card ${styles.quoteCard}`} aria-labelledby="coin-card-title">
      <p className="eyebrow">The coin</p>
      <div className={styles.quoteHead}>
        {launch.image ? <img className={styles.coinImage} src={launch.image} alt="" width={40} height={40} /> : <span className={styles.coinImage} aria-hidden />}
        <div>
          <h2 id="coin-card-title" className={`t-h3 ${styles.quoteTitle}`}>{launch.symbol}</h2>
          <p className={styles.quoteKind}>{launch.name}</p>
        </div>
      </div>
      <dl className={styles.quoteFacts}>
        <div>
          <dt>Supply</dt>
          <dd>{COIN_SUPPLY.toLocaleString("en-US")}, fixed</dd>
        </div>
        <div>
          <dt>Holders</dt>
          <dd>{holders ?? "-"}</dd>
        </div>
        <div>
          <dt>Launched</dt>
          <dd><time dateTime={launch.createdAt}>{formatUtc(launch.createdAt)}</time></dd>
        </div>
        <div>
          <dt>Creator</dt>
          <dd className="mono">{shortAddress(launch.creator)}</dd>
        </div>
      </dl>
      <p className={styles.quoteNote}>The Creator earns {earns.summary}, half of what the platform collects, with nothing to claim.</p>
    </section>
  );
}
