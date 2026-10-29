import Link from "next/link";
import type { LaunchSummary } from "@launchpad/contract";
import { formatMarketValue } from "@/lib/board";
import { quoteTicker } from "@/lib/format";
import { Change } from "./Change";
import { CoinImage } from "./CoinImage";
import { PairMark } from "./PairMark";
import { Price } from "./Price";
import styles from "./Trending.module.css";

/** How far the curve is toward its Graduation Target, as a whole percentage; a sold-out curve is done. */
function progressOf(launch: LaunchSummary) {
  if (launch.curve.status !== "live") return 100;
  const target = BigInt(launch.graduationTarget);
  return target === 0n ? 0 : Math.min(100, Number((BigInt(launch.curve.raised) * 1000n) / target) / 10);
}

/**
 * One coin as a card (#133, after the research): the image with its fallback, the pair mark and the name, the price with
 * the day's change, the curve as the one thing drawn, and the day's volume; every card the same rows, so a grid of six
 * lines up. The pair is said once, by the mark.
 */
function CoinCard({ launch }: { launch: LaunchSummary }) {
  const quote = quoteTicker(launch.quote);
  const pct = progressOf(launch);
  const live = launch.curve.status === "live";
  return (
    <li className={styles.item}>
      <Link href={`/coin/${launch.mint}`} className={`card card-raised ${styles.card}`}>
        <div className={styles.top}>
          <CoinImage src={launch.image} symbol={launch.symbol} size={44} className={styles.image} loading="lazy" />
          <div className={styles.titles}>
            <span className={styles.pairBox}><PairMark base={launch.symbol} quote={quote} size="md" /></span>
            <span className={styles.name}>{launch.name}</span>
          </div>
        </div>
        <div className={styles.row}>
          <span className={`t-figure ${styles.price}`}>{launch.market.price === null ? "-" : <><Price value={launch.market.price} /> {quote}</>}</span>
          <Change value={launch.market.change24h} />
        </div>
        <div className={styles.curve}>
          <span className={styles.track} aria-hidden>
            <span className={styles.fill} style={{ width: `${pct}%` }} />
          </span>
          <span className={styles.meta}>
            {live ? `${pct.toFixed(pct > 0 && pct < 10 ? 1 : 0)}% of the way to graduation` : launch.curve.status === "graduating" ? "Sold out, graduating" : "Graduated, in its Raydium pool"}
          </span>
        </div>
        <div className={styles.row}>
          <span className={styles.meta}>{formatMarketValue(launch.market.volume24h, launch.quote)} traded today</span>
          {launch.rewardTax && <span className="tag tag-caution">{launch.rewardTax.bps / 100}% to holders</span>}
        </div>
      </Link>
    </li>
  );
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
          <CoinCard key={l.mint} launch={l} />
        ))}
      </ul>
    </section>
  );
}
