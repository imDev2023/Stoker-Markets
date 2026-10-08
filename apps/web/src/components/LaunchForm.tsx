"use client";

import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import {
  LAMPORTS_PER_SOL, SendTransactionError, TransactionExpiredBlockheightExceededError, VersionedTransaction,
} from "@solana/web3.js";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { LAUNCH_IMAGE_MAX_BYTES, type PlatformInfo, type PreparedLaunch, type QuoteAsset } from "@launchpad/contract";
import { ApiRequestError, prepareLaunch, reportTransaction, retryLaunch } from "@/lib/api";
import { landedError } from "@/lib/transactions";
import { creatorEarnings, creatorShareOf } from "@/lib/fees";
import { COIN_DECIMALS, formatAmount, formatUnits, isSol, quoteTicker, SOL_DECIMALS } from "@/lib/format";
import { Disclaimer, hasAcceptedDisclaimer } from "./Disclaimer";
import { LaunchOptions, LaunchType, supplyShare, useLaunchOptions } from "./LaunchOptions";
import { PairMark } from "./PairMark";
import { QuoteLabelList } from "./QuoteLabels";
import { QuotePicker } from "./QuotePicker";
import { WalletButton } from "./WalletButton";
import styles from "./LaunchForm.module.css";

type Review = { prepared: PreparedLaunch; quote: QuoteAsset; tx: VersionedTransaction; costLamports: number };
/**
 * An attempt that was signed and handed to the network but did not visibly land. Trying again prepares the same coin,
 * so it can never launch twice. While it is `uncertain` whether it landed, the Creator can't start over with a new coin.
 */
type Failed = { kind: "failed"; mint: string; quote: QuoteAsset; uncertain: boolean };
type Step =
  | { kind: "editing" }
  | { kind: "preparing"; retrying?: Failed }
  | { kind: "reviewing"; review: Review }
  | { kind: "signing"; review: Review }
  | { kind: "confirming"; review: Review; signature: string }
  | Failed;

const DESCRIPTION_MAX = 1000;

