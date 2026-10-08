import type { Metadata } from "next";
import Link from "next/link";
import { REWARD_SALE_MAX_RESERVE_BPS, REWARD_SALE_SLIPPAGE_BPS, type RewardValue } from "@launchpad/contract";
import { getRewardRules, getRewardsOverview } from "@/lib/api";
import { formatMarketValue } from "@/lib/board";
import { COIN_DECIMALS, COIN_SUPPLY, formatUnits, formatUtc, timeAgo } from "@/lib/format";
import { PairMark } from "@/components/PairMark";
import { WalletLookup } from "@/components/WalletLookup";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "Holder rewards",
  description: "What Reward Rounds have paid holders across every Reward Launch, why the rewards favour the holder, the rules in force, and where any wallet's rewards are.",
};

/** A value at today's prices in the board's style ($1.2K, 0.42 SOL), or null where the Payout Asset has no price. */
function valueNow(v: RewardValue) {
  if (v.usd === null && v.sol === null) return null;
  return formatMarketValue({ quote: 0, sol: v.sol, usd: v.usd }, { mint: "", symbol: null });
}

const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;

/** A number of coins as a share of the fixed 1B supply, with as many decimals as it takes to show it (0.001%). */
function shareOfSupply(raw: string) {
  const pct = (Number(formatUnits(raw, COIN_DECIMALS, 0).replace(/,/g, "")) / COIN_SUPPLY) * 100;
  return `${pct.toLocaleString("en-US", { maximumSignificantDigits: 2 })}%`;
}

