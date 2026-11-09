import Link from "next/link";
import type { LaunchSummary } from "@launchpad/contract";
import type { CSSProperties } from "react";
import { formatDelta, formatMarketValue, kindOf, tintOf } from "@/lib/board";
import { quoteTicker } from "@/lib/format";
import { CoinActions, type ExplorerCluster } from "./CoinActions";
import { CoinImage } from "./CoinImage";
import { progressOf } from "./CoinRow";
import { PairMark } from "./PairMark";
import { Price } from "./Price";
import { QuoteLogo } from "./QuoteLogo";
import { RelativeTime } from "./RelativeTime";
import { Sparkline } from "./Sparkline";
import styles from "./BoardCard.module.css";

/** The day's change beside the price: its sign and an arrow, so the direction never rests on colour alone; nothing before a trade. */
function DayChange({ value }: { value: number | null }) {
  const text = formatDelta(value);
  if (text === null) return null;
  const tone = value! > 0 ? styles.up : value! < 0 ? styles.down : styles.flat;
  return (
    <span className={`${styles.change} ${tone}`} title="Price change over the last 24 hours">
      {value !== 0 && (
        <svg viewBox="0 0 8 8" width="7" height="7" aria-hidden="true">
          {value! > 0 ? <path d="M4 1 7.5 7H.5Z" fill="currentColor" /> : <path d="M4 7 .5 1h7Z" fill="currentColor" />}
        </svg>
      )}
      <span className="visually-hidden">24h change </span>
      {text}
    </span>
  );
}

/** Where the curve stands: its progress as the heat bar with the percentage, or the word for what has happened since. */
function CurveState({ launch }: { launch: LaunchSummary }) {
  const { status } = launch.curve;
  if (status === "graduating") return <span className={`${styles.curve} ${styles.graduating}`}>Sold out, graduating</span>;
  if (status === "graduated") return <span className={`${styles.curve} ${styles.graduated}`}>Graduated</span>;
  const pct = progressOf(launch);
  return (
    <span className={styles.curve} title="How far the curve is toward its Graduation Target">
      <span className="visually-hidden">Curve </span>
      <span className={styles.track} aria-hidden>
        {pct > 0 && <span className={styles.fill} style={{ width: `${pct}%` }} />}
      </span>
      <span className={styles.pct}>{pct.toFixed(pct > 0 && pct < 10 ? 1 : 0)}%</span>
    </span>
  );
}

/**
 * One coin as a card on the board (#161; the landing's Trending and the launch form's preview are `CoinCard`, a smaller card; the owner picked A on 2026-11-07 with the line made compact, the picture larger, and the
 * copy and explorer controls on every card, and M on 2026-11-08 for the paired asset: its logo as a ringed badge on the
 * coin's picture and its colours as a soft light from the card's top right corner). The board's other shape,
 * for browsing, where the table is for scanning. The coin's link (its pair and name) is stretched over the whole card, so
 * a press anywhere opens its page, and the controls sit above it. It carries what the row does, in the row's formats:
 * the market cap as the headline with the day's line beside it, the price in the Quote Asset with the day's change, the
 * curve, and what it is paired with, its volume and its age under a hairline.
 */
export function BoardCard({ launch, now, platform }: { launch: LaunchSummary; now: number; platform: ExplorerCluster }) {
  const quote = quoteTicker(launch.quote);
  const { market } = launch;
  const cap = market.marketCap ? formatMarketValue(market.marketCap, launch.quote) : "-";
  // The paired asset's colours, which the card's glow reads.
  const [tintA, tintB] = tintOf(launch.quote);
  const tint = { "--tint-a": tintA, "--tint-b": tintB } as CSSProperties;
  return (
    <article className={`card ${styles.card}`} data-coin-card="" style={tint}>
      <span className={styles.top}>
        {/* The coin with what it is priced in on its corner, as an exchange draws a pair. */}
        <span className={styles.imageWrap}>
          <CoinImage src={launch.image} symbol={launch.symbol} size={56} className={styles.image} loading="lazy" />
          <span className={styles.badge}><QuoteLogo quote={launch.quote} size={22} /></span>
        </span>
        <Link href={`/coin/${launch.mint}`} className={styles.title}>
          {/* The pair fits the box it is given (PairMark measures its parent), so it gets one of its own. */}
          <span className={styles.pairBox}>
            <PairMark base={launch.symbol} quote={quote} size="sm" />
          </span>
          <span className={styles.name}>
            {launch.name}
            {launch.rewardTax && <span className={styles.tax}>{launch.rewardTax.bps / 100}% tax</span>}
          </span>
        </Link>
        <CoinActions mint={launch.mint} symbol={launch.symbol} platform={platform} className={styles.actions} />
      </span>
      {/* The headline with the day's line beside it. */}
      <span className={styles.headline}>
        <span className={styles.cap}>
          <span className={styles.capValue}>{cap}</span>
          <span className={styles.capLabel}>Market cap</span>
        </span>
        <span className={styles.spark}>
          <Sparkline points={launch.sparkline} />
        </span>
      </span>
      <span className={styles.price}>
        {market.price === null ? <span className={styles.none}>No price yet</span> : <><Price value={market.price} /> {quote}</>}
        <DayChange value={market.change24h} />
      </span>
      <CurveState launch={launch} />
      <span className={styles.foot}>
        <span className={styles.paired}>
          <QuoteLogo quote={launch.quote} size={16} />
          <span>
            {quote} <span className={styles.kind}>{kindOf(launch.quote)}</span>
          </span>
        </span>
        <span className={styles.facts}>
          <span className={styles.fact}>
            <span className={styles.factLabel}>24h vol </span>
            {formatMarketValue(market.volume24h, launch.quote)}
          </span>
          <span className={`${styles.fact} ${styles.age}`} data-age>
            <RelativeTime iso={launch.createdAt} now={now} />
          </span>
        </span>
      </span>
    </article>
  );
}