export function LaunchForm({ platform, quotes }: { platform: PlatformInfo; quotes: QuoteAsset[] }) {
  const router = useRouter();
  const { connection } = useConnection();
  const { publicKey, signTransaction } = useWallet();
  const earns = creatorEarnings(platform);
  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("");
  const [description, setDescription] = useState("");
  const [website, setWebsite] = useState("");
  const [x, setX] = useState("");
  const [telegram, setTelegram] = useState("");
  const [image, setImage] = useState<File | null>(null);
  const [quoteMint, setQuoteMint] = useState(() => quotes.find((q) => q.launchable)?.mint ?? null);
  const [step, setStep] = useState<Step>({ kind: "editing" });
  const [error, setError] = useState<string | null>(null);
  const [disclaimerOpen, setDisclaimerOpen] = useState(false);

  const imageUrl = useMemo(() => (image ? URL.createObjectURL(image) : null), [image]);
  useEffect(() => () => { if (imageUrl) URL.revokeObjectURL(imageUrl); }, [imageUrl]);

  const quote = quotes.find((q) => q.mint === quoteMint) ?? null;
  // The launch options work in whichever Quote Asset is chosen: its ticker and decimals, and quotes priced in it.
  const options = useLaunchOptions(quote && { mint: quote.mint, symbol: quoteTicker(quote), decimals: quote.decimals }, publicKey?.toBase58() ?? null);
  const busy = step.kind !== "editing";

  // A review is one wallet's transaction; another wallet, or none, means it must be prepared again.
  const owner = publicKey?.toBase58() ?? null;
  useEffect(() => {
    setStep((s) => (s.kind === "reviewing" ? { kind: "editing" } : s));
  }, [owner]);

  function pickImage(file: File | undefined) {
    setError(null);
    if (!file) return setImage(null);
    if (file.size > LAUNCH_IMAGE_MAX_BYTES) return setError("The image is larger than 2 MB. Choose a smaller one.");
    setImage(file);
  }

  /** Simulates a prepared launch before any signature is asked for, so the review shows what the wallet really pays. */
  async function toReview(prepared: PreparedLaunch, quote: QuoteAsset): Promise<Review> {
    if (!publicKey) throw new Error("Connect a wallet to review the launch.");
    const tx = VersionedTransaction.deserialize(Uint8Array.from(atob(prepared.transaction), (c) => c.charCodeAt(0)));
    const sim = await connection.simulateTransaction(tx, {
      sigVerify: false,
      accounts: { addresses: [publicKey.toBase58()], encoding: "base64" },
    });
    if (sim.value.err) throw new Error(simulationError(sim.value.err, sim.value.logs ?? [], prepared.firstBuy && !isSol(quote) ? quoteTicker(quote) : null));
    const before = await connection.getBalance(publicKey, "confirmed");
    // The simulated balance already has the network fee taken off.
    const after = sim.value.accounts?.[0]?.lamports ?? before;
    return { prepared, quote, tx, costLamports: before - after };
  }

  async function prepare() {
    if (!publicKey || !quote) return;
    setStep({ kind: "preparing" });
    try {
      const form = new FormData();
      form.set("creator", publicKey.toBase58());
      form.set("quoteMint", quote.mint);
      form.set("name", name.trim());
      form.set("symbol", symbol.trim());
      form.set("description", description.trim());
      for (const [k, v] of [["website", website], ["x", x], ["telegram", telegram]] as const) if (v.trim()) form.set(k, v.trim());
      for (const [k, v] of options.fields()) form.set(k, v);
      form.set("image", image!);
      setStep({ kind: "reviewing", review: await toReview(await prepareLaunch(form), quote) });
    } catch (e) {
      setError((e as Error).message);
      setStep({ kind: "editing" });
    }
  }

  /** Prepares the same coin again after a failed attempt; if that attempt landed after all, goes to the coin. */
  async function retry(failed: Failed) {
    setError(null);
    setStep({ kind: "preparing", retrying: failed });
    try {
      setStep({ kind: "reviewing", review: await toReview(await retryLaunch(failed.mint), failed.quote) });
    } catch (e) {
      if (e instanceof ApiRequestError && e.status === 409 && /already launched/.test(e.message)) return router.push(`/coin/${failed.mint}`);
      setError((e as Error).message);
      setStep(failed);
    }
  }

  async function signAndLaunch(review: Review) {
    if (!signTransaction) return setError("This wallet can't sign transactions. Try another wallet.");
    setStep({ kind: "signing", review });
    let signed: VersionedTransaction;
    try {
      signed = await signTransaction(review.tx);
    } catch (e) {
      const message = (e as Error).message ?? "";
      setError(/reject|declin|cancel/i.test(message) ? "You declined the transaction in your wallet. Nothing was launched." : message);
      return setStep({ kind: "editing" });
    }
    try {
      const signature = await connection.sendRawTransaction(signed.serialize());
      setStep({ kind: "confirming", review, signature });
      const result = await connection.confirmTransaction(
        { signature, blockhash: signed.message.recentBlockhash, lastValidBlockHeight: review.prepared.lastValidBlockHeight },
        "confirmed",
      );
      if (result.value.err) throw new LaunchFailed(onChainError(result.value.err));
      await reportTransaction(signature);
      router.push(`/coin/${review.prepared.mint}`);
    } catch (e) {
      const failure = launchFailure(e);
      setError(failure.message);
      setStep({ kind: "failed", mint: review.prepared.mint, quote: review.quote, uncertain: failure.uncertain });
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!image) return setError("Add an image for your coin.");
    if (!quote?.launchable) return setError("Choose a Quote Asset to pair your coin with.");
    if (options.problem) return setError(options.problem);
    if (!hasAcceptedDisclaimer()) return setDisclaimerOpen(true);
    void prepare();
  }

  const review = step.kind === "reviewing" || step.kind === "signing" || step.kind === "confirming" ? step.review : null;
  const failed = step.kind === "failed" ? step : step.kind === "preparing" ? (step.retrying ?? null) : null;

  return (
    <div className={`shell ${styles.page}`}>
      <form className={styles.form} onSubmit={onSubmit} aria-busy={busy}>
        <h1 className={styles.title}>Launch a coin</h1>

        <fieldset className={styles.fields} disabled={busy}>
          <LaunchType options={options} coin={symbol} />

          <div className={styles.imageRow}>
            <label className={styles.drop}>
              {imageUrl ? <img src={imageUrl} alt="Coin image preview" /> : <span>Add image</span>}
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                className="visually-hidden"
                onChange={(e) => pickImage(e.target.files?.[0])}
              />
            </label>
            <p className={styles.hint}>PNG, JPEG, WebP or GIF, up to 2 MB. Square images look best.</p>
          </div>

          <div className={styles.pairRow}>
            <label className={styles.field}>
              <span>Name</span>
              <input value={name} onChange={(e) => setName(e.target.value)} maxLength={32} required placeholder="Tracer Bullet" />
            </label>
            <label className={styles.field}>
              <span>Ticker</span>
              <input
                value={symbol}
                onChange={(e) => setSymbol(e.target.value.toUpperCase().replace(/[^A-Z0-9$]/g, ""))}
                maxLength={10}
                required
                placeholder="TRCR"
                className={styles.ticker}
              />
            </label>
          </div>

          <QuotePicker quotes={quotes} value={quoteMint} onChange={setQuoteMint} />

          <label className={styles.field}>
            <span>
              Description <em>optional</em>
            </span>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={DESCRIPTION_MAX} rows={3} />
            <small className={styles.counter} aria-hidden>{description.length} / {DESCRIPTION_MAX}</small>
          </label>

          <div className={styles.links}>
            <label className={styles.field}>
              <span>Website <em>optional</em></span>
              <input type="url" value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://" />
            </label>
            <label className={styles.field}>
              <span>X <em>optional</em></span>
              <input type="url" value={x} onChange={(e) => setX(e.target.value)} placeholder="https://x.com/" />
            </label>
            <label className={styles.field}>
              <span>Telegram <em>optional</em></span>
              <input type="url" value={telegram} onChange={(e) => setTelegram(e.target.value)} placeholder="https://t.me/" />
            </label>
          </div>

          <LaunchOptions options={options} coin={symbol} />
        </fieldset>

        <dl className={styles.terms}>
          <div>
            <dt>Graduates at</dt>
            <dd>{quote ? <GraduationTerms quote={quote} /> : "Choose a Quote Asset to see what your coin must raise."}</dd>
          </div>
          <div>
            <dt>You earn</dt>
            <dd>
              {earns.summary}: half of what the platform collects on your coin, sent to your wallet with nothing to claim.
            </dd>
          </div>
        </dl>

        {quote && quote.labels !== null && quote.labels.length > 0 && (
          <details className={styles.labels}>
            <summary>
              {quoteTicker(quote)} has {quote.labels.length} {quote.labels.length === 1 ? "risk label" : "risk labels"}. They inform; none stops a launch.
            </summary>
            <QuoteLabelList quote={quote} />
          </details>
        )}

        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}

        {failed ? (
          <div className={styles.review} role="region" aria-label="Launch not confirmed">
            <p>
              {failed.uncertain
                ? "Trying again checks the chain first: if your coin did launch, you go straight to it. It can never launch twice."
                : "Try again with the same coin, or edit it first."}
            </p>
            <div className={styles.actions}>
              {!failed.uncertain && (
                <button type="button" className={styles.secondary} onClick={() => { setError(null); setStep({ kind: "editing" }); }} disabled={step.kind !== "failed"}>
                  Edit
                </button>
              )}
              <button type="button" className={styles.primary} onClick={() => retry(failed)} disabled={step.kind !== "failed"}>
                {step.kind === "preparing" ? "Checking…" : "Try again"}
              </button>
            </div>
          </div>
        ) : review ? (
          <div className={styles.review} role="region" aria-label="Review your launch">
            <ReviewText review={review} symbol={symbol} platform={platform} />
            <div className={styles.actions}>
              <button type="button" className={styles.secondary} onClick={() => setStep({ kind: "editing" })} disabled={step.kind !== "reviewing"}>
                Edit
              </button>
              <button type="button" className={styles.primary} onClick={() => signAndLaunch(review)} disabled={step.kind !== "reviewing"}>
                {step.kind === "signing" ? "Confirm in your wallet…" : step.kind === "confirming" ? "Launching…" : "Sign and launch"}
              </button>
            </div>
          </div>
        ) : publicKey ? (
          <button type="submit" className={styles.primary} disabled={busy || !quote?.launchable}>
            {step.kind === "preparing" ? "Preparing…" : "Review launch"}
          </button>
        ) : (
          <div className={styles.connect}>
            <p>Connect a wallet to launch. It pays the network fees and becomes the coin&apos;s creator.</p>
            <WalletButton variant="inline" />
          </div>
        )}

        <p className={styles.disclaimer}>
          What you earn is approximate and depends on trading that may never happen. A coin can lose all of its value, and nothing
          here is investment advice.
        </p>
      </form>

      <aside className={styles.preview} aria-label="Preview">
        <span className={styles.previewLabel}>How it will look</span>
        <div className={styles.previewCard}>
          <div className={styles.previewTop}>
            {imageUrl ? <img src={imageUrl} alt="" /> : <div className={styles.previewImage} aria-hidden />}
            <div className={styles.previewTitles}>
              <PairMark base={symbol || "TICKER"} quote={quote ? quoteTicker(quote) : "SOL"} size="lg" />
              <p className={styles.previewName}>{name || "Coin name"}</p>
            </div>
          </div>
          {description && <p className={styles.previewDescription}>{description}</p>}
        </div>
      </aside>

      <Disclaimer
        open={disclaimerOpen}
        onCancel={() => setDisclaimerOpen(false)}
        onAccept={() => {
          setDisclaimerOpen(false);
          void prepare();
        }}
      />
    </div>
  );
}

