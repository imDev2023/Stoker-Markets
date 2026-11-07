import Link from "next/link";
import type { LaunchSummary } from "@launchpad/contract";
import { formatMarketValue } from "@/lib/board";
import { quoteTicker } from "@/lib/format";
import { CoinCard, type CoinCardData } from "./CoinCard";
import styles from "./Trending.module.css";

/** How far the curve is toward its Graduation Target, as a whole percentage; a sold-out curve is done. */
function progressOf(launch: LaunchSummary) {
  if (launch.curve.status !== "live") return 100;
  const target = BigInt(launch.graduationTarget);
  return target === 0n ? 0 : Math.min(100, Number((BigInt(launch.curve.raised) * 1000n) / target) / 10);
}

/** A launch in the card's terms. */
function cardOf(launch: LaunchSummary): CoinCardData {
  return {
    image: launch.image,
    symbol: launch.symbol,
    name: launch.name,
    quote: quoteTicker(launch.quote),
    price: launch.market.price,
    change24h: launch.market.change24h,
    progress: progressOf(launch),
    curve: launch.curve.status,
    volume: formatMarketValue(launch.market.volume24h, launch.quote),
    rewardTaxBps: launch.rewardTax?.bps ?? null,
  };
}

/**
 * The coins that trade most today, named as the fact it is (#133): six cards in a 3x2 grid at a desktop, a row that
 * scrolls sideways on a phone, and the board one tap away; no filter here, which is the board's. Rendered only once
 * there is something to show: with nothing launched the page's invitation stands in its place.
 */
export function Trending({ launches }: { launches: LaunchSummary[] }) {
  return (
    <section className={`shell ${styles.section}`} aria-labelledby="trending-title">
      <div className={styles.head}>
        <h2 id="trending-title" className={`t-h2 ${styles.title}`}>Most traded today</h2>
        <Link href="/coins?sort=trending" className={styles.all}>Every coin <span aria-hidden>→</span></Link>
      </div>
      <ul className={styles.grid} aria-label="Most traded today" data-scrolls>
        {launches.map((l) => (
          <li key={l.mint} className={styles.item}>
            <CoinCard card={cardOf(l)} href={`/coin/${l.mint}`} />
          </li>
        ))}
      </ul>
    </section>
  );
}
