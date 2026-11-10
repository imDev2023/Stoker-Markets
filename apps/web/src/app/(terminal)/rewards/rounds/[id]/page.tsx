import type { Metadata } from "next";
import { pageMeta } from "@/lib/meta";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getLaunch, getPlatform, getRewardRound } from "@/lib/api";
import { COIN_DECIMALS, explorerUrl, formatUnits, formatUtc, shortAddress } from "@/lib/format";
import styles from "../../page.module.css";
import { Address } from "@/components/Address";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  return pageMeta({ path: `/rewards/rounds/${id}`, title: "Reward Round", description: "One Reward Round: the coin whose holders it paid, its snapshot of them, the pot and every payout." });
}

/**
 * One Reward Round, of either source (ADR 0011): a Reward Launch's collected Reward Tax, in the coin or in its Quote
 * Asset, or the Creator's earnings on a coin whose Creator pointed them at its holders, always in the Quote Asset. The
 * snapshot, the rules and the payouts read the same; the pot says where it came from.
 */
export default async function RewardRoundPage({ params }: Props) {
  const { id } = await params;
  const round = await getRewardRound(id);
  if (!round) notFound();
  const [launch, platform] = await Promise.all([getLaunch(round.mint), getPlatform()]);
  const symbol = launch?.symbol ?? shortAddress(round.mint);
  const coins = (raw: string) => formatUnits(raw, COIN_DECIMALS, 2);
  // Holdings are in the coin; the pot and every payout in the round's Payout Asset.
  const amount = (raw: string) => formatUnits(raw, round.payout.decimals, Math.min(round.payout.decimals, 4));
  const paid = (raw: string) => `${amount(raw)} ${round.payout.symbol}`;
  return (
    <div className={`shell ${styles.page}`}>
      <h1 className={`t-h1 ${styles.title}`}>
        <Link href={`/coin/${round.mint}`}>{symbol}</Link> round of <time dateTime={round.startedAt}>{formatUtc(round.startedAt)}</time>
      </h1>
      {round.source === "earnings" && (
        <p className={styles.lead}>
          The Creator of {symbol} pointed their earnings on it at its holders when they launched it. This round pays what the platform
          had collected for the Creator to every eligible holder, in {round.payout.symbol}.
        </p>
      )}
      <section className={`card ${styles.card}`} aria-labelledby="round-title">
        <h2 id="round-title" className={`t-h3 ${styles.cardTitle}`}>{round.status === "paid" ? "Paid in full" : "Paying out"}</h2>
        <dl className={styles.rules}>
          {/* The pot is the round's one key figure. */}
          {round.source === "earnings" ? (
            <div className={styles.key}>
              <dt>Creator&apos;s earnings</dt>
              {/* The unit beside the figure, never inside it: at the figure's size a ticker wrapped onto a line of its own. */}
              <dd><span className="mono">{amount(round.pot)}</span> {round.payout.symbol}</dd>
            </div>
          ) : round.sold !== null ? (
            <>
              <div className={styles.key}>
                <dt>Pot</dt>
                <dd><span className="mono">{amount(round.pot)}</span> {round.payout.symbol}</dd>
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
              <dd><time dateTime={round.finishedAt}>{formatUtc(round.finishedAt)}</time></dd>
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
                <Address value={p.wallet} href={`/rewards/${p.wallet}`} /> held{" "}
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