/** What the launch will do, with every amount in the unit it is paid in. */
function ReviewText({ review, symbol, platform }: { review: Review; symbol: string; platform: PlatformInfo }) {
  const { prepared, quote } = review;
  const ticker = quoteTicker(quote);
  const sol = <strong className="mono">{(review.costLamports / LAMPORTS_PER_SOL).toFixed(4)} SOL</strong>;
  const graduates = (
    <>
      It graduates at <strong>{formatUnits(prepared.graduationTarget.raw, quote.decimals, quote.decimals)} {ticker}</strong> raised.
    </>
  );
  const firstBuy = prepared.firstBuy;
  return (
    <>
      {firstBuy ? (
        <p>
          Launching <strong>{symbol}</strong> paired with {ticker}, with your first buy of{" "}
          <span className="mono">{formatUnits(firstBuy.amountIn, quote.decimals, quote.decimals)}</span> {ticker} for{" "}
          <span className="mono">{formatUnits(firstBuy.amountOut, COIN_DECIMALS, 0)}</span> {symbol} (
          {supplyShare(BigInt(firstBuy.amountOut))} of the supply). {graduates}{" "}
          {isSol(quote) ? (
            <>Your wallet pays about {sol}, including the first buy, network fees and account rent.</>
          ) : (
            <>Your wallet pays the {ticker} and about {sol} in network fees and account rent.</>
          )}{" "}
          Like any trade, the first buy pays the Platform Fee, and half of it,{" "}
          <span className="mono">{formatUnits(creatorShareOf(platform, firstBuy.fees.platform).toString(), quote.decimals, quote.decimals)}</span> {ticker},
          comes back to you as the coin&apos;s creator.
        </p>
      ) : (
        <p>
          Launching <strong>{symbol}</strong> paired with {ticker}. {graduates} Your wallet pays about {sol} in network fees
          and account rent.
        </p>
      )}
      {prepared.rewardTax && (
        <p>
          A Reward Launch: every transfer of {symbol} withholds <strong>{prepared.rewardTax.bps / 100}%</strong> for its holders,
          the first buy&apos;s coins included.{" "}
          {prepared.rewardTax.payout === "coin" ? (
            <>It is paid out in <strong>{symbol}</strong> itself, never sold.</>
          ) : (
            <>It is sold for {ticker} in small slices and paid out in <strong>{ticker}</strong>.</>
          )}{" "}
          Nobody can change the rate or the payout asset, now or later.
        </p>
      )}
      {prepared.airdrop && (
        <p>
          Then send the airdrop from your coin&apos;s page: {prepared.airdrop.recipients}{" "}
          {prepared.airdrop.recipients === 1 ? "wallet gets" : "wallets get"}{" "}
          <span className="mono">{formatUnits(prepared.airdrop.amount, COIN_DECIMALS, COIN_DECIMALS)}</span> {symbol}. Your wallet signs{" "}
          {prepared.airdrop.transactions === 1 ? "one transaction" : `all ${prepared.airdrop.transactions} transactions at once`} and
          pays about{" "}
          <span className="mono">{(Number(prepared.airdrop.costLamports) / LAMPORTS_PER_SOL).toFixed(4)} SOL</span> more in account
          rent and network fees.
        </p>
      )}
    </>
  );
}

