"use client";

import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { VersionedTransaction } from "@solana/web3.js";
import { useState } from "react";
import type { CreatorFeeAsset, PlatformInfo, PreparedCreatorFeeClaim } from "@launchpad/contract";
import { listCreatorFeeClaims, prepareCreatorFeeClaim, reportTransaction } from "@/lib/api";
import { explorerUrl, formatUnits, quoteTicker, SOL_DECIMALS } from "@/lib/format";
import { QuoteLogo } from "./QuoteLogo";
import styles from "./ClaimCard.module.css";

type Review = { prepared: PreparedCreatorFeeClaim; tx: VersionedTransaction; walletLamports: bigint; networkFee: bigint };
type Step =
  | { kind: "idle" }
  | { kind: "preparing" }
  | { kind: "reviewing"; review: Review }
  | { kind: "signing"; review: Review }
  | { kind: "confirming"; review: Review };
type Done = { amount: string; signature: string };

/**
 * One Quote Asset's Creator Fee: what its vault holds, what the Creator's coins earned and what they have claimed, and,
 * for the Creator's own wallet, the claim. The claim is prepared by the API, simulated, then signed in the wallet.
 */
export function ClaimCard({
  asset, platform, canClaim, onClaimed,
}: { asset: CreatorFeeAsset; platform: PlatformInfo; canClaim: boolean; onClaimed: () => void }) {
  const { connection } = useConnection();
  const { publicKey, signTransaction } = useWallet();
  const [step, setStep] = useState<Step>({ kind: "idle" });
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Done | null>(null);

  const { quote } = asset;
  const symbol = quoteTicker(quote);
  const units = (raw: string) => formatUnits(raw, quote.decimals, quote.decimals);
  const claimable = BigInt(asset.claimable);
  // The vault is shared with the Creator's launches on other LaunchLab platforms, so it can hold more than was earned here.
  const fromElsewhere = claimable > BigInt(asset.earned) - BigInt(asset.claimed);

  async function review() {
    if (!publicKey) return;
    setError(null);
    setDone(null);
    setStep({ kind: "preparing" });
    try {
      const prepared = await prepareCreatorFeeClaim({ creator: publicKey.toBase58(), quoteMint: quote.mint });
      const tx = VersionedTransaction.deserialize(Uint8Array.from(atob(prepared.transaction), (c) => c.charCodeAt(0)));
      // Simulate before asking for a signature, so the review shows what actually reaches the wallet.
      const sim = await connection.simulateTransaction(tx, {
        sigVerify: false,
        accounts: { addresses: [publicKey.toBase58()], encoding: "base64" },
      });
      if (sim.value.err) throw new Error(simulationError(sim.value.err, sim.value.logs ?? []));
      const before = BigInt(await connection.getBalance(publicKey, "confirmed"));
      // The simulated balance already has the network fee taken off.
      const after = BigInt(sim.value.accounts?.[0]?.lamports ?? before);
      const networkFee = BigInt((await connection.getFeeForMessage(tx.message, "confirmed")).value ?? 0);
      setStep({ kind: "reviewing", review: { prepared, tx, walletLamports: after - before, networkFee } });
    } catch (e) {
      setError(claimError((e as Error).message));
      setStep({ kind: "idle" });
    }
  }

  async function signAndSend(r: Review) {
    if (!signTransaction) return setError("This wallet can't sign transactions. Try another wallet.");
    setStep({ kind: "signing", review: r });
    try {
      const signed = await signTransaction(r.tx);
      const signature = await connection.sendRawTransaction(signed.serialize());
      setStep({ kind: "confirming", review: r });
      const result = await connection.confirmTransaction(
        { signature, blockhash: signed.message.recentBlockhash, lastValidBlockHeight: r.prepared.lastValidBlockHeight },
        "confirmed",
      );
      if (result.value.err) {
        setError("The claim failed on-chain, so nothing moved and only the network fee was charged. Try again.");
      } else {
        await reportTransaction(signature);
        // The claim pays whatever the vault holds when it lands, which trades since the review may have raised.
        const claimed = (await listCreatorFeeClaims(publicKey!.toBase58()).catch(() => null))?.claims.find((c) => c.signature === signature);
        setDone({ amount: claimed?.amount ?? r.prepared.amount, signature });
        onClaimed();
      }
    } catch (e) {
      const message = (e as Error).message ?? "";
      setError(
        /reject|declin|cancel/i.test(message)
          ? "You declined the transaction in your wallet. Nothing was claimed."
          : "The claim couldn't be sent. Nothing was claimed; try again in a moment.",
      );
    }
    setStep({ kind: "idle" });
  }

  const r = step.kind === "reviewing" || step.kind === "signing" || step.kind === "confirming" ? step.review : null;

  return (
    <section className={styles.card} aria-labelledby={`claim-${quote.mint}`}>
      <div className={styles.head}>
        <h3 id={`claim-${quote.mint}`} className={styles.symbol}>
          <QuoteLogo quote={quote} size={24} />
          {symbol}
        </h3>
        {claimable > 0n ? <span className={styles.label}>Ready to claim</span> : <span className={styles.labelDone}>All claimed</span>}
      </div>
      <p className={styles.amount}>
        <span className="mono">{units(asset.claimable)}</span> <span className={styles.unit}>{symbol}</span>
      </p>
      <dl className={styles.facts}>
        <div>
          <dt>Earned by these coins</dt>
          <dd><span className="mono">{units(asset.earned)}</span> {symbol}</dd>
        </div>
        <div>
          <dt>Claimed so far</dt>
          <dd><span className="mono">{units(asset.claimed)}</span> {symbol}</dd>
        </div>
      </dl>
      {fromElsewhere && (
        <p className={styles.note}>Includes Creator Fee from this wallet&apos;s coins on other LaunchLab launchpads, which share the same vault.</p>
      )}

      {error && <p className={styles.error} role="alert">{error}</p>}
      {done && (
        <p className={styles.done} role="status">
          Claimed <span className="mono">{units(done.amount)}</span> {symbol}.{" "}
          <a href={explorerUrl("tx", done.signature, platform)} target="_blank" rel="noreferrer">View transaction</a>
        </p>
      )}

      {canClaim &&
        (r ? (
          <div className={styles.review} role="region" aria-label="Review your claim">
            <p>
              {r.prepared.unwrapped ? (
                <>
                  Your wallet receives about <strong className="mono">{formatUnits(r.walletLamports.toString(), SOL_DECIMALS, SOL_DECIMALS)} SOL</strong>{" "}
                  after the network fee.
                </>
              ) : (
                <>
                  Your wallet receives <strong className="mono">{units(r.prepared.amount)} {symbol}</strong> and pays a network fee of about{" "}
                  <span className="mono">{formatUnits(r.networkFee.toString(), SOL_DECIMALS, SOL_DECIMALS)}</span> SOL.
                </>
              )}{" "}
              The chain pays it straight from your vault.
            </p>
            <div className={styles.actions}>
              <button type="button" className={styles.secondary} onClick={() => setStep({ kind: "idle" })} disabled={step.kind !== "reviewing"}>
                Cancel
              </button>
              <button type="button" className={styles.primary} onClick={() => signAndSend(r)} disabled={step.kind !== "reviewing"}>
                {step.kind === "signing" ? "Confirm in your wallet…" : step.kind === "confirming" ? "Confirming…" : "Sign and claim"}
              </button>
            </div>
          </div>
        ) : claimable > 0n ? (
          <button type="button" className={styles.primary} onClick={review} disabled={step.kind === "preparing"}>
            {step.kind === "preparing" ? "Preparing…" : `Claim ${symbol}`}
          </button>
        ) : (
          <p className={styles.empty}>Nothing to claim right now. It fills up as your coins trade.</p>
        ))}
    </section>
  );
}

/** Turns an API or wallet error into what happened and what to do next. */
function claimError(message: string) {
  if (/no Creator Fee to claim/.test(message)) return "Your vault is empty now, so there is nothing to claim.";
  if (/^[A-Z]/.test(message) && message.endsWith(".")) return message;
  return "Something went wrong preparing the claim. Try again in a moment.";
}

function simulationError(err: unknown, logs: string[]) {
  const text = `${JSON.stringify(err)} ${logs.join(" ")}`;
  if (/insufficient (lamports|funds)|InsufficientFundsForRent|AccountNotFound|"Custom":1\b/.test(text))
    return "Your wallet needs a little SOL to pay the network fee. Add SOL and try again.";
  return "The claim would fail on-chain, so nothing was sent. Try again in a moment.";
}
