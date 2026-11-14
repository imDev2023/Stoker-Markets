"use client";

import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { VersionedTransaction } from "@solana/web3.js";
import { useState } from "react";
import type { CreatorLockStatus } from "@launchpad/contract";
import { prepareCreatorLockClaim } from "@/lib/api";
import { lockStage, lockTime, receivedAfterTax } from "@/lib/creatorLock";
import { COIN_DECIMALS, formatUnits, formatUtc } from "@/lib/format";
import { landedError } from "@/lib/transactions";
import styles from "./AirdropCard.module.css";
import own from "./CreatorLockCard.module.css";

type Step = { kind: "idle" } | { kind: "preparing" } | { kind: "signing" } | { kind: "sending" };

const coins = (raw: string | bigint) => formatUnits(raw.toString(), COIN_DECIMALS, 0);

/** Why the Creator can't claim right now, in plain words; null when a claim can go ahead. */
function refusal(lock: CreatorLockStatus, symbol: string) {
  const share = lock.creatorShare!;
  if (lock.curve !== "graduated") {
    const wait = lock.terms.cliffSeconds > 0 ? ` Nothing unlocks for ${lockTime(lock.terms.cliffSeconds)} after that.` : "";
    return <>You can claim once {symbol} has graduated.{wait}</>;
  }
  if (lockStage(lock) === "cliff") return <>Nothing unlocks until <time dateTime={lock.unlockStartsAt!}>{formatUtc(lock.unlockStartsAt!)}</time>.</>;
  if (BigInt(share.claimable) > 0n) return null;
  if (BigInt(share.claimed) >= BigInt(share.amount)) return <>You have claimed all of it.</>;
  return <>Nothing new has unlocked since your last claim.</>;
}

/**
 * The Creator's own view of their Creator Lock (ADR 0023, #211), shown to the wallet holding the share and nobody else:
 * what is locked for them, what they have claimed and what they can claim now, and the claim, which their wallet signs
 * and pays for (ADR 0003). While a claim can't land the button waits and the card says why. On a Reward Launch the claim
 * pays the coin's Reward Tax like any transfer, and the card says what reaches the wallet.
 */
export function CreatorLockCard({ lock, symbol, onClaimed }: { lock: CreatorLockStatus; symbol: string; onClaimed: () => Promise<void> }) {
  const { connection } = useConnection();
  const { publicKey, signTransaction } = useWallet();
  const [step, setStep] = useState<Step>({ kind: "idle" });
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const share = lock.creatorShare;
  if (!share || publicKey?.toBase58() !== lock.creator) return null;

  const claimable = BigInt(share.claimable);
  const why = refusal(lock, symbol);
  const busy = step.kind !== "idle";

  async function claim() {
    if (!publicKey || !signTransaction) return setError("This wallet can't sign transactions. Try another wallet.");
    setError(null);
    setNotice(null);
    setStep({ kind: "preparing" });
    try {
      const prepared = await prepareCreatorLockClaim(lock.mint, publicKey.toBase58());
      const tx = VersionedTransaction.deserialize(Uint8Array.from(atob(prepared.transaction), (c) => c.charCodeAt(0)));
      setStep({ kind: "signing" });
      let signed: VersionedTransaction;
      try {
        signed = await signTransaction(tx);
      } catch (e) {
        const message = (e as Error).message ?? "";
        throw new Error(/reject|declin|cancel/i.test(message) ? "You declined in your wallet, so nothing was claimed." : message, { cause: e });
      }
      setStep({ kind: "sending" });
      const signature = await connection.sendRawTransaction(signed.serialize());
      const result = await connection
        .confirmTransaction({ signature, blockhash: signed.message.recentBlockhash, lastValidBlockHeight: prepared.lastValidBlockHeight }, "confirmed")
        .catch((e: unknown) => {
          if (landedError(e)) return { value: { err: e } };
          throw e;
        });
      if (result.value.err) throw new Error("The claim failed on-chain, so nothing was claimed. Try again in a moment.");
      setNotice(`Claimed ${coins(prepared.received)} ${symbol} to your wallet.`);
    } catch (e) {
      setError((e as Error).message);
    }
    await onClaimed();
    setStep({ kind: "idle" });
  }

  return (
    <section className={`card ${styles.card}`} aria-labelledby="lock-claim-title">
      <div className={`${styles.head} ${own.head}`}>
        <h2 id="lock-claim-title" className={`t-h3 ${styles.title}`}>Your Creator Lock</h2>
        <span className={`${styles.count} ${own.count}`}>
          {coins(share.claimed)} of {coins(share.amount)} claimed
        </span>
      </div>
      <p className={styles.summary}>
        {claimable > 0n ? (
          <>You can claim <span className="mono">{coins(claimable)}</span> {symbol} now.</>
        ) : (
          <>Nothing to claim right now.</>
        )}
        {lock.rewardTaxBps !== null && claimable > 0n && (
          <>
            {" "}A claim pays {symbol}&apos;s {lock.rewardTaxBps / 100}% Reward Tax to its holders like any transfer, so about{" "}
            <span className="mono">{coins(receivedAfterTax(claimable, lock.rewardTaxBps))}</span> reach your wallet.
          </>
        )}
        {lock.rewardTaxBps !== null && claimable === 0n && (
          <> A claim pays {symbol}&apos;s {lock.rewardTaxBps / 100}% Reward Tax to its holders like any transfer.</>
        )}
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

      <div className={styles.action}>
        <button type="button" className={`button button-primary ${styles.primary}`} onClick={claim} disabled={busy || why !== null}>
          {step.kind === "preparing"
            ? "Preparing…"
            : step.kind === "signing"
              ? "Confirm in your wallet…"
              : step.kind === "sending"
                ? "Claiming…"
                : `Claim ${symbol}`}
        </button>
        <p className={styles.hint}>{why ?? "Your wallet signs the claim and pays its network fee."}</p>
      </div>
    </section>
  );
}
