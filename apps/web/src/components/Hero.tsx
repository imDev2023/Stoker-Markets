import Link from "next/link";
import type { PlatformInfo, QuoteAsset } from "@launchpad/contract";
import { creatorEarnings } from "@/lib/fees";
import { quoteTicker } from "@/lib/format";
import { featuredQuotes, otherKinds, quoteKind } from "@/lib/landing";
import { LAUNCH_LINK } from "@/lib/site";
import styles from "./Hero.module.css";

/**
 * The landing's hero (owner, 2026-10-09): the slogan carries the open half of the pitch, the lede the assets and the
 * creator's cut, and the card beside them names a few of the assets the registry quotes, with the count that makes the
 * claim a fact. Every figure is live: the count and the assets from the Quote Registry, the creator's cut from the chain.
 */
export function Hero({ quotes, platform }: { quotes: QuoteAsset[]; platform: PlatformInfo }) {
  const launchable = quotes.filter((q) => q.launchable);
  const featured = featuredQuotes(launchable);
  const others = otherKinds(launchable, featured);
  const earns = creatorEarnings(platform);
  const count = launchable.length.toLocaleString("en-US");
  return (
    <section className={`shell ${styles.hero}`} aria-labelledby="hero-title">
      <div className={styles.copy}>
        <h1 id="hero-title" className={styles.title}>
          No one picks your pair. <em className={styles.heat}>You do.</em>
        </h1>
        <p className={styles.lede}>
          Price it in SOL, a stablecoin or a tokenized stock, any of the {count} assets Raydium quotes. Creators earn{" "}
          {earns.summary}, sent to their wallet, every payment on the public ledger.
        </p>
        <div className={styles.actions}>
          <Link href={LAUNCH_LINK.href} className={styles.cta}>{LAUNCH_LINK.label}</Link>
          <Link href="/revenue" className={styles.secondary}>See the ledger</Link>
        </div>
      </div>
      <aside className={styles.card} aria-labelledby="paired-title">
        <h2 id="paired-title" className={styles.cardTitle}>Priced in any of {count} assets</h2>
        <ul className={styles.assets}>
          {featured.map((q) => (
            <li key={q.mint}>
              <span className={styles.ticker}>{quoteTicker(q)}</span>
              <span className={styles.kind}>{quoteKind(q)}</span>
            </li>
          ))}
        </ul>
        <p className={styles.more}>
          {others.length > 0 ? `and every other asset Raydium quotes: ${others.join(", ")}.` : "and every other asset Raydium quotes."}
        </p>
        <Link href="/assets" className={styles.all}>All {count} assets, grouped</Link>
      </aside>
    </section>
  );
}