/** The Graduation Target in the Quote Asset and, for anything but SOL, what it is worth in SOL today. */
function GraduationTerms({ quote }: { quote: QuoteAsset }) {
  const target = quote.graduationTarget;
  if (!target) return <>{quote.reason}</>;
  const amount = `${formatAmount(target.raw, quote.decimals)} ${quoteTicker(quote)}`;
  // SOL itself: the amount already is the SOL figure.
  if (isSol(quote)) return <>{amount} raised, then moves to Raydium</>;
  return (
    <>
      {amount} raised, worth {formatAmount(target.lamports, SOL_DECIMALS)} SOL today, then moves to Raydium
      <span className={styles.termsNote}>The amount is fixed from {quoteTicker(quote)}&apos;s price when you launch.</span>
    </>
  );
}

/**
 * Turns a failed simulation into something the Creator can act on. `payingQuote` is the Quote Asset's ticker when the
 * launch's first buy spends a Quote Asset other than SOL from the wallet, whose shortfall reads like SOL's otherwise.
 */
function simulationError(err: unknown, logs: string[], payingQuote: string | null) {
  const text = `${JSON.stringify(err)} ${logs.join(" ")}`;
  if (payingQuote && /insufficient funds|"Custom":1\b/.test(text) && !/insufficient lamports|InsufficientFundsForRent/.test(text))
    return `Your wallet doesn't have enough ${payingQuote} for your first buy. Add ${payingQuote} or buy less.`;
  if (/insufficient (lamports|funds)|InsufficientFundsForRent|0x1\b|"Custom":1\b/.test(text))
    return "Your wallet doesn't have enough SOL to pay for the launch. Add SOL and try again.";
  if (/AccountNotFound/.test(text)) return "Your wallet has no SOL yet. Add SOL and try again.";
  return "The launch would fail on-chain, so nothing was sent. Try again in a moment.";
}

