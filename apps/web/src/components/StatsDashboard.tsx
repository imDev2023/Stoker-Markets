import { Fragment } from "react";
import Link from "next/link";
import type { BurnsPage, HolderList, LaunchSummary, LedgerPage, PlatformInfo, QuoteAsset, Revenue, RevenueAsset } from "@launchpad/contract";
import { explorerUrl, formatAmount, formatPriceCompact, formatUnits, formatUtc, formatUtcDay, quoteTicker, shortAddress, SOL_DECIMALS } from "@/lib/format";
import { formatSol } from "@/lib/landing";
import { annualizedRevenue, AVERAGE_DAYS, cumulativeBurns, dailyBurns, dayRevenueSol, platformTokenBurns, solUsd } from "@/lib/stats";
import { BuybackCalculator } from "./BuybackCalculator";
import { BuybackChart } from "./BuybackChart";
import { CopyButton } from "./CopyButton";
import { LedgerList } from "./LedgerList";
import { Ring } from "./Mark";
import { QuoteLogo } from "./QuoteLogo";
import styles from "./StatsDashboard.module.css";

/** Totals show up to six decimals; the Ledger shows every one. */
const TOTAL_DECIMALS = 6;
const total = (raw: string, asset: RevenueAsset) => formatUnits(raw, asset.decimals, Math.min(asset.decimals, TOTAL_DECIMALS));
const headline = (raw: string, asset: RevenueAsset) => formatAmount(raw, asset.decimals);
const sol = (lamports: string | bigint) => formatUnits(lamports.toString(), SOL_DECIMALS, 4);
const usd = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: n < 100 ? 2 : 0 });
const compact = (n: number) => n.toLocaleString("en-US", { notation: "compact", maximumSignificantDigits: 3 });

export type StatsData = {
  platform: PlatformInfo;
  quotes: QuoteAsset[];
  revenue: Revenue | null;
  burns: BurnsPage | null;
  ledger: LedgerPage | null;
  /** The Platform Token's own market, once it exists and the reads answered. */
  token: { launch: LaunchSummary; holders: HolderList | null } | null;
};

/** Nothing to show yet: the ring at size and one line, the terminal's empty state. */
function Empty({ children, id }: { children: React.ReactNode; id?: string }) {
  return (
    <div className={`card card-raised ${styles.emptyCard}`} id={id}>
      <Ring size={72} className={styles.ring} />
      <p>{children}</p>
    </div>
  );
}

/**
 * The Stats page (owner, 2026-10-30, after the shape of pump.fun's coin page, in our words and from our data): the
 * figures first (revenue annualized, what the Burn has bought back and burned, its share), the buybacks over time and by
 * day, the calculator, every burn on-chain, the Platform Token's market once it exists, then the platform's books: what
 * each asset brought in, where it went, and the Ledger entry by entry. Every figure is live from the API; a read that
 * is down leaves its figure out rather than failing the page.
 */
