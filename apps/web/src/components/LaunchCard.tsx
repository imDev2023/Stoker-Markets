import Link from "next/link";
import type { LaunchSummary } from "@launchpad/contract";
import { formatMarketValue } from "@/lib/board";
import { formatAmount, quoteTicker, timeAgo } from "@/lib/format";
import { PairMark } from "./PairMark";
import styles from "./LaunchCard.module.css";

/** How far the curve is toward its Graduation Target, as a whole percentage; a sold-out curve is done. */
function progressOf(launch: LaunchSummary) {
  if (launch.curve.status !== "live") return 100;
  const target = BigInt(launch.graduationTarget);
  return target === 0n ? 0 : Math.min(100, Number((BigInt(launch.curve.raised) * 1000n) / target) / 10);
}

export function LaunchCard({ launch, now }: { launch: LaunchSummary; now: number }) {
  const quote = quoteTicker(launch.quote);
  const { status } = launch.curve;
  const pct = progressOf(launch);
  const cap = launch.market.marketCap;
  return (
    <Link href={`/coin/${launch.mint}`} className={styles.card}>
      <div className={styles.top}>
        {launch.image ? (
          <img className={styles.image} src={launch.image} alt="" width={56} height={56} loading="lazy" />
        ) : (
          <div className={styles.image} aria-hidden />
        )}
        <div className={styles.titles}>
          <PairMark base={launch.symbol} quote={quote} />
          <span className={styles.name}>{launch.name}</span>
        </div>
      </div>
      {launch.description && <p className={styles.description}>{launch.description}</p>}
      <div className={styles.bottom}>
        <dl className={styles.facts}>
          <div>
            <dt>Market cap</dt>
            <dd>{cap ? formatMarketValue(cap, launch.quote) : "-"}</dd>
          </div>
          <div>
            <dt>24h volume</dt>
            <dd>{formatMarketValue(launch.market.volume24h, launch.quote)}</dd>
          </div>
          <div>
            <dt>Launched</dt>
            <dd>
              <time dateTime={launch.createdAt}>{timeAgo(launch.createdAt, now)}</time>
            </dd>
          </div>
        </dl>
        <div className={`${styles.progress} ${status === "graduated" ? styles.graduated : ""}`}>
          <span className={styles.track} aria-hidden>
            {pct > 0 && <span className={styles.fill} style={{ width: `${pct}%` }} />}
          </span>
          <span className={styles.progressText}>
            {status === "live"
              ? `${pct.toFixed(pct > 0 && pct < 10 ? 1 : 0)}% of ${formatAmount(launch.graduationTarget, launch.quote.decimals)} ${quote}`
              : status === "graduating"
                ? "Sold out, graduating"
                : "Graduated"}
          </span>
        </div>
      </div>
    </Link>
  );
}
