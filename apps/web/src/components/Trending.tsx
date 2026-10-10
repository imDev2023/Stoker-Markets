import Link from "next/link";
import type { LaunchSummary } from "@launchpad/contract";
import { formatMarketValue } from "@/lib/board";
import { formatPrice, quoteTicker } from "@/lib/format";
import { LAUNCH_LINK } from "@/lib/site";
import { Ring } from "./Mark";
import { PairMark } from "./PairMark";
import styles from "./Trending.module.css";

/** Where each chip takes a visitor: the board, sorted by what trades most, narrowed to one kind of pairing. */
const CHIPS = [
  { label: "All", href: "/coins?sort=trending" },
  { label: "xStocks", href: "/coins?sort=trending&issuer=xstocks" },
  { label: "PreStocks", href: "/coins?sort=trending&issuer=prestocks" },
  { label: "Backpack", href: "/coins?sort=trending&issuer=backpack" },
  { label: "Currencies", href: "/coins?sort=trending&category=stablecoin" },
  { label: "Solana", href: "/coins?sort=trending&category=sol" },
] as const;

/** How far the curve is toward its Graduation Target, as a whole percentage; a sold-out curve is done. */
function progressOf(launch: LaunchSummary) {
  if (launch.curve.status !== "live") return 100;
  const target = BigInt(launch.graduationTarget);
  return target === 0n ? 0 : Math.min(100, Number((BigInt(launch.curve.raised) * 1000n) / target) / 10);
}

function CoinCard({ launch }: { launch: LaunchSummary }) {
  const quote = quoteTicker(launch.quote);
  const pct = progressOf(launch);
  const live = launch.curve.status === "live";
  return (
    <li>
      <Link href={`/coin/${launch.mint}`} className={`card card-raised ${styles.card}`}>
        <div className={styles.top}>
          {launch.image ? (
            <img className={styles.image} src={launch.image} alt="" width={44} height={44} loading="lazy" />
          ) : (
            <div className={styles.image} aria-hidden />
          )}
          <div className={styles.titles}>
            <PairMark base={launch.symbol} quote={quote} size="sm" />
            <span className={styles.name}>{launch.name}</span>
          </div>
          <span className={`tag ${launch.quote.category === "tokenized_stock" ? "tag-accent" : ""} ${styles.pair}`}>Paired with {quote}</span>
        </div>
        <div className={styles.row}>
          <span className={`t-figure ${styles.price}`}>{launch.market.price === null ? "-" : `${formatPrice(launch.market.price)} ${quote}`}</span>
          <span className={styles.meta}>{launch.market.marketCap ? `${formatMarketValue(launch.market.marketCap, launch.quote)} market cap` : "no trades yet"}</span>
        </div>
        {live ? (
          <>
            <span className={styles.track} aria-hidden>
              {pct > 0 && <span className={styles.fill} style={{ width: `${pct}%` }} />}
            </span>
            <span className={styles.meta}>{pct.toFixed(pct > 0 && pct < 10 ? 1 : 0)}% of the way to graduation</span>
          </>
        ) : (
          <span className={styles.meta}>{launch.curve.status === "graduating" ? "Sold out, graduating" : "Graduated: trading in its Raydium pool"}</span>
        )}
        <div className={styles.row}>
          <span className={styles.meta}>{formatMarketValue(launch.market.volume24h, launch.quote)} traded today</span>
          {launch.rewardTax && <span className="tag tag-caution">Reward launch, {launch.rewardTax.bps / 100}% to holders</span>}
        </div>
      </Link>
    </li>
  );
}

/**
 * The landing's coins: the six that trade most, as cards a visitor could tap on a phone; the dense board is one tap
 * away. With nothing launched yet it invites the first launch with the ring at size, since a new platform is judged on
 * this view and an empty state is designed, never a sentence in a box.
 */
export function Trending({ launches }: { launches: LaunchSummary[] }) {
  return (
    <section className={`shell ${styles.section}`} aria-labelledby="trending-title">
      <div className={styles.head}>
        <h2 id="trending-title" className={`t-h2 ${styles.title}`}>Trending now</h2>
        <nav className={styles.chips} aria-label="Paired with">
          {CHIPS.map((c, i) => (
            <Link key={c.label} href={c.href} className="chip" aria-current={i === 0 ? "true" : undefined}>{c.label}</Link>
          ))}
        </nav>
        <Link href="/coins" className={styles.all}>Every coin</Link>
      </div>
      {launches.length === 0 ? (
        <div className={`card card-raised ${styles.empty}`}>
          <Ring size={96} className={styles.ring} />
          <p>No coins yet. The first one could be yours.</p>
          <Link href={LAUNCH_LINK.href} className="button button-primary button-lg">{LAUNCH_LINK.label}</Link>
        </div>
      ) : (
        <ul className={styles.grid} aria-label="Trending coins">
          {launches.map((l) => (
            <CoinCard key={l.mint} launch={l} />
          ))}
        </ul>
      )}
    </section>
  );
}
