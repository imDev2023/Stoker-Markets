import type { Metadata } from "next";
import Link from "next/link";
import { getBurns, getPlatform } from "@/lib/api";
import { explorerUrl, formatUnits, formatUtc, quoteTicker, SOL_DECIMALS } from "@/lib/format";
import styles from "../rewards/page.module.css";
import { EmptyState } from "@/components/EmptyState";

export const metadata: Metadata = {
  title: "Burn and Flywheel",
  description: "How platform revenue buys the Platform Token and the top coins and burns them, every buy and burn on the Ledger.",
};

/** How much of a budget has been spent, for its bar: spent over spent plus what is still waiting. */
function spentShare(spent: string, available: string) {
  const total = BigInt(spent) + BigInt(available);
  return total === 0n ? 0 : Number((BigInt(spent) * 1000n) / total) / 10;
}

export default async function BurnsPage() {
  const [burns, platform] = await Promise.all([getBurns(), getPlatform()]);
  const sol = (lamports: string) => formatUnits(lamports, SOL_DECIMALS, 4);
  const burnShare = spentShare(burns.budgets.burn.spent, burns.budgets.burn.available);
  const flywheelShare = spentShare(burns.budgets.flywheel.spent, burns.budgets.flywheel.available);
  return (
    <div className={`shell ${styles.page}`}>
      <h1 className={`t-h1 ${styles.title}`}>Burn and Flywheel</h1>
      <p className={styles.lead}>{burns.rule}</p>

      <section className={`card ${styles.card}`} aria-labelledby="budgets-title">
        <h2 id="budgets-title" className={`t-h3 ${styles.cardTitle}`}>Revenue and what it bought</h2>
        <dl className={styles.rules}>
          {/* Revenue is the page's one key figure; each budget draws what it spent, in the heat, over what is waiting. */}
          <div className={`${styles.key} ${styles.budget}`}>
            <dt>Revenue so far, in SOL</dt>
            <dd><span className="mono">{sol(burns.budgets.revenueLamports)}</span> SOL</dd>
          </div>
          <div>
            <dt>Burned the Platform Token with</dt>
            <dd>
              <span className="mono">{sol(burns.budgets.burn.spent)}</span> SOL, <span className="mono">{sol(burns.budgets.burn.available)}</span> waiting
              <span className={styles.bar} aria-hidden>{burnShare > 0 && <span style={{ width: `${burnShare}%` }} />}</span>
            </dd>
          </div>
          <div>
            <dt>Flywheel spent</dt>
            <dd>
              <span className="mono">{sol(burns.budgets.flywheel.spent)}</span> SOL, <span className="mono">{sol(burns.budgets.flywheel.available)}</span> waiting
              <span className={styles.bar} aria-hidden>{flywheelShare > 0 && <span style={{ width: `${flywheelShare}%` }} />}</span>
            </dd>
          </div>
          <div>
            <dt>Platform Token</dt>
            <dd>
              {burns.platformToken ? <Link href={`/coin/${burns.platformToken}`} className="mono">{burns.platformToken.slice(0, 4)}…{burns.platformToken.slice(-4)}</Link> : "Not launched yet"}
            </dd>
          </div>
        </dl>
        {burns.burned.length > 0 && (
          <ul className={styles.list} aria-label="Burned so far">
            {burns.burned.map((b) => (
              <li key={b.coin.mint}>
                <span>{b.coin.symbol ?? quoteTicker(b.coin)} burned</span>
                <span className={`mono ${styles.amount}`}>{formatUnits(b.amount, b.coin.decimals, 0)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={`card ${styles.card}`} aria-labelledby="picks-title">
        <h2 id="picks-title" className={`t-h3 ${styles.cardTitle}`}>The Flywheel&apos;s next picks</h2>
        {burns.nextFlywheel.length === 0 ? (
          <EmptyState bare title="The Flywheel picks from graduated coins">No coin has graduated yet. The first to graduate is the first pick.</EmptyState>
        ) : (
          <ul className={styles.list}>
            {burns.nextFlywheel.map((p, i) => (
              <li key={p.mint}>
                <span>{i + 1}. <Link href={`/coin/${p.mint}`}>{p.symbol}</Link></span>
                <span />
              </li>
            ))}
          </ul>
        )}
        <p className={styles.note}>The {burns.shares.flywheelTopN} graduated coins with the most trading volume over the last 24 hours, recomputed from indexed trades at every run.</p>
      </section>

      <section className={`card ${styles.card}`} aria-labelledby="events-title">
        <h2 id="events-title" className={`t-h3 ${styles.cardTitle}`}>Every buy and burn</h2>
        {burns.events.length === 0 ? (
          <EmptyState bare title="The first burn runs once revenue has collected">Nothing burned yet. Every buy and burn is listed here with its transaction.</EmptyState>
        ) : (
          <ul className={styles.list}>
            {burns.events.map((e) => (
              <li key={e.signature}>
                <span>
                  {e.kind === "burn" ? "Burned the Platform Token" : `Flywheel burned ${e.coin.symbol ?? quoteTicker(e.coin)}`} for{" "}
                  <span className="mono">{sol(e.lamports)}</span> SOL ·{" "}
                  <a href={explorerUrl("tx", e.signature, platform)} target="_blank" rel="noreferrer">{formatUtc(e.time)}</a>
                </span>
                <span className={`mono ${styles.amount}`}>{formatUnits(e.amount, e.coin.decimals, 0)} {e.coin.symbol ?? ""}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
      <Link href="/revenue" className={`button button-ghost ${styles.back}`}>The full Ledger</Link>
    </div>
  );
}
