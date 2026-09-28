import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getPlatform, getWalletRewards } from "@/lib/api";
import { explorerUrl, formatUnits, formatUtc, shortAddress } from "@/lib/format";
import styles from "../page.module.css";

type Props = { params: Promise<{ wallet: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return { title: `Rewards of ${shortAddress((await params).wallet)}` };
}

export default async function WalletRewardsPage({ params }: Props) {
  const { wallet } = await params;
  const [rewards, platform] = await Promise.all([getWalletRewards(wallet), getPlatform()]);
  if (!rewards) notFound();
  return (
    <div className={`shell ${styles.page}`}>
      <h1 className={styles.title}>Rewards of <span className="mono">{shortAddress(rewards.wallet)}</span></h1>
      <p className={styles.lead}>
        Every Holder Reward this wallet was paid, or is owed by a round still paying out, across every Reward Launch.{" "}
        <a href={explorerUrl("address", rewards.wallet, platform)} target="_blank" rel="noreferrer">See the wallet on the explorer</a>.
      </p>
      <section className={styles.card} aria-labelledby="rewards-list-title">
        <h2 id="rewards-list-title" className={styles.cardTitle}>Rewards</h2>
        {rewards.rewards.length === 0 ? (
          <p className={styles.note}>
            No rewards for this wallet yet. A wallet is paid when it holds at least the minimum of a Reward Launch&apos;s coin at a round&apos;s snapshot.
          </p>
        ) : (
          <ul className={styles.list}>
            {rewards.rewards.map((r) => (
              <li key={`${r.round}-${r.mint}`} className={r.status === "paid" ? "" : styles.pending}>
                <span>
                  <Link href={`/coin/${r.mint}`}>{r.symbol}</Link> · <Link href={`/rewards/rounds/${r.round}`}>round of {formatUtc(r.roundStartedAt)}</Link>
                  {r.status === "paid" && r.signature ? (
                    <>
                      {" "}·{" "}
                      <a href={explorerUrl("tx", r.signature, platform)} target="_blank" rel="noreferrer">paid</a>
                    </>
                  ) : (
                    " · paying"
                  )}
                </span>
                <span className={`mono ${styles.amount}`}>{formatUnits(r.amount, r.decimals, 2)} {r.symbol}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
      <Link href="/rewards" className={styles.back}>Rules and lookup</Link>
    </div>
  );
}
