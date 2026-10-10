import Link from "next/link";
import type { LaunchSummary } from "@launchpad/contract";
import { formatMarketValue } from "@/lib/board";
import { formatPrice, quoteTicker, timeAgo } from "@/lib/format";
import styles from "./CoinRow.module.css";

/** How far the curve is toward its Graduation Target, as a whole percentage; a sold-out curve is done. */
function progressOf(launch: LaunchSummary) {
  if (launch.curve.status !== "live") return 100;
  const target = BigInt(launch.graduationTarget);
  return target === 0n ? 0 : Math.min(100, Number((BigInt(launch.curve.raised) * 1000n) / target) / 10);
}

/** The board's column names, in the row's order; the board draws them once above the rows. */
export const COIN_COLUMNS = ["Coin", "Paired", "Price", "Market cap", "Curve", "24h volume", "Launched", "Mode"] as const;

/**
 * One coin as a terminal row: the whole row is the link to its page. Numbers are in mono and right-aligned under their
 * column; the curve is the one thing drawn, in the heat ramp, and a graduated coin says so in the gain colour.
 */
export function CoinRow({ launch, now }: { launch: LaunchSummary; now: number }) {
  const quote = quoteTicker(launch.quote);
  const { status } = launch.curve;
  const pct = progressOf(launch);
  const stock = launch.quote.category === "tokenized_stock";
  return (
    <Link href={`/coin/${launch.mint}`} className={styles.row}>
      <span className={styles.coin}>
        {launch.image ? (
          <img className={styles.image} src={launch.image} alt="" width={22} height={22} loading="lazy" />
        ) : (
          <span className={styles.image} aria-hidden />
        )}
        <span className={styles.symbol}>{launch.symbol}</span>
        <span className={styles.name}>{launch.name}</span>
      </span>
      <span className={`${styles.paired} ${stock ? styles.stock : ""}`}>{quote}</span>
      <span className={`${styles.num} ${styles.price}`} data-label="Price">{launch.market.price === null ? "-" : formatPrice(launch.market.price)}</span>
      <span className={`${styles.num} ${styles.mcap}`} data-label="Market cap">{launch.market.marketCap ? formatMarketValue(launch.market.marketCap, launch.quote) : "-"}</span>
      <span className={styles.curve}>
        {status === "live" ? (
          <>
            <span className={styles.track} aria-hidden>
              {pct > 0 && <span className={styles.fill} style={{ width: `${pct}%` }} />}
            </span>
            <span className={styles.pct}>{pct.toFixed(pct > 0 && pct < 10 ? 1 : 0)}%</span>
          </>
        ) : status === "graduating" ? (
          <span className={styles.graduating}>Sold out, graduating</span>
        ) : (
          <span className={styles.graduated}>Graduated</span>
        )}
      </span>
      <span className={`${styles.num} ${styles.vol}`} data-label="24h volume">{formatMarketValue(launch.market.volume24h, launch.quote)}</span>
      <span className={styles.when} data-label="Launched">
        <time dateTime={launch.createdAt}>{timeAgo(launch.createdAt, now)}</time>
      </span>
      <span className={styles.mode}>{launch.rewardTax ? `reward ${launch.rewardTax.bps / 100}%` : ""}</span>
    </Link>
  );
}
