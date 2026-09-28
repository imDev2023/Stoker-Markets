import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getLaunch, getPlatform, getRewardRound } from "@/lib/api";
import { COIN_DECIMALS, explorerUrl, formatUnits, formatUtc, shortAddress } from "@/lib/format";
import styles from "../../page.module.css";

type Props = { params: Promise<{ id: string }> };

export const metadata: Metadata = { title: "Reward Round" };

export default async function RewardRoundPage({ params }: Props) {
  const { id } = await params;
  const round = await getRewardRound(id);
  if (!round) notFound();
  const [launch, platform] = await Promise.all([getLaunch(round.mint), getPlatform()]);
  const symbol = launch?.symbol ?? shortAddress(round.mint);
  const coins = (raw: string) => formatUnits(raw, COIN_DECIMALS, 2);
  return (
    <div className={`shell ${styles.page}`}>
      <h1 className={styles.title}>
        <Link href={`/coin/${round.mint}`}>{symbol}</Link> round of {formatUtc(round.startedAt)}
      </h1>
      <section className={styles.card} aria-labelledby="round-title">
        <h2 id="round-title" className={styles.cardTitle}>{round.status === "paid" ? "Paid in full" : "Paying out"}</h2>
        <dl className={styles.rules}>
          <div>
            <dt>Collected tax</dt>
            <dd><span className="mono">{coins(round.pot)}</span> {symbol}</dd>
          </div>
          <div>
            <dt>Eligible holders</dt>
            <dd>{round.eligibleHolders}</dd>
          </div>
          <div>
            <dt>Snapshot slot</dt>
            <dd><span className="mono">{round.snapshotSlot}</span></dd>
          </div>
          <div>
            <dt>Rules version</dt>
            <dd>{round.rulesVersion}</dd>
          </div>
          {round.finishedAt && (
            <div>
              <dt>Finished</dt>
              <dd>{formatUtc(round.finishedAt)}</dd>
            </div>
          )}
        </dl>
      </section>
      <section className={styles.card} aria-labelledby="payouts-title">
        <h2 id="payouts-title" className={styles.cardTitle}>Payouts</h2>
        <ul className={styles.list}>
          {round.payouts.map((p) => (
            <li key={p.wallet} className={p.status === "paid" ? "" : styles.pending}>
              <span>
                <Link href={`/rewards/${p.wallet}`} className="mono">{shortAddress(p.wallet)}</Link> held{" "}
                <span className="mono">{coins(p.holding)}</span>
                {p.status === "paid" && p.signature ? (
                  <>
                    {" "}·{" "}
                    <a href={explorerUrl("tx", p.signature, platform)} target="_blank" rel="noreferrer">paid</a>
                  </>
                ) : (
                  " · paying"
                )}
              </span>
              <span className={`mono ${styles.amount}`}>{coins(p.amount)} {symbol}</span>
            </li>
          ))}
        </ul>
      </section>
      <Link href="/rewards" className={styles.back}>Rules and lookup</Link>
    </div>
  );
}
