import type { Metadata } from "next";
import Link from "next/link";
import { getBurns, getPlatform } from "@/lib/api";
import { explorerUrl, formatUnits, formatUtc, quoteTicker, SOL_DECIMALS } from "@/lib/format";
import styles from "../rewards/page.module.css";

export const metadata: Metadata = {
  title: "Burn and Flywheel",
  description: "How platform revenue buys the Platform Token and the top coins and burns them, every buy and burn on the Ledger.",
};

export default async function BurnsPage() {
  const [burns, platform] = await Promise.all([getBurns(), getPlatform()]);
  const sol = (lamports: string) => formatUnits(lamports, SOL_DECIMALS, 4);
  return (
    <div className={`shell ${styles.page}`}>
      <h1 className={styles.title}>Burn and Flywheel</h1>
      <p className={styles.lead}>{burns.rule}</p>

      <section className={styles.card} aria-labelledby="budgets-title">
        <h2 id="budgets-title" className={styles.cardTitle}>Revenue and what it bought</h2>
        <dl className={styles.rules}>
          <div>
            <dt>Revenue so far, in SOL</dt>
            <dd><span className="mono">{sol(burns.budgets.revenueLamports)}</span> SOL</dd>
          </div>
          <div>
            <dt>Burned the Platform Token with</dt>
            <dd><span className="mono">{sol(burns.budgets.burn.spent)}</span> SOL, <span className="mono">{sol(burns.budgets.burn.available)}</span> waiting</dd>
          </div>
          <div>
            <dt>Flywheel spent</dt>
            <dd><span className="mono">{sol(burns.budgets.flywheel.spent)}</span> SOL, <span className="mono">{sol(burns.budgets.flywheel.available)}</span> waiting</dd>
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

      <section className={styles.card} aria-labelledby="picks-title">
        <h2 id="picks-title" className={styles.cardTitle}>The Flywheel&apos;s next picks</h2>
        {burns.nextFlywheel.length === 0 ? (
          <p className={styles.note}>No graduated coin yet.</p>
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

      <section className={styles.card} aria-labelledby="events-title">
        <h2 id="events-title" className={styles.cardTitle}>Every buy and burn</h2>
        {burns.events.length === 0 ? (
          <p className={styles.note}>Nothing burned yet: the first burn runs once revenue has collected.</p>
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
      <Link href="/revenue" className={styles.back}>The full Ledger</Link>
    </div>
  );
}
