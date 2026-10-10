import Link from "next/link";
import type { PlatformInfo, QuoteAsset } from "@launchpad/contract";
import { creatorEarnings } from "@/lib/fees";
import { quoteTicker } from "@/lib/format";
import { deepestQuotes, quoteKind } from "@/lib/landing";
import { LAUNCH_LINK } from "@/lib/site";
import { QuoteLogo } from "./QuoteLogo";
import styles from "./Hero.module.css";

/**
 * The landing's hero (owner, 2026-10-09; the look from docs/design/principles.md): the slogan at display size with its
 * emphasised phrase in the heat and the heat's glow behind it, the lede naming the assets and the creator's cut, the
 * two actions, and under them a strip of the deepest markets a coin can be priced in, with the count that makes the
 * claim a fact. Every figure is live: the count and the assets from the Quote Registry, the creator's cut from the chain.
 */
export function Hero({ quotes, platform }: { quotes: QuoteAsset[]; platform: PlatformInfo }) {
  const launchable = quotes.filter((q) => q.launchable);
  const deepest = deepestQuotes(launchable);
  const earns = creatorEarnings(platform);
  const count = launchable.length.toLocaleString("en-US");
  return (
    <section className={`shell ${styles.hero}`} aria-labelledby="hero-title">
      <div className={styles.copy}>
        <h1 id="hero-title" className={`t-display ${styles.title}`}>
          No one picks your pair. <em className={`heat-text ${styles.heat}`}>You do.</em>
        </h1>
        <p className={`t-lede ${styles.lede}`}>
          Price it in SOL, a stablecoin or a tokenized stock, any of the {count} assets Raydium quotes. Creators earn{" "}
          {earns.summary}, sent to their wallet, every payment on the public ledger.
        </p>
        <div className={styles.actions}>
          <Link href={LAUNCH_LINK.href} className="button button-primary button-lg">{LAUNCH_LINK.label}</Link>
          <Link href="/revenue" className="button button-ghost button-lg">See the ledger</Link>
        </div>
      </div>
      <aside className={`card card-raised ${styles.strip}`} aria-labelledby="paired-title">
        <div className={styles.stripCopy}>
          <h2 id="paired-title" className={`t-h3 ${styles.stripTitle}`}>Priced in any of {count} assets</h2>
          <p className={styles.stripNote}>
            Every asset Raydium quotes, the deepest markets first: a coin trades in the asset its Creator chose, and nothing else.
          </p>
          <Link href="/assets" className={styles.all}>All {count} assets, grouped</Link>
        </div>
        <ul className={styles.assets} aria-label="The deepest markets">
          {deepest.map((q) => (
            <li key={q.mint} className={styles.asset}>
              <QuoteLogo quote={q} size={34} />
              <span className={styles.ticker}>{quoteTicker(q)}</span>
              <span className={styles.kind}>{quoteKind(q)}</span>
            </li>
          ))}
        </ul>
      </aside>
    </section>
  );
}
