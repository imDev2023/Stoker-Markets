import Link from "next/link";
import type { CoinRewards, PlatformInfo } from "@launchpad/contract";
import { COIN_DECIMALS, explorerUrl, formatUnits, formatUtc } from "@/lib/format";
import styles from "./RewardsCard.module.css";

/**
 * A Reward Launch's Holder Rewards: its Reward Tax, what is waiting for the next Reward Round, the rules that decide
 * who is paid, and every round so far, each public down to its payout transactions. A coin that pays in its Quote
 * Asset also shows its Reward Sales: the bounds they keep to, what has been sold and for how much, and each sale.
 */
export function RewardsCard({ rewards, symbol, platform }: { rewards: CoinRewards; symbol: string; platform: PlatformInfo }) {
  const coins = (raw: string) => formatUnits(raw, COIN_DECIMALS, 0);
  const { payout, sales } = rewards;
  const paid = (raw: string) => `${formatUnits(raw, payout.decimals, Math.min(payout.decimals, 4))} ${payout.symbol}`;
  const rules = rewards.rules;
  const rate = rewards.rewardTaxBps / 100;
  return (
    <section className={styles.card} aria-labelledby="rewards-title">
      <div className={styles.head}>
        <h2 id="rewards-title" className={styles.title}>Holder rewards</h2>
        <span className={styles.rate}>{rate}%</span>
      </div>
      <p className={styles.note}>
        {sales ? (
          <>
            Every transfer of {symbol} withholds {rate}% for its holders. The tax is sold for {payout.symbol} in small slices, at most{" "}
            {sales.maxReserveBps / 100}% of the coins in the market per run and about once every ten minutes, each sale with a{" "}
            {sales.slippageBps / 100}% slippage limit. Each Reward Round pays what the sales brought in to every wallet holding at least the
            minimum, in {payout.symbol}.
          </>
        ) : (
          <>
            Every transfer of {symbol} withholds {rate}% for its holders. Each Reward Round collects it and pays it out in {symbol} itself,
            never sold, to every wallet holding at least the minimum.
          </>
        )}
      </p>
      <dl className={styles.facts}>
        {sales ? (
          <>
            <div>
              <dt>Waiting to be sold</dt>
              <dd><span className="mono">{coins(rewards.waiting.total)}</span> {symbol}</dd>
            </div>
            <div>
              <dt>Pot for the next round</dt>
              <dd><span className="mono">{paid(rewards.waiting.pot)}</span></dd>
            </div>
            <div>
              <dt>Sold so far</dt>
              <dd>
                <span className="mono">{coins(sales.sold)}</span> {symbol} for <span className="mono">{paid(sales.proceeds)}</span>
              </dd>
            </div>
          </>
        ) : (
          <div>
            <dt>Waiting for the next round</dt>
            <dd><span className="mono">{coins(rewards.waiting.total)}</span> {symbol}</dd>
          </div>
        )}
        {rules && (
          <>
            <div>
              <dt>Minimum holding</dt>
              <dd><span className="mono">{coins(rules.minHolding)}</span> {symbol}</dd>
            </div>
            <div>
              <dt>Round runs from</dt>
              <dd><span className="mono">{coins(rules.roundThreshold)}</span> {symbol} {sales ? "sold" : "collected"}</dd>
            </div>
          </>
        )}
      </dl>
      {rewards.rounds.length > 0 ? (
        <ul className={styles.rounds} aria-label="Reward Rounds">
          {rewards.rounds.map((r) => (
            <li key={r.id}>
              <span>
                <Link href={`/rewards/rounds/${r.id}`}>Round of <time dateTime={r.startedAt}>{formatUtc(r.startedAt)}</time></Link>{" "}
                <span className={`${styles.status} ${r.status === "paid" ? styles.paid : ""}`}>
                  {r.status === "paid" ? "Paid" : "Paying"} · {r.eligibleHolders} {r.eligibleHolders === 1 ? "holder" : "holders"}
                </span>
              </span>
              <span className={`mono ${styles.amount}`}>
                {formatUnits(r.status === "paid" ? r.paid : r.distributable, r.payout.decimals, Math.min(r.payout.decimals, 4))} {r.payout.symbol}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className={styles.note}>{sales ? "No round yet: the first runs once enough tax has been sold." : "No round yet: the first runs once enough tax has collected."}</p>
      )}
      {sales && sales.recent.length > 0 && (
        <ul className={styles.rounds} aria-label="Reward Sales">
          {sales.recent.map((s) => (
            <li key={s.signature}>
              <span>
                <a href={explorerUrl("tx", s.signature, platform)} target="_blank" rel="noreferrer">
                  Sold <span className="mono">{coins(s.coins)}</span> {symbol} {s.venue === "curve" ? "on the curve" : "in the pool"}
                </a>{" "}
                <time dateTime={s.time}>{formatUtc(s.time)}</time>
              </span>
              <span className={`mono ${styles.amount}`}>{s.proceeds === null ? "Landing…" : paid(s.proceeds)}</span>
            </li>
          ))}
        </ul>
      )}
      <p className={styles.note}>
        <Link href="/rewards">The rules, and where your rewards are</Link>
      </p>
    </section>
  );
}