export default async function RewardsPage() {
  const [overview, rules] = await Promise.all([getRewardsOverview(), getRewardRules()]);
  const { totals } = overview;
  const now = Date.now();
  const coins = (raw: string) => formatUnits(raw, COIN_DECIMALS, 0);
  const inAsset = (raw: string, payout: { decimals: number; symbol: string }) => `${formatUnits(raw, payout.decimals, Math.min(payout.decimals, 4))} ${payout.symbol}`;
  const paidNow = valueNow({ sol: totals.paidSol, usd: totals.paidUsd });
  const inForce = rules.inForce;
  return (
    <div className={`shell ${styles.page}`}>
      <h1 className={styles.title}>Holder rewards</h1>
      <div className={styles.intro}>
        <p className={styles.lead}>
          Hold a Reward Launch&apos;s coin and a share of every transfer is yours. The coin withholds its Reward Tax, 1%, 3% or 5% chosen
          at launch, from every transfer wherever it happens: on this site, on any other exchange, or between two wallets. Reward Rounds
          collect it and pay it to holders pro rata in the Payout Asset the Creator fixed at launch: the coin itself, never sold, or the
          coin&apos;s Quote Asset, bought with the tax in small, published sales.
        </p>
        <p className={styles.lead}>
          The platform keeps none of the tax and pays the network fee of every payout. After Graduation it gives up the power to change
          the rate, so nobody can raise, lower or remove it. A round opens on its own once {inForce ? `${coins(inForce.roundThreshold)} coins of tax (${shareOfSupply(inForce.roundThreshold)} of the supply)` : "the threshold"} have
          collected, checked every ten minutes, and pays every wallet holding at least {inForce ? `${coins(inForce.minHolding)} coins (${shareOfSupply(inForce.minHolding)} of the supply)` : "the minimum"} at
          its snapshot. Where the Payout Asset is the Quote Asset, no sale takes more than {REWARD_SALE_MAX_RESERVE_BPS / 100}% of the coins in the market or
          moves the price by more than {REWARD_SALE_SLIPPAGE_BPS / 100}%, so paying holders never dumps the coin they hold. The rules are versioned and change
          only with a day&apos;s notice, and every round is public down to its snapshot slot, sales and payout transactions, so any wallet
          can check what it was paid below.
        </p>
      </div>

      <dl className={styles.tiles} aria-label="Across every Reward Launch">
        <div className={styles.tile}>
          <dt>Paid to holders</dt>
          <dd className={styles.figure}>{totals.payouts === 0 ? "Nothing yet" : (paidNow ?? "No price")}</dd>
          <dd className={styles.sub}>
            {totals.unpricedRounds > 0
              ? `At today's prices; ${plural(totals.unpricedRounds, "round")} paid in an asset without a price are not counted.`
              : "At today's prices, not the prices when each payout landed."}
          </dd>
        </div>
        <div className={styles.tile}>
          <dt>Payouts</dt>
          <dd className={styles.figure}>{totals.payouts.toLocaleString("en-US")}</dd>
          <dd className={styles.sub}>
            {totals.lastPaidAt ? (
              <>Across {plural(totals.rounds, "round")}. Last payout <time dateTime={totals.lastPaidAt}>{timeAgo(totals.lastPaidAt, now)}</time></>
            ) : (
              "A round opens once a coin's collected tax reaches the threshold below."
            )}
          </dd>
        </div>
        <div className={styles.tile}>
          <dt>Coins paying</dt>
          <dd className={styles.figure}>{totals.launchesPaid.toLocaleString("en-US")}</dd>
          <dd className={styles.sub}>Reward Launches whose rounds have paid at least one holder.</dd>
        </div>
        <div className={styles.tile}>
          <dt>Wallets paid</dt>
          <dd className={styles.figure}>{totals.walletsPaid.toLocaleString("en-US")}</dd>
          <dd className={styles.sub}>Counted once per coin, however many rounds paid them.</dd>
        </div>
      </dl>

      <section className={styles.card} aria-labelledby="lookup-title">
        <h2 id="lookup-title" className={styles.cardTitle}>Where are my rewards?</h2>
        <WalletLookup />
      </section>

      <div className={styles.columns}>
        <section className={styles.card} aria-labelledby="top-title">
          <div className={styles.cardHead}>
            <h2 id="top-title" className={styles.cardTitle}>Coins by what they paid</h2>
            <span className={styles.note}>Valued at today&apos;s prices</span>
          </div>
          {overview.top.length === 0 ? (
            <p className={styles.note}>No round has paid yet. The first coin to pay one is listed here.</p>
          ) : (
            <ol className={styles.rows} aria-label="Coins by what they paid">
              {overview.top.map((t, i) => (
                <li key={t.mint} className={styles.row}>
                  <span className={styles.rank} aria-hidden>{i + 1}</span>
                  {t.image ? <img className={styles.thumb} src={t.image} alt="" width={40} height={40} loading="lazy" /> : <span className={styles.thumb} aria-hidden />}
                  <span className={styles.rowMain}>
                    <Link href={`/coin/${t.mint}`} className={styles.rowLink}>
                      <PairMark base={t.symbol} quote={t.quote.symbol ?? "?"} size="sm" />
                    </Link>
                    <span className={styles.rowSub}>
                      {t.name} · {t.rewardTaxBps / 100}% tax paid in {t.payout.symbol} · {plural(t.walletsPaid, "wallet")} · {plural(t.rounds, "round")}
                      {t.marketCap && ` · market cap ${formatMarketValue(t.marketCap, t.quote)}`}
                    </span>
                  </span>
                  <span className={styles.rowAmount}>
                    <span className={styles.value}>{valueNow(t.value) ?? "No price"}</span>
                    <span className={`mono ${styles.raw}`}>{inAsset(t.paid, t.payout)}</span>
                  </span>
                </li>
              ))}
            </ol>
          )}
        </section>

        <section className={styles.card} aria-labelledby="recent-title">
          <div className={styles.cardHead}>
            <h2 id="recent-title" className={styles.cardTitle}>Latest rounds</h2>
            <span className={styles.note}>Newest first</span>
          </div>
          {overview.recent.length === 0 ? (
            <p className={styles.note}>No round yet. Each one is listed here with its snapshot and every payout transaction.</p>
          ) : (
            <ul className={styles.rows} aria-label="Latest rounds">
              {overview.recent.map((r) => (
                <li key={r.id} className={styles.row}>
                  {r.image ? <img className={styles.thumb} src={r.image} alt="" width={40} height={40} loading="lazy" /> : <span className={styles.thumb} aria-hidden />}
                  <span className={styles.rowMain}>
                    <Link href={`/rewards/rounds/${r.id}`} className={styles.rowLink}>
                      <PairMark base={r.symbol} quote={r.payout.asset === "coin" ? r.symbol : r.payout.symbol} size="sm" />
                    </Link>
                    <span className={styles.rowSub}>
                      {plural(r.eligibleHolders, "holder")} · {r.status === "paid" ? "paid" : "paying"}{" "}
                      <time dateTime={r.startedAt} title={formatUtc(r.startedAt)}>{timeAgo(r.startedAt, now)}</time>
                    </span>
                  </span>
                  <span className={styles.rowAmount}>
                    <span className={styles.value}>{valueNow(r.value) ?? "No price"}</span>
                    <span className={`mono ${styles.raw}`}>{inAsset(r.distributable, r.payout)}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className={styles.card} aria-labelledby="rules-title">
        <h2 id="rules-title" className={styles.cardTitle}>Rules in force</h2>
        {inForce ? (
          <dl className={styles.rules}>
            <div>
              <dt>Version</dt>
              <dd>{inForce.version}{inForce.note ? ` · ${inForce.note}` : ""}</dd>
            </div>
            <div>
              <dt>Minimum holding to be paid</dt>
              <dd><span className="mono">{coins(inForce.minHolding)}</span> coins, {shareOfSupply(inForce.minHolding)} of the supply</dd>
            </div>
            <div>
              <dt>A round runs once</dt>
              <dd><span className="mono">{coins(inForce.roundThreshold)}</span> coins of tax have collected, {shareOfSupply(inForce.roundThreshold)} of the supply</dd>
            </div>
            <div>
              <dt>In force since</dt>
              <dd><time dateTime={inForce.effectiveAt}>{formatUtc(inForce.effectiveAt)}</time></dd>
            </div>
          </dl>
        ) : (
          <p className={styles.note}>No rules are in force yet.</p>
        )}
        <p className={styles.note}>
          Each wallet&apos;s share is its holding over every eligible holding at the round&apos;s snapshot. The curve&apos;s and pool&apos;s own
          accounts and the platform&apos;s operations wallet never count as holders.
        </p>
        <p className={styles.note}>
          The platform&apos;s treasury does count. A pool pays part of its fees in the coin, those coins end up in the treasury, and
          it takes its share of a round like any other holder. Its address and everything it receives are on the{" "}
          <Link href="/revenue">revenue page</Link>.
        </p>
        <p className={styles.note}>
          Where a coin pays in its Quote Asset, the tax is sold into the coin&apos;s own market one slice per run, about every ten minutes:
          at most {REWARD_SALE_MAX_RESERVE_BPS / 100}% of the coins the market holds, with a {REWARD_SALE_SLIPPAGE_BPS / 100}% slippage limit, and a
          round opens once the coins sold reach the threshold. Each sale is on the coin&apos;s page with its transaction.
        </p>
      </section>

      {rules.upcoming.length > 0 && (
        <section className={styles.card} aria-labelledby="upcoming-title">
          <h2 id="upcoming-title" className={styles.cardTitle}>Announced changes</h2>
          <ul className={styles.list}>
            {rules.upcoming.map((r) => (
              <li key={r.version}>
                <span>
                  Version {r.version}{r.note ? `: ${r.note}` : ""}. Minimum holding <span className="mono">{coins(r.minHolding)}</span>, round from{" "}
                  <span className="mono">{coins(r.roundThreshold)}</span> collected.
                </span>
                <span>From <time dateTime={r.effectiveAt}>{formatUtc(r.effectiveAt)}</time></span>
              </li>
            ))}
          </ul>
          <p className={styles.note}>A change is announced at least a day before it applies, so it never surprises a holder.</p>
        </section>
      )}
    </div>
  );
}