export function StatsDashboard({ platform, quotes, revenue, burns, ledger, token }: StatsData) {
  const annual = revenue ? annualizedRevenue(revenue, quotes) : null;
  const solPrice = solUsd(quotes);
  const burned = burns ? platformTokenBurns(burns) : null;
  const symbol = burned?.coin?.symbol ?? token?.launch.symbol ?? "STOKER";
  const cumulative = burned ? cumulativeBurns(burned.events).map((p) => ({ day: p.time, sol: p.sol })) : [];
  const daily = burned ? dailyBurns(burned.events).map((d) => ({ day: d.day, sol: Number(d.lamports) / 1e9 })) : [];
  const marketCapSol = token?.launch.market.marketCap?.sol ?? null;
  const swept = revenue?.totals.filter((t) => t.swept !== "0") ?? [];

  return (
    <article className={`shell ${styles.page}`}>
      <header className={styles.head}>
        <p className="eyebrow">Stats</p>
        <h1 className={`t-h1 ${styles.title}`}>{symbol}</h1>
        <p className={styles.lede}>
          The platform&apos;s coin and the revenue behind it. Every fee the platform collects, every payment of a Creator&apos;s share, every buy
          and burn and every move to the treasury is a Solana transaction on the Ledger below, and every figure here is a sum of its entries.
        </p>
      </header>

      <section className={styles.tiles} aria-label="Key figures">
        <dl className={styles.tileList}>
          <div className={`card card-raised ${styles.tile}`}>
            <dt>Revenue, annualized</dt>
            {annual ? (
              <>
                <dd className={`t-figure-xl ${styles.value}`}>{formatSol(annual.sol)}</dd>
                <dd className={styles.sub}>
                  {solPrice ? `${usd(annual.sol * solPrice)} at today's SOL price. ` : ""}
                  The daily average since <time dateTime={annual.since}>{formatUtcDay(annual.since)}</time>
                  {annual.days >= AVERAGE_DAYS ? ` (${AVERAGE_DAYS} days)` : ` (${annual.days} ${annual.days === 1 ? "day" : "days"})`} times 365, collected before the Creators&apos; half.
                </dd>
              </>
            ) : (
              <dd className={styles.sub}>{revenue ? "Nothing collected yet." : "Not available right now."}</dd>
            )}
          </div>
          <div className={`card card-raised ${styles.tile}`}>
            <dt>{symbol} bought back and burned</dt>
            {burned ? (
              <>
                <dd className={`t-figure-xl ${styles.value} heat-text`}>{burned.coin ? compact(Number(burned.amount) / 10 ** burned.coin.decimals) : "0"}</dd>
                <dd className={styles.sub}>Destroyed for good, over {burned.events.length} {burned.events.length === 1 ? "burn" : "burns"}.</dd>
              </>
            ) : (
              <dd className={styles.sub}>Not available right now.</dd>
            )}
          </div>
          <div className={`card card-raised ${styles.tile}`}>
            <dt>Spent on buybacks</dt>
            {burned ? (
              <>
                <dd className={`t-figure-xl ${styles.value}`}>{formatSol(Number(burned.lamports) / 1e9)}</dd>
                <dd className={styles.sub}>{solPrice ? `${usd((Number(burned.lamports) / 1e9) * solPrice)} at today's SOL price; ` : ""}<span className="mono">{sol(burns!.budgets.burn.available)}</span> SOL waiting for the next run.</dd>
              </>
            ) : (
              <dd className={styles.sub}>Not available right now.</dd>
            )}
          </div>
          <div className={`card card-raised ${styles.tile}`}>
            <dt>Of revenue to the Burn</dt>
            {burns ? (
              <>
                <dd className={`t-figure-xl ${styles.value}`}>{burns.shares.burnBps / 100}%</dd>
                <dd className={styles.sub}>Of the platform&apos;s own revenue, net of the Creators&apos; half; {burns.shares.flywheelBps / 100}% more buys and burns the top {burns.shares.flywheelTopN} graduated coins.</dd>
              </>
            ) : (
              <dd className={styles.sub}>Not available right now.</dd>
            )}
          </div>
        </dl>
      </section>

      <div className={`grid ${styles.charts}`}>
        <section className={`card col-6 ${styles.card}`} aria-labelledby="cumulative-title">
          <h2 id="cumulative-title" className={`t-h3 ${styles.cardTitle}`}>Buybacks over time</h2>
          <p className={styles.muted}>SOL spent on {symbol}, every burn added to the ones before it.</p>
          <BuybackChart points={cumulative} kind="cumulative" label={`SOL spent on ${symbol} buybacks over time`} />
        </section>
        <section className={`card col-6 ${styles.card}`} aria-labelledby="daily-title">
          <h2 id="daily-title" className={`t-h3 ${styles.cardTitle}`}>Daily buyback and burn</h2>
          <p className={styles.muted}>SOL spent on {symbol} each day the Burn ran.</p>
          <BuybackChart points={daily} kind="daily" label={`SOL spent on ${symbol} buybacks by day`} />
        </section>
      </div>

      <section className={`card ${styles.card}`} aria-labelledby="calc-title">
        <h2 id="calc-title" className={`t-h3 ${styles.cardTitle}`}>Run the numbers</h2>
        <BuybackCalculator annualSol={annual?.sol ?? null} marketCapSol={marketCapSol} burnShareBps={burns?.shares.burnBps ?? platformBurnShare(burns)} symbol={symbol} />
      </section>

      <section className={`card ${styles.card}`} aria-labelledby="burns-title">
        <h2 id="burns-title" className={`t-h3 ${styles.cardTitle}`}>Every burn on-chain</h2>
        {!burned ? (
          <p className={styles.muted}>Not available right now.</p>
        ) : burned.events.length === 0 ? (
          <p className={styles.muted}>
            No burn yet. {burns!.platformToken ? "The Burn runs on its schedule once its budget covers a buy." : `It starts once ${symbol} has launched and graduated.`}{" "}
            The Flywheel&apos;s burns of other coins are under <Link href="/burns">Burns</Link>.
          </p>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">Date (UTC)</th>
                <th scope="col" className={styles.num}>{symbol} burned</th>
                <th scope="col" className={styles.num}>SOL spent</th>
                <th scope="col" className={`${styles.num} ${styles.wide}`}>USD today</th>
                <th scope="col" className={`${styles.num} ${styles.wide}`}>Price paid</th>
                <th scope="col" className={styles.num}>Of that day&apos;s revenue</th>
                <th scope="col" className={styles.wide}>Transaction</th>
              </tr>
            </thead>
            <tbody>
              {burned.events.map((e) => {
                const spent = Number(e.lamports) / 1e9;
                const coins = Number(e.amount) / 10 ** e.coin.decimals;
                const day = revenue ? dayRevenueSol(revenue, quotes, e.time) : null;
                return (
                  <tr key={e.signature}>
                    <td><time dateTime={e.time}>{formatUtc(e.time)}</time></td>
                    <td className={`mono ${styles.num}`}>{formatUnits(e.amount, e.coin.decimals, 0)}</td>
                    <td className={`mono ${styles.num}`}>{sol(e.lamports)}</td>
                    <td className={`mono ${styles.num} ${styles.wide}`}>{solPrice ? usd(spent * solPrice) : "-"}</td>
                    <td className={`mono ${styles.num} ${styles.wide}`}>{coins > 0 ? `${formatPriceCompact(spent / coins)} SOL` : "-"}</td>
                    <td className={`mono ${styles.num}`}>{day && day > 0 ? `${((spent / day) * 100).toLocaleString("en-US", { maximumFractionDigits: 1 })}%` : "-"}</td>
                    <td className={styles.wide}>
                      <a className="mono" href={explorerUrl("tx", e.signature, platform)} target="_blank" rel="noreferrer">{shortAddress(e.signature)}</a>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      <section className={styles.section} aria-labelledby="market-title">
        <h2 id="market-title" className={`t-h3 ${styles.cardTitle}`}>{symbol} market</h2>
        {token ? (
          <dl className={styles.market}>
            <div className={`card ${styles.marketTile}`}>
              <dt>Price</dt>
              <dd><span className="mono">{token.launch.market.price === null ? "-" : formatPriceCompact(token.launch.market.price)}</span> {quoteTicker(token.launch.quote)}</dd>
            </div>
            <div className={`card ${styles.marketTile}`}>
              <dt>Market cap</dt>
              <dd>
                <span className="mono">{token.launch.market.marketCap ? compact(token.launch.market.marketCap.quote) : "-"}</span> {quoteTicker(token.launch.quote)}
                {token.launch.market.marketCap?.usd != null && <span className={styles.sub}>{usd(token.launch.market.marketCap.usd)}</span>}
              </dd>
            </div>
            <div className={`card ${styles.marketTile}`}>
              <dt>Volume, 24 hours</dt>
              <dd>
                <span className="mono">{compact(token.launch.market.volume24h.quote)}</span> {quoteTicker(token.launch.quote)}
                {token.launch.market.volume24h.usd != null && <span className={styles.sub}>{usd(token.launch.market.volume24h.usd)}</span>}
              </dd>
            </div>
            <div className={`card ${styles.marketTile}`}>
              <dt>Supply after burns</dt>
              <dd>
                <span className="mono">{token.holders ? compact(Number(token.holders.supply) / 10 ** 6) : "-"}</span> {symbol}
                {burned && burned.coin && <span className={styles.sub}>{compact(Number(burned.amount) / 10 ** burned.coin.decimals)} burned of 1B</span>}
              </dd>
            </div>
            <div className={`card ${styles.marketTile}`}>
              <dt>Largest holders</dt>
              <dd>
                <span className="mono">{token.holders ? token.holders.holders.filter((h) => h.kind === "holder").length : "-"}</span> wallets among the top 20 accounts
                <Link href={`/coin/${token.launch.mint}`} className={styles.sub}>The coin&apos;s page</Link>
              </dd>
            </div>
          </dl>
        ) : (
          <Empty>{symbol} has not launched yet. It launches as the first coin on this platform, fair, with no presale and no team allocation; its market shows here from its first trade.</Empty>
        )}
      </section>

      <section className={styles.section} aria-labelledby="totals-title">
        <h2 id="totals-title" className={`t-h3 ${styles.cardTitle}`}>Revenue by asset</h2>
        {!revenue ? (
          <p className={styles.muted}>Not available right now.</p>
        ) : revenue.totals.length === 0 ? (
          <Empty>No revenue collected yet. The Fee Collector runs every hour, and each collection shows up here with its transaction.</Empty>
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
                  <div><dt>Curves</dt><dd className="mono">{total(t.platformFee, t.asset)}</dd></div>
                  <div><dt>Pools</dt><dd className="mono">{total(t.poolFee, t.asset)}</dd></div>
                  <div><dt>Fee Keys</dt><dd className="mono">{total(t.feeKey, t.asset)}</dd></div>
                </dl>
                {(t.creatorForwarded !== "0" || t.creatorPending !== "0" || t.graduationFee !== "0") && (
                  <dl className={`${styles.streams} ${styles.creators}`}>
                    <div><dt>Sent to Creators</dt><dd className="mono">{total(t.creatorForwarded, t.asset)}</dd></div>
                    <div><dt>Still to be sent to Creators</dt><dd className="mono">{total(t.creatorPending, t.asset)}</dd></div>
                    {t.graduationFee !== "0" && <div><dt>Kept as Graduation Fees</dt><dd className="mono">{total(t.graduationFee, t.asset)}</dd></div>}
                  </dl>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className={styles.layout}>
        <div className={styles.main}>
          {revenue && revenue.days.length > 0 && (
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
          {ledger && ledger.entries.length > 0 && <LedgerList initial={ledger} platform={platform} />}
        </div>

        <aside className={styles.side}>
          <section className={`card ${styles.rule}`} aria-labelledby="streams-title">
            <h2 id="streams-title" className={`t-h3 ${styles.cardTitle}`}>Where revenue comes from</h2>
            <dl className={styles.explain}>
              <div><dt>Curves</dt><dd>The Platform Fee of every trade on a coin&apos;s curve, claimed from LaunchLab&apos;s vault.</dd></div>
              <div><dt>Pools</dt><dd>After graduation, the creator fee of every trade in the coin&apos;s Raydium pool, which the platform collects as the pool&apos;s creator.</dd></div>
              <div><dt>Fee Keys</dt><dd>The trading fees earned by each graduated pool&apos;s locked liquidity, in both of its tokens.</dd></div>
              <div><dt>Graduation Fees</dt><dd>What the platform keeps of a Creator&apos;s share once their coin graduates, recorded against the graduation.</dd></div>
            </dl>
            <p className={styles.muted}>Every rate is on the <Link href="/fees">Fees page</Link>, read from the chain.</p>
          </section>

          <section className={`card ${styles.card}`} aria-labelledby="wallets-title">
            <h2 id="wallets-title" className={`t-h3 ${styles.cardTitle}`}>Where it goes</h2>
            <p className={styles.muted}>
              Half of what the curves and pools bring in is the Creators&apos;, sent to each Creator&apos;s wallet within the hour of being collected;
              it never goes to the treasury.
            </p>
            {revenue && (
              <dl className={styles.wallets}>
                <div>
                  <dt>Operations wallet</dt>
                  <dd>
                    <a className="mono" href={explorerUrl("address", revenue.operationsWallet, platform)} target="_blank" rel="noreferrer">{shortAddress(revenue.operationsWallet)}</a>
                    <CopyButton value={revenue.operationsWallet} label="Copy operations wallet address" />
                  </dd>
                </div>
                <div>
                  <dt>Treasury</dt>
                  <dd>
                    {revenue.treasury ? (
                      <>
                        <a className="mono" href={explorerUrl("address", revenue.treasury, platform)} target="_blank" rel="noreferrer">{shortAddress(revenue.treasury)}</a>
                        <CopyButton value={revenue.treasury} label="Copy treasury address" />
                      </>
                    ) : (
                      <span className={styles.muted}>Not set up yet</span>
                    )}
                  </dd>
                </div>
              </dl>
            )}
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
            {revenue && (
              <p className={styles.muted}>
                Fees are collected into the operations wallet every hour. Once it holds more than {sol(revenue.sweepThresholdLamports)} SOL, everything
                above {sol(revenue.sweepFloatLamports)} SOL moves on to the treasury, and every other token moves on whole, so the hot wallet never holds much.
              </p>
            )}
            <p className={styles.muted}>
              The Burn and the Flywheel, every buy and burn of every coin, are under <Link href="/burns">Burns</Link>.
            </p>
          </section>
        </aside>
      </div>
    </article>
  );
}

/** The Burn's share when the burns read is down: nothing to compute with, so the calculator shows no yield. */
function platformBurnShare(burns: BurnsPage | null) {
  return burns?.shares.burnBps ?? 0;
}