// LaunchLab's ExceededSlippage: the First Buy would get fewer coins than quoted, which only happens if the fees changed.
const EXCEEDED_SLIPPAGE = 6004;

/** Why a launch that reached the chain failed there. Nothing was created: the launch and its First Buy are one transaction. */
function onChainError(err: unknown) {
  const text = JSON.stringify(err);
  if (text.includes(`"Custom":${EXCEEDED_SLIPPAGE}`))
    return "Your first buy would have got fewer coins than quoted, because the fees changed. Nothing was created; try again.";
  if (/"Custom":1\b|InsufficientFunds/.test(text)) return "Your wallet didn't have enough SOL for the launch. Nothing was created; add SOL and try again.";
  return "The launch transaction failed on-chain. Nothing was created; try again.";
}

/** A launch that reached the chain and failed there, with the reason in the Creator's words. */
class LaunchFailed extends Error {}

/**
 * Sorts a failure after signing into what is known. The node refusing the transaction (its preflight check failed), the
 * chain failing it, or its blockhash expiring all mean nothing was created. Anything else, such as a dropped connection,
 * leaves it uncertain whether the coin launched.
 */
function launchFailure(e: unknown): { message: string; uncertain: boolean } {
  if (e instanceof LaunchFailed) return { message: e.message, uncertain: false };
  const landed = landedError(e);
  if (landed) return { message: onChainError(JSON.parse(landed)), uncertain: false };
  if (e instanceof TransactionExpiredBlockheightExceededError)
    return { message: "The launch transaction expired before it landed, so nothing was created. Try again.", uncertain: false };
  if (e instanceof SendTransactionError && e.logs) {
    const text = `${e.message} ${e.logs.join(" ")}`;
    return {
      message: /insufficient (lamports|funds)|InsufficientFundsForRent|0x1\b|debit an account/.test(text)
        ? "Your wallet no longer has enough SOL to pay for the launch, so it wasn't sent and nothing was created. Add SOL and try again."
        : "The network refused the launch transaction, so nothing was created. Try again.",
      uncertain: false,
    };
  }
  return {
    message: "We couldn't confirm whether your coin launched. Check your connection, then try again.",
    uncertain: true,
  };
}
