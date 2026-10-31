import type { Metadata } from "next";
import Link from "next/link";
import { REWARD_SALE_MAX_RESERVE_BPS, REWARD_SALE_SLIPPAGE_BPS } from "@launchpad/contract";
import { getRewardRules } from "@/lib/api";
import { COIN_DECIMALS, formatUnits, formatUtc } from "@/lib/format";
import { WalletLookup } from "@/components/WalletLookup";
import styles from "./page.module.css";
import { EmptyState } from "@/components/EmptyState";

export const metadata: Metadata = {
  title: "Holder rewards",
  description: "How Reward Rounds pay a Reward Launch's holders, the rules in force, and where any wallet's rewards are.",
};

export default async function RewardsPage() {
  const rules = await getRewardRules();
  const coins = (raw: string) => formatUnits(raw, COIN_DECIMALS, 0);
  return (
    <div className={`shell ${styles.page}`}>
      <h1 className={`t-h1 ${styles.title}`}>Holder rewards</h1>
      <p className={styles.lead}>
        A Reward Launch&apos;s coin withholds its Reward Tax on every transfer. Reward Rounds collect it and pay it to holders pro rata
        in the asset its Creator fixed at launch: the coin itself, never sold, or the coin&apos;s Quote Asset, bought with the tax in
        small, published sales. Every round&apos;s snapshot, rules, sales and payout transactions are public.
      </p>

      <section className={`card ${styles.card}`} aria-labelledby="lookup-title">
        <h2 id="lookup-title" className={`t-h3 ${styles.cardTitle}`}>Where are my rewards?</h2>
        <WalletLookup />
      </section>

      <section className={`card ${styles.card}`} aria-labelledby="rules-title">
        <h2 id="rules-title" className={`t-h3 ${styles.cardTitle}`}>Rules in force</h2>
        {rules.inForce ? (
          <dl className={styles.rules}>
            <div>
              <dt>Version</dt>
              <dd>{rules.inForce.version}{rules.inForce.note ? ` · ${rules.inForce.note}` : ""}</dd>
            </div>
            <div>
              <dt>Minimum holding to be paid</dt>
              <dd><span className="mono">{coins(rules.inForce.minHolding)}</span> coins</dd>
            </div>
            <div>
              <dt>A round runs once</dt>
              <dd><span className="mono">{coins(rules.inForce.roundThreshold)}</span> coins of tax have collected</dd>
            </div>
            <div>
              <dt>In force since</dt>
              <dd><time dateTime={rules.inForce.effectiveAt}>{formatUtc(rules.inForce.effectiveAt)}</time></dd>
            </div>
          </dl>
        ) : (
          <EmptyState bare title="The rules are set before the first Reward Launch">No rules are in force yet. They are announced here ahead of the first round.</EmptyState>
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
        <section className={`card ${styles.card}`} aria-labelledby="upcoming-title">
          <h2 id="upcoming-title" className={`t-h3 ${styles.cardTitle}`}>Announced changes</h2>
          <ul className={styles.list}>
            {rules.upcoming.map((r) => (
              <li key={r.version}>
                <span>
                  Version {r.version}{r.note ? `: ${r.note}` : ""}. Minimum holding <span className="mono">{coins(r.minHolding)}</span>, round from{" "}
                  <span className="mono">{coins(r.roundThreshold)}</span> collected.
                </span>
                <span className={styles.when}>From <time dateTime={r.effectiveAt}>{formatUtc(r.effectiveAt)}</time></span>
              </li>
            ))}
          </ul>
          <p className={styles.note}>A change is announced at least a day before it applies, so it never surprises a holder.</p>
        </section>
      )}
    </div>
  );
}
