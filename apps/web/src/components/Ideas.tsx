import Link from "next/link";
import type { PlatformInfo, QuoteAsset } from "@launchpad/contract";
import { creatorEarnings } from "@/lib/fees";
import { quoteTicker } from "@/lib/format";
import { cycleQuotes, quoteKind } from "@/lib/landing";
import { PairMark } from "./PairMark";
import { QuoteLogo } from "./QuoteLogo";
import styles from "./Ideas.module.css";

/** The coin in the pair section's lockup: the brand's own, as in the hero's cycle. */
const EXAMPLE_COIN = "STOKER";

/**
 * One section per idea, each with its own visual (#133, after the research): the pair, the Creator's cut with its
 * figure, and the trust layer. The text sits in six columns and the visual in six, sides alternating; on a phone the
 * text comes first. Every figure is from the chain through the platform facts, never a constant.
 */
export function Ideas({ platform, quotes }: { platform: PlatformInfo; quotes: QuoteAsset[] }) {
  const count = quotes.length.toLocaleString("en-US");
  const earns = creatorEarnings(platform);
  const examples = cycleQuotes(quotes).slice(0, 3);
  return (
    <div className={styles.ideas}>
      <section className={`shell grid ${styles.idea}`} aria-labelledby="idea-pair">
        <div className={`col-6 ${styles.text}`}>
          <h2 id="idea-pair" className={`t-h2 ${styles.title}`}>Paired with the asset you choose</h2>
          <p className={`t-body ${styles.body}`}>
            A coin trades in the asset its Creator picked: SOL, a stablecoin, a tokenized stock or any of the {count} assets Raydium quotes. Its price, its Graduation Target and every trade are in that asset, and nothing else.
          </p>
          <Link href="/assets" className={styles.link}>All {count} assets, grouped <span aria-hidden>→</span></Link>
        </div>
        <div className={`col-6 ${styles.visual}`}>
          {examples.length > 0 && (
            <ul className={styles.pairs} aria-label="Pairs">
              {examples.map((q) => (
                <li key={q.mint} className={styles.pairRow}>
                  <QuoteLogo quote={q} size={36} />
                  <span className={styles.pairBox}><PairMark base={EXAMPLE_COIN} quote={quoteTicker(q)} size="lg" /></span>
                  <span className={styles.pairKind}>{quoteKind(q)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className={`shell grid ${styles.idea} ${styles.flip}`} aria-labelledby="idea-earn">
        <div className={`col-6 ${styles.text}`}>
          <h2 id="idea-earn" className={`t-h2 ${styles.title}`}>You earn from every trade</h2>
          <p className={`t-body ${styles.body}`}>
            Half of what the platform collects on your coin&apos;s trades is yours, on the curve and after graduation, sent to your wallet in the asset your coin trades in. Nothing to claim, and every payment on the public ledger.
          </p>
          <Link href="/revenue" className={styles.link}>See every payment on the ledger <span aria-hidden>→</span></Link>
        </div>
        <div className={`col-6 ${styles.visual}`}>
          <p className={styles.cut}>
            <span className={`t-figure-xl heat-text ${styles.cutFigure}`}>~{earns.curve}%</span>
            <span className={styles.cutLabel}>of every trade, to you</span>
            <span className={`t-caption ${styles.cutNote}`}>{earns.summary.replace(/^~[\d.]+% of every trade,? /, "")}</span>
          </p>
        </div>
      </section>

      <section className={`shell grid ${styles.idea}`} aria-labelledby="idea-trust">
        <div className={`col-6 ${styles.text}`}>
          <h2 id="idea-trust" className={`t-h2 ${styles.title}`}>Nothing to take on faith</h2>
          <p className={`t-body ${styles.body}`}>
            Every coin trades on Raydium&apos;s LaunchLab, with no program of our own in the way. The site builds each transaction and your wallet signs it. What the platform collects, sweeps, pays and burns is on a ledger anyone can read, through an API anyone can call.
          </p>
          <Link href="/api" className={styles.link}>The API, documented <span aria-hidden>→</span></Link>
        </div>
        <div className={`col-6 ${styles.visual}`}>
          <ul className={styles.facts} aria-label="What you can check">
            <li className={`card ${styles.fact}`}>
              <span className={styles.factTitle}>Raydium LaunchLab</span>
              <span className={styles.factText}>The curve, the pool and the Graduation are Raydium&apos;s programs.</span>
            </li>
            <li className={`card ${styles.fact}`}>
              <span className={styles.factTitle}>Your wallet signs</span>
              <span className={styles.factText}>No key of yours ever leaves it; the site only builds the transaction.</span>
            </li>
            <li className={`card ${styles.fact}`}>
              <span className={styles.factTitle}>Copy Protection</span>
              <span className={styles.factText}>A launched coin&apos;s name, ticker and image are nobody else&apos;s for a window after launch.</span>
            </li>
            <li className={`card ${styles.fact}`}>
              <span className={styles.factTitle}>Quote Risk Labels</span>
              <span className={styles.factText}>What an asset&apos;s issuer can do, freezing wallets or taxing transfers, said on every pair.</span>
            </li>
          </ul>
        </div>
      </section>
    </div>
  );
}
