import { Fragment } from "react";
import type { LedgerPage, PlatformInfo, Revenue, RevenueAsset } from "@launchpad/contract";
import { creatorEarnings } from "@/lib/fees";
import { explorerUrl, formatAmount, formatUnits, formatUtcDay, quoteTicker, shortAddress, SOL_DECIMALS } from "@/lib/format";
import { CopyButton } from "./CopyButton";
import { LedgerList } from "./LedgerList";
import { Ring } from "./Mark";
import { QuoteLogo } from "./QuoteLogo";
import styles from "./RevenueDashboard.module.css";

/** Totals show up to six decimals; the Ledger shows every one. */
const TOTAL_DECIMALS = 6;
const total = (raw: string, asset: RevenueAsset) => formatUnits(raw, asset.decimals, Math.min(asset.decimals, TOTAL_DECIMALS));
/** The tile's one big figure is read at a glance, so it is rounded short (404,386.56, 0.0876); the streams under it carry the exact totals. */
const headline = (raw: string, asset: RevenueAsset) => formatAmount(raw, asset.decimals);

/**
 * The public revenue page: what the platform has collected in each asset, all time and per day, where it went (to
 * Creators as their share, and to the treasury), and the Ledger entry by entry. Every figure is a sum of Ledger entries, each one a transaction anyone can look up.
 */
export function RevenueDashboard({ revenue, ledger, platform }: { revenue: Revenue; ledger: LedgerPage; platform: PlatformInfo }) {
  const sol = (lamports: string) => formatUnits(lamports, SOL_DECIMALS);
  // A sweep moves everything above the float, not only revenue, so what was swept is shown apart from what was earned.
  const swept = revenue.totals.filter((t) => t.swept !== "0");
  const earns = creatorEarnings(platform);
  return (
    <article className={`shell ${styles.page}`}>
      <header className={styles.head}>
        <h1 className={`t-h1 ${styles.title}`}>Platform revenue</h1>
        <p className={styles.lede}>
          Every fee the platform collects, every payment of a Creator&apos;s share and every move to its treasury is a
          Solana transaction on the Ledger below. Anyone can check these totals against it.
        </p>
      </header>

      <div className={styles.layout}>
        <div className={styles.main}>
          <section className={styles.section} aria-labelledby="totals-title">
            <h2 id="totals-title" className="visually-hidden">All time</h2>
            {revenue.totals.length === 0 ? (
              <div className={`card card-raised ${styles.emptyCard}`}>
                <Ring size={72} className={styles.ring} />
                <p>
                  No revenue collected yet. The Fee Collector runs every hour, and each collection shows up here with its
                  transaction.
                </p>
              </div>
            ) : (
              <ul className={styles.totals}>
                {revenue.totals.map((t) => (
                  <li key={t.asset.mint} className={`card ${styles.asset}`}>
                    <p className={styles.assetName}>
                      <QuoteLogo quote={t.asset} size={24} />
                      <span className={styles.ticker}>{quoteTicker(t.asset)}</span>
                      {t.asset.name && <span className={styles.name}>{t.asset.name}</span>}
                    </p>
                    <p className={styles.amount}>
                      <span className="mono">{headline(t.total, t.asset)}</span>
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
                    {/* Creators are paid in Quote Assets only; a coin a Fee Key paid out has no such share. */}
                    {(t.creatorForwarded !== "0" || t.creatorPending !== "0") && (
                      <dl className={`${styles.streams} ${styles.creators}`}>
                        <div>
                          <dt>Sent to Creators</dt>
                          <dd className="mono">{total(t.creatorForwarded, t.asset)}</dd>
                        </div>
                        <div>
                          <dt>Still to be sent to Creators</dt>
                          <dd className="mono">{total(t.creatorPending, t.asset)}</dd>
                        </div>
                      </dl>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {revenue.days.length > 0 && (
            <section className={`card ${styles.card}`} aria-labelledby="days-title">
              <h2 id="days-title" className={`t-h3 ${styles.cardTitle}`}>By day</h2>
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
          <section className={`card ${styles.rule}`} aria-labelledby="streams-title">
            <h2 id="streams-title" className={`t-h3 ${styles.cardTitle}`}>Where revenue comes from</h2>
            <dl className={styles.explain}>
              <div>
                <dt>Curves</dt>
                <dd>The Platform Fee, {platform.platformFeeBps / 100}% of every trade on a coin&apos;s curve, claimed from LaunchLab&apos;s vault.</dd>
              </div>
              <div>
                <dt>Pools</dt>
                <dd>After graduation, the creator fee of every trade in the coin&apos;s Raydium pool, which the platform collects.</dd>
              </div>
              <div>
                <dt>Fee Keys</dt>
                <dd>The trading fees earned by each graduated pool&apos;s locked liquidity, in both of its tokens.</dd>
              </div>
            </dl>
          </section>

          <section className={`card ${styles.card}`} aria-labelledby="wallets-title">
            <h2 id="wallets-title" className={`t-h3 ${styles.cardTitle}`}>Where it goes</h2>
            <p className={styles.muted}>
              {earns.share}% of what the curves and pools bring in is the Creators&apos;, {earns.summary}. It is sent to each
              Creator&apos;s wallet within the hour of being collected and never goes to the treasury.
            </p>
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
