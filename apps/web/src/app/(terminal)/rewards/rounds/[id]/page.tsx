import type { Metadata } from "next";
import { pageMeta } from "@/lib/meta";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getLaunch, getPlatform, getRewardRound } from "@/lib/api";
import { COIN_DECIMALS, explorerUrl, formatUnits, formatUtc, shortAddress } from "@/lib/format";
import styles from "../../page.module.css";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  return pageMeta({ path: `/rewards/rounds/${id}`, title: "Reward Round", description: "One Reward Round: the Reward Launch it paid, its snapshot of holders, the pot and every payout." });
}

export default async function RewardRoundPage({ params }: Props) {
  const { id } = await params;
  const round = await getRewardRound(id);
  if (!round) notFound();
  const [launch, platform] = await Promise.all([getLaunch(round.mint), getPlatform()]);
  const symbol = launch?.symbol ?? shortAddress(round.mint);
  const coins = (raw: string) => formatUnits(raw, COIN_DECIMALS, 2);
  // Holdings are in the coin; the pot and every payout in the round's Payout Asset.
  const paid = (raw: string) => `${formatUnits(raw, round.payout.decimals, Math.min(round.payout.decimals, 4))} ${round.payout.symbol}`;
  return (
    <div className={`shell ${styles.page}`}>
      <h1 className={`t-h1 ${styles.title}`}>
        <Link href={`/coin/${round.mint}`}>{symbol}</Link> round of {formatUtc(round.startedAt)}
      </h1>
      <section className={`card ${styles.card}`} aria-labelledby="round-title">
        <h2 id="round-title" className={`t-h3 ${styles.cardTitle}`}>{round.status === "paid" ? "Paid in full" : "Paying out"}</h2>
        <dl className={styles.rules}>
          {/* The pot is the round's one key figure. */}
          {round.sold !== null ? (
            <>
              <div className={styles.key}>
                <dt>Pot</dt>
                <dd><span className="mono">{paid(round.pot)}</span></dd>
              </div>
              <div>
                <dt>Tax sold for it</dt>
                <dd><span className="mono">{coins(round.sold)}</span> {symbol}</dd>
              </div>
            </>
          ) : (
            <div className={styles.key}>
              <dt>Collected tax</dt>
              <dd><span className="mono">{coins(round.pot)}</span> {symbol}</dd>
            </div>
          )}
          <div>
            <dt>Paid in</dt>
            <dd>{round.payout.symbol}</dd>
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
      <section className={`card ${styles.card}`} aria-labelledby="payouts-title">
        <h2 id="payouts-title" className={`t-h3 ${styles.cardTitle}`}>Payouts</h2>
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
                ) : p.status === "returned" ? (
                  " · returned to the pot: too little SOL for an empty wallet to hold"
                ) : (
                  " · paying"
                )}
              </span>
              <span className={`mono ${styles.amount}`}>{paid(p.amount)}</span>
            </li>
          ))}
        </ul>
      </section>
      <Link href="/rewards" className={`button button-ghost ${styles.back}`}>Rules and lookup</Link>
    </div>
  );
}
