import Link from "next/link";
import type { CoinRewards, PlatformInfo } from "@launchpad/contract";
import { COIN_DECIMALS, formatUnits, formatUtc } from "@/lib/format";
import styles from "./RewardsCard.module.css";

/**
 * A Reward Launch's Holder Rewards: its Reward Tax, what is waiting for the next Reward Round, the rules that decide
 * who is paid, and every round so far, each public down to its payout transactions.
 */
export function RewardsCard({ rewards, symbol, platform }: { rewards: CoinRewards; symbol: string; platform: PlatformInfo }) {
  const coins = (raw: string) => formatUnits(raw, COIN_DECIMALS, 0);
  const rules = rewards.rules;
  void platform;
  return (
    <section className={styles.card} aria-labelledby="rewards-title">
      <div className={styles.head}>
        <h2 id="rewards-title" className={styles.title}>Holder rewards</h2>
        <span className={styles.rate}>{rewards.rewardTaxBps / 100}%</span>
      </div>
      <p className={styles.note}>
        Every transfer of {symbol} withholds {rewards.rewardTaxBps / 100}% for its holders. Each Reward Round collects it and pays it out in{" "}
        {symbol} itself, never sold, to every wallet holding at least the minimum.
      </p>
      <dl className={styles.facts}>
        <div>
          <dt>Waiting for the next round</dt>
          <dd><span className="mono">{coins(rewards.waiting.total)}</span> {symbol}</dd>
        </div>
        {rules && (
          <>
            <div>
              <dt>Minimum holding</dt>
              <dd><span className="mono">{coins(rules.minHolding)}</span> {symbol}</dd>
            </div>
            <div>
              <dt>Round runs from</dt>
              <dd><span className="mono">{coins(rules.roundThreshold)}</span> {symbol} collected</dd>
            </div>
          </>
        )}
      </dl>
      {rewards.rounds.length > 0 ? (
        <ul className={styles.rounds} aria-label="Reward Rounds">
          {rewards.rounds.map((r) => (
            <li key={r.id}>
              <span>
                <Link href={`/rewards/rounds/${r.id}`}>Round of {formatUtc(r.startedAt)}</Link>{" "}
                <span className={`${styles.status} ${r.status === "paid" ? styles.paid : ""}`}>
                  {r.status === "paid" ? "Paid" : "Paying"} · {r.eligibleHolders} {r.eligibleHolders === 1 ? "holder" : "holders"}
                </span>
              </span>
              <span className={`mono ${styles.amount}`}>{coins(r.status === "paid" ? r.paid : r.distributable)} {symbol}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className={styles.note}>No round yet: the first runs once enough tax has collected.</p>
      )}
      <p className={styles.note}>
        <Link href="/rewards">The rules, and where your rewards are</Link>
      </p>
    </section>
  );
}
