import Link from "next/link";
import type { LaunchSummary, QuoteAsset } from "@launchpad/contract";
import { cycleQuotes, type HeroVariant } from "@/lib/landing";
import { LAUNCH_LINK } from "@/lib/site";
import { HeroVisual } from "./HeroVisual";
import styles from "./Hero.module.css";

/**
 * The landing's hero on the grid (#133, after the research's section 4): the slogan (owner, 2026-10-09) and one lede
 * naming the mechanism in six columns, the filled action and a text link, and in the other six the product itself,
 * one of three visuals the owner picks from (`variant`). No glow, no dot grid: at most 70% of the viewport, so the
 * proof row under it is cut by the fold. The count is live from the Quote Registry, so the lede is a fact of this chain.
 */
export function Hero({ quotes, launches, variant }: { quotes: QuoteAsset[]; launches: LaunchSummary[]; variant: HeroVariant }) {
  const count = quotes.length.toLocaleString("en-US");
  return (
    <section className={`shell ${styles.hero}`} aria-labelledby="hero-title">
      <div className={`grid ${styles.grid}`}>
        <div className={`col-6 ${styles.copy}`}>
          <h1 id="hero-title" className={`t-display ${styles.title}`}>
            No one picks your pair. <em className={`heat-text ${styles.heat}`}>You do.</em>
          </h1>
          <p className={`t-lede ${styles.lede}`}>
            Launch a coin on Solana priced in SOL, a stablecoin, a tokenized stock or any of the {count} assets Raydium quotes.
          </p>
          <div className={styles.actions}>
            <Link href={LAUNCH_LINK.href} className="button button-primary button-lg">{LAUNCH_LINK.label}</Link>
            <Link href="/coins" className={`button button-text button-lg ${styles.explore}`}>
              Explore coins <span aria-hidden className={styles.arrow}>→</span>
            </Link>
          </div>
        </div>
        <div className={`col-6 ${styles.visual}`}>
          <HeroVisual variant={variant} launches={launches.slice(0, 5)} quotes={cycleQuotes(quotes)} />
        </div>
      </div>
    </section>
  );
}
