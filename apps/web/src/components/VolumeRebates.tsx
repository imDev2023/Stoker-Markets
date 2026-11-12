import Link from "next/link";
import type { RebatesPage } from "@launchpad/contract";
import { formatUtc } from "@/lib/format";
import { isUtcWeek, rebateSol, weekName, weekSpan } from "@/lib/rebates";
import styles from "@/app/(terminal)/rewards/page.module.css";
import { EmptyState, ErrorState } from "./EmptyState";
import { YourRebates } from "./YourRebates";

/**
 * Volume rebates on the Rewards page (#196, ADR 0021): what a Volume Rebate is, in words, where the program stands,
 * the connected wallet's own rebates and every settled Rebate Week, from `GET /v1/rebates`. No share or rate is shown
 * here: a fee figure is the Fees page's alone (owner, 2026-10-30), so this says what the Budget Table's row does and
 * links there.
 *
 * The program is in one of four states. Before its first share is announced there is one plain card, and neither the
 * wallet's panel nor the weeks, which would have nothing behind them. Announced: the date trades begin to earn.
 * Running: the week being traded, its pot an estimate. Not running after weeks were settled: what was given is still
 * paid, and the weeks stay listed. `rebates` is null when the API could not be read, which the section says in place
 * of its panels while the rest of the page stands.
 */
