import Link from "next/link";
import type { LaunchSummary } from "@launchpad/contract";
import { formatDelta, formatMarketValue } from "@/lib/board";
import { quoteTicker } from "@/lib/format";
import { CoinImage } from "./CoinImage";
import { PairMark } from "./PairMark";
import { Price } from "./Price";
import { QuoteLogo } from "./QuoteLogo";
import { RelativeTime } from "./RelativeTime";
import styles from "./CoinRow.module.css";

/** How far the curve is toward its Graduation Target, to a hundredth of a percent as CurveProgress has it; a sold-out curve is done. */
function progressOf(launch: LaunchSummary) {
  if (launch.curve.status !== "live") return 100;
  const target = BigInt(launch.graduationTarget);
  return target === 0n ? 0 : Math.min(100, Number((BigInt(launch.curve.raised) * 10_000n) / target) / 100);
}

/**
 * The board's columns (#135, after the research's table principles): the coin first, then the figures a trader scans
 * for, with the unit in the name where every cell shares one. The table draws them once above the rows; the phone
 * layout labels each figure itself.
 */
export const COLUMNS = [
  { name: "Pair", key: "pair" },
  { name: "Price", key: "price", numeric: true },
  { name: "5m", key: "delta5m", numeric: true },
  { name: "24h", key: "delta24h", numeric: true },
  { name: "24h volume", key: "volume", numeric: true },
  { name: "Market cap", key: "mcap", numeric: true },
  { name: "Curve", key: "curve" },
  { name: "Holders", key: "holders", numeric: true },
  { name: "Age", key: "age", numeric: true },
] as const;

/** A price change with its sign and an arrow, so the direction never rests on colour alone; a dash where nothing has traded yet. */
function Delta({ value, label, className = "" }: { value: number | null; label: string; className?: string }) {
  const text = formatDelta(value);
  if (text === null) return <span className={`${styles.num} ${styles.none} ${className}`} data-label={label} title="No trade to measure from yet">-</span>;
  const tone = value! > 0 ? styles.up : value! < 0 ? styles.down : styles.flat;
  return (
    <span className={`${styles.num} ${styles.delta} ${tone} ${className}`} data-label={label} title={`Price change over the last ${label}`}>
      {value !== 0 && (
        <svg viewBox="0 0 8 8" width="7" height="7" aria-hidden="true" className={styles.arrow}>
          {value! > 0 ? <path d="M4 1 7.5 7H.5Z" fill="currentColor" /> : <path d="M4 7 .5 1h7Z" fill="currentColor" />}
        </svg>
      )}
      {text}
    </span>
  );
}

/**
 * One coin as a terminal row: the whole row is the link to its page. The pair is the unit (docs/design/layout.md): the
 * lockup draws both halves (the coin's image with the Quote Asset's logo over its corner) and the mark writes them
 * (BASE/QUOTE), with the name under. The figures are right-aligned tabular mono under their column names; the curve is
 * the one thing drawn, in the heat ramp, and a graduated coin says so in the gain colour. A Reward Launch's tax sits
 * by its name, where the MODE column was.
 */
export function CoinRow({ launch, now }: { launch: LaunchSummary; now: number }) {
  const quote = quoteTicker(launch.quote);
  const { status } = launch.curve;
  const pct = progressOf(launch);
  return (
    <Link href={`/coin/${launch.mint}`} className={styles.row}>
      <span className={styles.coin}>
        <span className={styles.lockup}>
          <CoinImage src={launch.image} symbol={launch.symbol} size={24} className={styles.image} loading="lazy" />
          <span className={styles.quoteLogo}><QuoteLogo quote={launch.quote} size={14} /></span>
        </span>
        {/* The pair fits the box it is given (PairMark measures its parent), so it gets one of its own. */}
        <span className={styles.pairBox}>
          <PairMark base={launch.symbol} quote={quote} size="sm" />
        </span>
        <span className={styles.name}>
          {launch.name}
          {launch.rewardTax && <span className={styles.tax}>{launch.rewardTax.bps / 100}% tax</span>}
        </span>
      </span>
      <span className={`${styles.num} ${styles.price}`} data-label="Price">{launch.market.price === null ? "-" : <Price value={launch.market.price} />}</span>
      <Delta value={launch.market.change5m} label="5m" className={styles.delta5m} />
      <Delta value={launch.market.change24h} label="24h" className={styles.delta24h} />
      {/* The rest of the figures: cells of the grid at a desktop, one named line under the pair on a phone. */}
      <span className={styles.facts}>
      <span className={`${styles.num} ${styles.vol}`} data-label="Vol">{formatMarketValue(launch.market.volume24h, launch.quote)}</span>
      <span className={`${styles.num} ${styles.mcap}`} data-label="Cap">{launch.market.marketCap ? formatMarketValue(launch.market.marketCap, launch.quote) : "-"}</span>
      <span className={styles.curve}>
        {status === "live" ? (
          <>
            <span className={styles.track} aria-hidden>
              {pct > 0 && <span className={styles.fill} style={{ width: `${pct}%` }} />}
            </span>
            <span className={styles.pct}>{pct.toFixed(pct > 0 && pct < 10 ? 1 : 0)}%</span>
          </>
        ) : status === "graduating" ? (
          <span className={styles.graduating}>Graduating</span>
        ) : (
          <span className={styles.graduated}>Graduated</span>
        )}
      </span>
      <span className={`${styles.num} ${styles.holders}`} data-label="Holders">{launch.market.holders.toLocaleString("en-US")}</span>
      <span className={`${styles.num} ${styles.when}`} data-label="Age">
        <RelativeTime iso={launch.createdAt} now={now} />
      </span>
      </span>
    </Link>
  );
}
