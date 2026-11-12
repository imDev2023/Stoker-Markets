"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { useEffect, useState } from "react";
import type { WalletRebates } from "@launchpad/contract";
import { getWalletRebates } from "@/lib/api";
import { formatUnits, SOL_DECIMALS } from "@/lib/format";
import { rebateSol, rebateSolExact, weekName, weekSpan } from "@/lib/rebates";
import styles from "@/app/(terminal)/rewards/page.module.css";
import { Address } from "./Address";
import { EmptyState, ErrorState } from "./EmptyState";
import { RelativeTime } from "./RelativeTime";
import { Skeleton } from "./Skeleton";
import { WalletButton } from "./WalletButton";

/** A wallet's rebates move once a week and its estimate with every trade; half a minute keeps the panel honest without a read per tick. */
const REFRESH_MS = 30_000;

type Loaded = { wallet: string; rebates: WalletRebates; at: number };

/**
 * The connected wallet's Volume Rebates (ADR 0021), from `GET /v1/wallets/:address/rebates`: what this week's trades
 * have paid and would earn, what is waiting for the minimum payout, what was paid, and its rebate for every settled
 * week with the payment's transaction. Without a wallet it asks for one, as the Creator's page does. The four states
 * are decided here: a skeleton while the first read is out, the error with a way to try again where there is nothing
 * to show yet, and the last good read kept on the page while a later one fails.
 */
export function YourRebates({ explorer, minPayoutLamports }: { explorer: { cluster: string; rpcUrl: string }; minPayoutLamports: string }) {
  const { publicKey } = useWallet();
  const wallet = publicKey?.toBase58() ?? null;
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!wallet) return;
    let gone = false;
    const refresh = async () => {
      try {
        const rebates = await getWalletRebates(wallet);
        if (gone) return;
        if (!rebates) return setFailed(wallet);
        setLoaded({ wallet, rebates, at: Date.now() });
        setFailed(null);
      } catch {
        if (!gone) setFailed(wallet);
      }
    };
    void refresh();
    const id = setInterval(refresh, REFRESH_MS);
    return () => {
      gone = true;
      clearInterval(id);
    };
  }, [wallet, attempt]);

  // What was read for another wallet, or before this one disconnected, is not this wallet's.
  const own = loaded?.wallet === wallet ? loaded : null;

  return (
    <section className={`card ${styles.card}`} aria-labelledby="rebates-yours-title">
      <h3 id="rebates-yours-title" className={`t-h3 ${styles.cardTitle}`}>Your rebates</h3>
      {!wallet ? (
        <div className={styles.connect}>
          <p>Connect a wallet to see what its trades have earned back.</p>
          <WalletButton variant="inline" />
        </div>
      ) : own ? (
        <Rebates rebates={own.rebates} now={own.at} explorer={explorer} minPayoutLamports={minPayoutLamports} />
      ) : failed === wallet ? (
        <ErrorState bare title="Your rebates could not be read" onRetry={() => { setFailed(null); setAttempt((n) => n + 1); }}>
          The API did not answer. Nothing is lost: rebates are recorded and paid whether or not this page can read them.
        </ErrorState>
      ) : (
        <div aria-busy="true">
          <span className="visually-hidden">Reading your rebates…</span>
          <Skeleton lines={2} height={44} />
        </div>
      )}
    </section>
  );
}

function Rebates({ rebates, now, explorer, minPayoutLamports }: {
  rebates: WalletRebates;
  now: number;
  explorer: { cluster: string; rpcUrl: string };
  minPayoutLamports: string;
}) {
  const { current } = rebates;
  // A wallet that has not traded in a week that earns has nothing behind any figure: the empty state, never a row of zeros.
  if (rebates.rebates.length === 0 && (!current || current.feesLamports === "0"))
    return (
      <EmptyState bare title="Your first rebate follows a week you trade in">
        No rebates for this wallet yet. Each Rebate Week it trades in while Volume Rebates are running is listed here, once the week is settled, with what it gave.
      </EmptyState>
    );
  return (
    <>
      <dl className={styles.rules}>
        {current && (
          <>
            <div>
              <dt>Fees your trades paid this week</dt>
              <dd><span className="mono">{rebateSol(current.feesLamports)}</span> SOL</dd>
            </div>
            <div>
              <dt>Your rebate so far, an estimate</dt>
              <dd><span className="mono">{rebateSol(current.estimateLamports)}</span> SOL</dd>
            </div>
          </>
        )}
        <div>
          <dt>Waiting to be paid</dt>
          <dd><span className="mono">{rebateSolExact(rebates.waitingLamports)}</span> SOL</dd>
        </div>
        <div>
          <dt>Paid so far</dt>
          <dd><span className="mono">{rebateSolExact(rebates.paidLamports)}</span> SOL</dd>
        </div>
      </dl>
      <p className={styles.note} data-rebates-minimum>
        What is waiting is sent in one transfer, with nothing to claim, once it reaches{" "}
        <span className="mono">{formatUnits(minPayoutLamports, SOL_DECIMALS)}</span> SOL.
      </p>
      {rebates.rebates.length === 0 ? (
        <p className={styles.note}>No week has been settled for this wallet yet: this week&apos;s rebate is given once the week has ended.</p>
      ) : (
        <table className={styles.weeks} aria-label="Your rebates by week">
          <thead>
            <tr>
              <th scope="col">Week starting</th>
              <th scope="col" className={styles.num}>Fees you paid</th>
              <th scope="col" className={styles.num}>Rebate</th>
              <th scope="col" className={styles.status}>Status</th>
            </tr>
          </thead>
          <tbody>
            {rebates.rebates.map((r) => (
              <tr key={r.weekStart} className={r.status === "paid" ? undefined : styles.pending}>
                <th scope="row"><time dateTime={r.weekStart} title={weekSpan(r.weekStart, r.weekEnd)}>{weekName(r.weekStart)}</time></th>
                <td data-label="Fees you paid" className={styles.num}>
                  <span><span className="mono">{rebateSol(r.feesLamports)}</span> SOL</span>
                </td>
                <td data-label="Rebate" className={`${styles.num} ${styles.amount}`}>
                  <span><span className="mono">{rebateSolExact(r.amountLamports)}</span> SOL</span>
                </td>
                <td data-label="Status" className={styles.status} data-rebate-status={r.status}>
                  {/* One payment can carry several weeks' rebates, so two rows may link the same transaction. */}
                  <span>
                    {r.status === "waiting" ? (
                      "Waiting for the minimum"
                    ) : r.status === "sending" ? (
                      <>On its way{r.signature && <> · <Address value={r.signature} kind="tx" platform={explorer} /></>}</>
                    ) : (
                      <>
                        Paid{r.paidAt && <> <RelativeTime iso={r.paidAt} now={now} /></>}
                        {r.signature && <> · <Address value={r.signature} kind="tx" platform={explorer} /></>}
                      </>
                    )}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