export function VolumeRebates({ rebates, explorer }: { rebates: RebatesPage | null; explorer: { cluster: string; rpcUrl: string } }) {
  const program = rebates?.program;
  const weeks = rebates?.weeks ?? [];
  const current = program?.current ?? null;
  const upcoming = program?.upcoming ?? null;
  // Whether the program has ever given anything: a week on record, or a rebate paid or waiting.
  const begun = weeks.length > 0 || (program !== undefined && (program.paidLamports !== "0" || program.waitingLamports !== "0"));
  const state = current ? "running" : upcoming ? "announced" : begun ? "stopped" : "idle";
  const ending = upcoming !== null && upcoming.shareBps === 0;

  return (
    <section id="volume-rebates" className={styles.program} aria-labelledby="rebates-title">
      <h2 id="rebates-title" className={`t-h2 ${styles.programTitle}`}>Volume rebates</h2>
      <p className={styles.lead}>
        A Volume Rebate gives a trader back part of the Platform Fees their trades paid. A share of what the platform keeps is set
        aside for it in the Budget Table, and once a Rebate Week{program && isUtcWeek(program.weekSeconds) ? " (a UTC week, Monday to Monday)" : ""} has
        ended, what was set aside is split among that week&apos;s traders in proportion to the fees their trades paid. Every trade counts,
        on a curve or in a pool, a buy or a sell.
      </p>
      <p className={styles.lead}>
        A wallet&apos;s rebates are sent to it in SOL, with nothing to claim, once together they reach the minimum payout, and every
        payment is on the public <Link href="/revenue">Ledger</Link>. The share set aside, the minimum and the limit on a rebate are on
        the <Link href="/fees#volume-rebates">Fees page</Link>.
      </p>

      {!program ? (
        <section className={`card ${styles.card}`} aria-labelledby="rebates-state-title">
          <h3 id="rebates-state-title" className="visually-hidden">Where the program stands</h3>
          <ErrorState bare title="Volume rebates could not be read">The API did not answer. Reload the page to try again.</ErrorState>
        </section>
      ) : state === "idle" ? (
        <section className={`card ${styles.card}`} aria-labelledby="rebates-state-title" data-rebates={state}>
          <h3 id="rebates-state-title" className="visually-hidden">Where the program stands</h3>
          <EmptyState bare title="Rebates begin once their share is announced">
            Volume rebates are not running yet: the Budget Table sets no share aside for them. A share is announced at least a day
            ahead, and trades earn from the moment it applies.
          </EmptyState>
        </section>
      ) : (
        <>
          <section className={`card ${styles.card}`} aria-labelledby="rebates-state-title" data-rebates={state}>
            {current ? (
              <>
                <h3 id="rebates-state-title" className={`t-h3 ${styles.cardTitle}`}>This Rebate Week</h3>
                <dl className={styles.rules}>
                  <div>
                    <dt>Began</dt>
                    <dd><time dateTime={current.start}>{formatUtc(current.start)}</time></dd>
                  </div>
                  <div>
                    <dt>Ends</dt>
                    <dd><time dateTime={current.end}>{formatUtc(current.end)}</time></dd>
                  </div>
                  <div>
                    <dt>Platform Fees paid so far</dt>
                    <dd><span className="mono">{rebateSol(current.feesLamports)}</span> SOL</dd>
                  </div>
                  <div>
                    <dt>The week&apos;s pot so far, an estimate</dt>
                    <dd><span className="mono">{rebateSol(current.potLamports)}</span> SOL</dd>
                  </div>
                </dl>
                <p className={styles.note}>
                  The pot is an estimate until the week is settled, within about an hour of its end: the week&apos;s later trades, the
                  fees still to be collected and the prices at the settlement all move it. Fees paid in another asset count at their
                  worth in SOL.
                </p>
                {/* An announced change to the row's share, which ends the program when the share goes to nothing. */}
                {upcoming && (
                  <>
                    <dl className={styles.rules} data-rebates-upcoming>
                      <div>
                        <dt>{ending ? "Volume rebates end" : "The share set aside changes"}</dt>
                        <dd><time dateTime={upcoming.effectiveAt}>{formatUtc(upcoming.effectiveAt)}</time></dd>
                      </div>
                    </dl>
                    <p className={styles.note}>
                      {ending ? (
                        "A trade made after that earns no rebate. Every rebate given before it is still paid."
                      ) : (
                        <>It applies to trades made from then on. Both figures are on the <Link href="/fees#volume-rebates">Fees page</Link>.</>
                      )}
                    </p>
                  </>
                )}
              </>
            ) : upcoming ? (
              <>
                <h3 id="rebates-state-title" className={`t-h3 ${styles.cardTitle}`}>Announced</h3>
                <dl className={styles.rules}>
                  <div>
                    <dt>Volume rebates begin</dt>
                    <dd><time dateTime={upcoming.effectiveAt}>{formatUtc(upcoming.effectiveAt)}</time></dd>
                  </div>
                </dl>
                <p className={styles.note}>
                  A trade made from then on earns its part of its week&apos;s pot; a trade made before earns nothing. The share set
                  aside is on the <Link href="/fees#volume-rebates">Fees page</Link>, and the announcement under{" "}
                  <Link href="/announcements">Announcements</Link>.
                </p>
              </>
            ) : (
              <>
                <h3 id="rebates-state-title" className={`t-h3 ${styles.cardTitle}`}>Not running now</h3>
                <p className={styles.note}>
                  The Budget Table sets no share aside for Volume Rebates at the moment, so trades are not earning one. Every rebate
                  already given is still paid once a wallet&apos;s rebates reach the minimum. A new share would be announced at least a
                  day ahead under <Link href="/announcements">Announcements</Link>.
                </p>
              </>
            )}
          </section>

          <YourRebates explorer={explorer} minPayoutLamports={program.minPayoutLamports} />

          <section className={`card ${styles.card}`} aria-labelledby="rebates-weeks-title">
            <h3 id="rebates-weeks-title" className={`t-h3 ${styles.cardTitle}`}>Settled weeks</h3>
            {weeks.length === 0 ? (
              <EmptyState bare title="The first week is settled after it ends">
                No Rebate Week has been settled yet. A week is settled within about an hour of its end and listed here with its pot.
              </EmptyState>
            ) : (
              <>
                <dl className={styles.rules}>
                  <div>
                    <dt>Paid to traders so far</dt>
                    <dd><span className="mono">{rebateSol(program.paidLamports)}</span> SOL</dd>
                  </div>
                  <div>
                    <dt>Waiting to be paid</dt>
                    <dd><span className="mono">{rebateSol(program.waitingLamports)}</span> SOL</dd>
                  </div>
                </dl>
                <table className={styles.weeks} aria-label="Settled Rebate Weeks">
                  <thead>
                    <tr>
                      <th scope="col">Week starting</th>
                      <th scope="col" className={styles.count}>Traders</th>
                      <th scope="col" className={styles.num}>Pot</th>
                      <th scope="col" className={styles.num}>Paid</th>
                    </tr>
                  </thead>
                  <tbody>
                    {weeks.map((w) => (
                      <tr key={w.start}>
                        <th scope="row"><time dateTime={w.start} title={weekSpan(w.start, w.end)}>{weekName(w.start)}</time></th>
                        <td data-label="Traders" className={styles.count}><span className="mono">{w.traders.toLocaleString("en-US")}</span></td>
                        <td data-label="Pot" className={styles.num}>
                          <span><span className="mono">{rebateSol(w.potLamports)}</span> SOL</span>
                        </td>
                        <td data-label="Paid" className={`${styles.num} ${styles.amount}`}>
                          <span><span className="mono">{rebateSol(w.paidLamports)}</span> SOL</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className={styles.note}>
                  A week&apos;s pot is split by the fees each trader paid. What a week gave and has not paid yet is waiting for its
                  wallets to reach the minimum, and every payment is a Volume Rebate entry on the <Link href="/revenue">Ledger</Link>.
                </p>
              </>
            )}
          </section>
        </>
      )}
    </section>
  );
}
