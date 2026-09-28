import { Fragment } from "react";
import type { LedgerPage, PlatformInfo, Revenue, RevenueAsset } from "@launchpad/contract";
import { explorerUrl, formatUnits, formatUtcDay, quoteTicker, shortAddress, SOL_DECIMALS } from "@/lib/format";
import { CopyButton } from "./CopyButton";
import { LedgerList } from "./LedgerList";
import { QuoteLogo } from "./QuoteLogo";
import styles from "./RevenueDashboard.module.css";

/** Totals show up to six decimals; the Ledger shows every one. */
const TOTAL_DECIMALS = 6;
const total = (raw: string, asset: RevenueAsset) => formatUnits(raw, asset.decimals, Math.min(asset.decimals, TOTAL_DECIMALS));

/**
 * The public revenue page: what the platform has collected in each asset, all time and per day, where it went, and the
 * Ledger entry by entry. Every figure is a sum of Ledger entries, each one a transaction anyone can look up.
 */
export function RevenueDashboard({ revenue, ledger, platform }: { revenue: Revenue; ledger: LedgerPage; platform: PlatformInfo }) {
  const sol = (lamports: string) => formatUnits(lamports, SOL_DECIMALS);
  // A sweep moves everything above the float, not only revenue, so what was swept is shown apart from what was earned.
  const swept = revenue.totals.filter((t) => t.swept !== "0");
  return (
    <article className={`shell ${styles.page}`}>
      <header className={styles.head}>
        <h1 className={styles.title}>Platform revenue</h1>
        <p className={styles.lede}>
          Every fee the platform collects, and every move to its treasury, is a Solana transaction on the Ledger below.
          Anyone can check these totals against it.
        </p>
      </header>

      <div className={styles.layout}>
        <div className={styles.main}>
          <section className={styles.section} aria-labelledby="totals-title">
            <h2 id="totals-title" className="visually-hidden">All time</h2>
            {revenue.totals.length === 0 ? (
              <div className={styles.emptyCard}>
                <p>
                  No revenue collected yet. The Fee Collector runs every hour, and each collection shows up here with its
                  transaction.
                </p>
              </div>
            ) : (
              <ul className={styles.totals}>
                {revenue.totals.map((t) => (
                  <li key={t.asset.mint} className={styles.asset}>
                    <p className={styles.assetName}>
                      <QuoteLogo quote={t.asset} size={24} />
                      <span className={styles.ticker}>{quoteTicker(t.asset)}</span>
                      {t.asset.name && <span className={styles.name}>{t.asset.name}</span>}
                    </p>
                    <p className={styles.amount}>
                      <span className="mono">{total(t.total, t.asset)}</span>
                      <span className={styles.amountLabel}>collected, all time</span>
                    </p>
                    <dl className={styles.streams}>
                      <div>
                        <dt>Curves</dt>
                        <dd className="mono">{total(t.platformFee, t.asset)}</dd>
                      </div>
                      <div>
                        <dt>Pools</dt>
                        <dd className="mono">{total(t.poolFee, t.asset)}</dd>
                      </div>
                      <div>
                        <dt>Fee Keys</dt>
                        <dd className="mono">{total(t.feeKey, t.asset)}</dd>
                      </div>
                    </dl>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {revenue.days.length > 0 && (
            <section className={styles.card} aria-labelledby="days-title">
              <h2 id="days-title" className={styles.cardTitle}>By day</h2>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th scope="col">Day (UTC)</th>
                    <th scope="col">Asset</th>
                    <th scope="col" className={`${styles.num} ${styles.wide}`}>Curves</th>
                    <th scope="col" className={`${styles.num} ${styles.wide}`}>Pools</th>
                    <th scope="col" className={`${styles.num} ${styles.wide}`}>Fee Keys</th>
                    <th scope="col" className={styles.num}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {revenue.days.map((d) => (
                    <Fragment key={d.day}>
                      {d.assets.map((a, i) => (
                        <tr key={a.asset.mint} className={i === 0 ? styles.dayStart : undefined}>
                          {i === 0 && (
                            <th scope="rowgroup" rowSpan={d.assets.length} className={styles.day}>
                              <time dateTime={d.day}>{formatUtcDay(d.day)}</time>
                            </th>
                          )}
                          <td className={styles.ticker}>{quoteTicker(a.asset)}</td>
                          <td className={`mono ${styles.num} ${styles.wide}`}>{total(a.platformFee, a.asset)}</td>
                          <td className={`mono ${styles.num} ${styles.wide}`}>{total(a.poolFee, a.asset)}</td>
                          <td className={`mono ${styles.num} ${styles.wide}`}>{total(a.feeKey, a.asset)}</td>
                          <td className={`mono ${styles.num}`}>{total(a.total, a.asset)}</td>
                        </tr>
                      ))}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </section>
          )}

          {ledger.entries.length > 0 && <LedgerList initial={ledger} platform={platform} />}
        </div>

        <aside className={styles.side}>
          <section className={styles.rule} aria-labelledby="streams-title">
            <h2 id="streams-title" className={styles.cardTitle}>Where revenue comes from</h2>
            <dl className={styles.explain}>
              <div>
                <dt>Curves</dt>
                <dd>The Platform Fee, {platform.platformFeeBps / 100}% of every trade on a coin&apos;s curve, claimed from LaunchLab&apos;s vault.</dd>
              </div>
              <div>
                <dt>Pools</dt>
                <dd>After graduation, the platform&apos;s share of every trade in the coin&apos;s Raydium pool.</dd>
              </div>
              <div>
                <dt>Fee Keys</dt>
                <dd>The trading fees earned by each graduated pool&apos;s locked liquidity, in both of its tokens.</dd>
              </div>
            </dl>
          </section>

          <section className={styles.card} aria-labelledby="wallets-title">
            <h2 id="wallets-title" className={styles.cardTitle}>Where it goes</h2>
            <dl className={styles.wallets}>
              <div>
                <dt>Operations wallet</dt>
                <dd>
                  <a className="mono" href={explorerUrl("address", revenue.operationsWallet, platform)} target="_blank" rel="noreferrer">
                    {shortAddress(revenue.operationsWallet)}
                  </a>
                  <CopyButton value={revenue.operationsWallet} label="Copy operations wallet address" />
                </dd>
              </div>
              <div>
                <dt>Treasury</dt>
                <dd>
                  {revenue.treasury ? (
                    <>
                      <a className="mono" href={explorerUrl("address", revenue.treasury, platform)} target="_blank" rel="noreferrer">
                        {shortAddress(revenue.treasury)}
                      </a>
                      <CopyButton value={revenue.treasury} label="Copy treasury address" />
                    </>
                  ) : (
                    <span className={styles.muted}>Not set up yet</span>
                  )}
                </dd>
              </div>
            </dl>
            {swept.length > 0 && (
              <div className={styles.sweptBlock}>
                <h3 id="swept-title" className={styles.subTitle}>Swept to the treasury so far</h3>
                <dl className={styles.swept} aria-labelledby="swept-title">
                  {swept.map((t) => (
                    <div key={t.asset.mint}>
                      <dt>{quoteTicker(t.asset)}</dt>
                      <dd className="mono">{total(t.swept, t.asset)}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            )}
            <p className={styles.muted}>
              Fees are collected into the operations wallet every hour. Once it holds more than {sol(revenue.sweepThresholdLamports)} SOL,
              everything above {sol(revenue.sweepFloatLamports)} SOL moves on to the treasury, and every other token moves on whole, so
              the hot wallet never holds much.
            </p>
          </section>
        </aside>
      </div>
    </article>
  );
}
