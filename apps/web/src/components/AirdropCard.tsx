"use client";

import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { VersionedTransaction } from "@solana/web3.js";
import { useCallback, useEffect, useState } from "react";
import type { AirdropStatus, PlatformInfo } from "@launchpad/contract";
import { getAirdrop, prepareAirdrop, reportTransaction } from "@/lib/api";
import { COIN_DECIMALS, explorerUrl, formatUnits, shortAddress } from "@/lib/format";
import styles from "./AirdropCard.module.css";

type Step = { kind: "idle" } | { kind: "preparing" } | { kind: "signing"; count: number } | { kind: "sending"; count: number };

const REFRESH_MS = 4_000;
// "Waiting": a transaction paying this wallet was handed out and may still land; it settles within about a minute.
const STATUS_LABEL = { paid: "Paid", sending: "Waiting", unpaid: "Not paid yet" } as const;

/**
 * A coin's Airdrop: which wallets it pays and which have been paid, for everyone to see. The Creator sends it from here,
 * in one wallet approval however many transactions it takes, and sends the rest if some didn't go through.
 */
export function AirdropCard({ initial, symbol, platform }: { initial: AirdropStatus; symbol: string; platform: PlatformInfo }) {
  const { connection } = useConnection();
  const { publicKey, signAllTransactions } = useWallet();
  const [status, setStatus] = useState(initial);
  const [step, setStep] = useState<Step>({ kind: "idle" });
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [listOpen, setListOpen] = useState(false);

  const isCreator = publicKey?.toBase58() === status.creator;
  const count = (s: AirdropStatus["recipients"][number]["status"]) => status.recipients.filter((r) => r.status === s).length;
  const paid = count("paid");
  const sending = count("sending");
  const unpaid = count("unpaid");
  const total = status.recipients.length;
  const done = paid === total;
  const busy = step.kind !== "idle";

  const refresh = useCallback(async () => {
    const next = await getAirdrop(status.mint).catch(() => null);
    if (next) setStatus(next);
  }, [status.mint]);

  // Payments in flight settle within about a minute, landed or expired; follow them until they do.
  useEffect(() => {
    if (sending === 0 || busy) return;
    const id = setInterval(() => void refresh(), REFRESH_MS);
    return () => clearInterval(id);
  }, [sending, busy, refresh]);

  async function send() {
    if (!signAllTransactions) return setError("This wallet can't sign transactions. Try another wallet.");
    setError(null);
    setNotice(null);
    setStep({ kind: "preparing" });
    try {
      const prepared = await prepareAirdrop(status.mint);
      const txs = prepared.transactions.map((t) => VersionedTransaction.deserialize(Uint8Array.from(atob(t), (c) => c.charCodeAt(0))));
      setStep({ kind: "signing", count: txs.length });
      let signed: VersionedTransaction[];
      try {
        signed = await signAllTransactions(txs);
      } catch (e) {
        const message = (e as Error).message ?? "";
        throw new Error(
          /reject|declin|cancel/i.test(message)
            ? "You declined in your wallet, so nothing was sent. You can send it in about a minute, once the transactions you declined have expired."
            : message,
          { cause: e },
        );
      }
      setStep({ kind: "sending", count: signed.length });
      const results = await Promise.allSettled(
        signed.map(async (tx) => {
          const signature = await connection.sendRawTransaction(tx.serialize());
          const result = await connection.confirmTransaction(
            { signature, blockhash: tx.message.recentBlockhash, lastValidBlockHeight: prepared.lastValidBlockHeight },
            "confirmed",
          );
          if (result.value.err) throw new Error("failed on-chain");
          await reportTransaction(signature);
        }),
      );
      await refresh();
      if (results.some((r) => r.status === "rejected"))
        setNotice("Some payments didn't go through. You can send them again once their transactions have expired, in about a minute.");
    } catch (e) {
      setError((e as Error).message);
      await refresh();
    }
    setStep({ kind: "idle" });
  }

  const pct = total === 0 ? 0 : (paid / total) * 100;

  return (
    <section className={styles.card} aria-labelledby="airdrop-title">
      <div className={styles.head}>
        <h2 id="airdrop-title" className={styles.title}>Airdrop</h2>
        <span className={styles.count}>
          {paid} of {total} paid
        </span>
      </div>
      <div
        className={styles.track}
        role="progressbar"
        aria-labelledby="airdrop-title"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={paid}
        aria-valuetext={`${paid} of ${total} wallets paid`}
      >
        {paid > 0 && <span className={styles.fill} style={{ width: `${pct}%` }} />}
      </div>
      <p className={styles.summary}>
        {total} {total === 1 ? "wallet" : "wallets"} {done ? "got" : "get"}{" "}
        <span className="mono">{formatUnits(status.amount, COIN_DECIMALS, COIN_DECIMALS)}</span> {symbol} from the creator&apos;s first
        buy{done ? "." : ", sent from the creator's wallet."}
      </p>

      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className={styles.notice} role="status">
          {notice}
        </p>
      )}

      {isCreator && !done && (
        <div className={styles.action}>
          <button type="button" className={styles.primary} onClick={send} disabled={busy || unpaid === 0}>
            {step.kind === "preparing"
              ? "Preparing…"
              : step.kind === "signing"
                ? "Confirm in your wallet…"
                : step.kind === "sending"
                  ? `Sending ${step.count === 1 ? "1 transaction" : `${step.count} transactions`}…`
                  : paid === 0
                    ? "Send airdrop"
                    : "Send the rest"}
          </button>
          <p className={styles.hint}>
            {unpaid === 0
              ? "Waiting for transactions already handed out to land or expire, which takes up to a minute."
              : "Your wallet asks you to sign every payment at once, and pays each new coin account's rent."}
          </p>
        </div>
      )}

      <details className={styles.wallets} onToggle={(e) => setListOpen(e.currentTarget.open)}>
        <summary>
          {listOpen ? "Hide" : "Show"} {total === 1 ? "the wallet" : `the ${total} wallets`}
        </summary>
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col">Wallet</th>
              <th scope="col" className={styles.num}>{symbol}</th>
              <th scope="col" className={styles.num}>Status</th>
            </tr>
          </thead>
          <tbody>
            {status.recipients.map((r) => (
              <tr key={r.wallet}>
                <td>
                  <a className="mono" href={explorerUrl("address", r.wallet, platform)} target="_blank" rel="noreferrer">
                    {shortAddress(r.wallet)}
                  </a>
                </td>
                <td className={`mono ${styles.num}`}>{formatUnits(r.amount, COIN_DECIMALS, COIN_DECIMALS)}</td>
                <td className={styles.num}>
                  {r.signature ? (
                    <a className={`${styles.status} ${styles.paid}`} href={explorerUrl("tx", r.signature, platform)} target="_blank" rel="noreferrer">
                      {STATUS_LABEL.paid}
                    </a>
                  ) : (
                    <span className={`${styles.status} ${styles[r.status]}`}>{STATUS_LABEL[r.status]}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </section>
  );
}
