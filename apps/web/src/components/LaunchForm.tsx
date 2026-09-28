"use client";

import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { LAMPORTS_PER_SOL, VersionedTransaction } from "@solana/web3.js";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { LAUNCH_IMAGE_MAX_BYTES, type PlatformInfo, type PreparedLaunch, type QuoteAsset } from "@launchpad/contract";
import { prepareLaunch, reportTransaction } from "@/lib/api";
import { formatAmount, formatUnits, isSol, quoteTicker, SOL_DECIMALS } from "@/lib/format";
import { Disclaimer, hasAcceptedDisclaimer } from "./Disclaimer";
import { PairMark } from "./PairMark";
import { QuotePicker } from "./QuotePicker";
import { WalletButton } from "./WalletButton";
import styles from "./LaunchForm.module.css";

type Review = { prepared: PreparedLaunch; quote: QuoteAsset; tx: VersionedTransaction; costLamports: number };
type Step =
  | { kind: "editing" }
  | { kind: "preparing" }
  | { kind: "reviewing"; review: Review }
  | { kind: "signing"; review: Review }
  | { kind: "confirming"; review: Review; signature: string };

const DESCRIPTION_MAX = 1000;

export function LaunchForm({ platform, quotes }: { platform: PlatformInfo; quotes: QuoteAsset[] }) {
  const router = useRouter();
  const { connection } = useConnection();
  const { publicKey, signTransaction } = useWallet();
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
  const busy = step.kind !== "editing";

  function pickImage(file: File | undefined) {
    setError(null);
    if (!file) return setImage(null);
    if (file.size > LAUNCH_IMAGE_MAX_BYTES) return setError("The image is larger than 2 MB. Choose a smaller one.");
    setImage(file);
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
      form.set("image", image!);
      const prepared = await prepareLaunch(form);
      const tx = VersionedTransaction.deserialize(Uint8Array.from(atob(prepared.transaction), (c) => c.charCodeAt(0)));

      // Simulate before asking for a signature, so the review shows what the wallet will actually pay.
      const sim = await connection.simulateTransaction(tx, {
        sigVerify: false,
        accounts: { addresses: [publicKey.toBase58()], encoding: "base64" },
      });
      if (sim.value.err) throw new Error(simulationError(sim.value.err, sim.value.logs ?? []));
      const before = await connection.getBalance(publicKey, "confirmed");
      // The simulated balance already has the network fee taken off.
      const after = sim.value.accounts?.[0]?.lamports ?? before;
      setStep({ kind: "reviewing", review: { prepared, quote, tx, costLamports: before - after } });
    } catch (e) {
      setError((e as Error).message);
      setStep({ kind: "editing" });
    }
  }

  async function signAndLaunch(review: Review) {
    if (!signTransaction) return setError("This wallet can't sign transactions. Try another wallet.");
    setStep({ kind: "signing", review });
    try {
      const signed = await signTransaction(review.tx);
      const signature = await connection.sendRawTransaction(signed.serialize());
      setStep({ kind: "confirming", review, signature });
      const result = await connection.confirmTransaction(
        { signature, blockhash: signed.message.recentBlockhash, lastValidBlockHeight: review.prepared.lastValidBlockHeight },
        "confirmed",
      );
      if (result.value.err) throw new Error("The launch transaction failed on-chain. Nothing was created; try again.");
      await reportTransaction(signature);
      router.push(`/coin/${review.prepared.mint}`);
    } catch (e) {
      const message = (e as Error).message ?? "";
      setError(/reject|declin|cancel/i.test(message) ? "You declined the transaction in your wallet. Nothing was launched." : message);
      setStep({ kind: "editing" });
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!image) return setError("Add an image for your coin.");
    if (!quote?.launchable) return setError("Choose a Quote Asset to pair your coin with.");
    if (!hasAcceptedDisclaimer()) return setDisclaimerOpen(true);
    void prepare();
  }

  const review = step.kind === "reviewing" || step.kind === "signing" || step.kind === "confirming" ? step.review : null;

  return (
    <div className={`shell ${styles.page}`}>
      <form className={styles.form} onSubmit={onSubmit} aria-busy={busy}>
        <h1 className={styles.title}>Launch a coin</h1>

        <fieldset className={styles.fields} disabled={busy}>
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
        </fieldset>

        <dl className={styles.terms}>
          <div>
            <dt>Graduates at</dt>
            <dd>{quote ? <GraduationTerms quote={quote} /> : "Choose a Quote Asset to see what your coin must raise."}</dd>
          </div>
          <div>
            <dt>You earn</dt>
            <dd>{platform.creatorFeeBps / 100}% of every trade until graduation, claimable on-chain</dd>
          </div>
        </dl>

        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}

        {review ? (
          <div className={styles.review} role="region" aria-label="Review your launch">
            <p>
              Launching <strong>{symbol}</strong> paired with {quoteTicker(review.quote)}. It graduates at{" "}
              <strong>{formatUnits(review.prepared.graduationTarget.raw, review.quote.decimals, review.quote.decimals)} {quoteTicker(review.quote)}</strong>{" "}
              raised. Your wallet pays about{" "}
              <strong className="mono">{(review.costLamports / LAMPORTS_PER_SOL).toFixed(4)} SOL</strong> in network fees
              and account rent.
            </p>
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

/** Turns a failed simulation into something the Creator can act on. */
function simulationError(err: unknown, logs: string[]) {
  const text = `${JSON.stringify(err)} ${logs.join(" ")}`;
  if (/insufficient (lamports|funds)|InsufficientFundsForRent|0x1\b/.test(text))
    return "Your wallet doesn't have enough SOL to pay for the launch. Add SOL and try again.";
  if (/AccountNotFound/.test(text)) return "Your wallet has no SOL yet. Add SOL and try again.";
  return "The launch would fail on-chain, so nothing was sent. Try again in a moment.";
}
