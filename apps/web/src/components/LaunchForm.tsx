"use client";

import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import {
  LAMPORTS_PER_SOL, SendTransactionError, TransactionExpiredBlockheightExceededError, VersionedTransaction,
} from "@solana/web3.js";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { LAUNCH_IMAGE_MAX_BYTES, type PlatformInfo, type PreparedLaunch, type QuoteAsset } from "@launchpad/contract";
import { ApiRequestError, prepareLaunch, reportTransaction, retryLaunch } from "@/lib/api";
import { landedError } from "@/lib/transactions";
import { creatorShareOf, graduationFeeSol } from "@/lib/fees";
import { COIN_DECIMALS, COIN_SUPPLY, formatAmount, formatUnits, isSol, quoteTicker, SOL_DECIMALS } from "@/lib/format";
import { quoteKind } from "@/lib/landing";
import { FIRST_LINKS, LINK_INFO, LINK_KINDS, MORE_LINKS, type LinkKind } from "@/lib/links";
import { Address } from "./Address";
import { useCopyCheck, windowWords, type CopyStatus } from "./CopyCheck";
import { Disclaimer, hasAcceptedDisclaimer } from "./Disclaimer";
import { LaunchOptions, LaunchType, supplyShare, useLaunchOptions } from "./LaunchOptions";
import { LinkIcon, LinkName } from "./LinkIcon";
import { Ring } from "./Mark";
import { PairMark } from "./PairMark";
import { QuoteChooser } from "./QuoteChooser";
import { QuoteLogo } from "./QuoteLogo";
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

/**
 * The form's steps (phase 5, #136): on a phone one step a screen, with the summary as the review step; on a desktop a
 * sticky index over the whole form, every section in view and the summary beside it.
 */
const STEPS = [
  { id: "coin", label: "Coin" },
  { id: "pair", label: "Pair" },
  { id: "launch", label: "Launch" },
  { id: "review", label: "Review" },
] as const;
type StepId = (typeof STEPS)[number]["id"];

/**
 * The launch form, reworked in phase 5 (#136, after the research's section 4 and principle 11): the coin first, with
 * its image at the size it will be seen and a live preview in the summary, the pair as the recommended three plus the
 * full picker, the launch type, the links before the First Buy with the one-line reason, and the summary beside it all
 * with the one action inside it. `initialQuote` is the asset an asset's page sent the Creator here for; the first
 * launchable one otherwise.
 */
export function LaunchForm({
  platform, quotes, initialQuote = null, initialName = "", initialSymbol = "",
}: {
  platform: PlatformInfo;
  quotes: QuoteAsset[];
  initialQuote?: string | null;
  /** From the landing's pair picker (#133, candidate F), already within the form's limits. */
  initialName?: string;
  initialSymbol?: string;
}) {
  const router = useRouter();
  const { connection } = useConnection();
  const { publicKey, signTransaction, wallet } = useWallet();
  const [name, setName] = useState(initialName);
  const [symbol, setSymbol] = useState(initialSymbol);
  const [description, setDescription] = useState("");
  const [links, setLinks] = useState<Record<LinkKind, string>>(() => Object.fromEntries(LINK_KINDS.map((k) => [k, ""])) as Record<LinkKind, string>);
  const [moreLinks, setMoreLinks] = useState(false);
  const [image, setImage] = useState<File | null>(null);
  const [quoteMint, setQuoteMint] = useState(
    () => quotes.find((q) => q.mint === initialQuote && q.launchable)?.mint ?? quotes.find((q) => q.launchable)?.mint ?? null,
  );
  const [step, setStep] = useState<Step>({ kind: "editing" });
  const [current, setCurrent] = useState<StepId>("coin");
  const [error, setError] = useState<string | null>(null);
  const [disclaimerOpen, setDisclaimerOpen] = useState(false);

  const imageUrl = useMemo(() => (image ? URL.createObjectURL(image) : null), [image]);
  useEffect(() => () => { if (imageUrl) URL.revokeObjectURL(imageUrl); }, [imageUrl]);

  const quote = quotes.find((q) => q.mint === quoteMint) ?? null;
  // The launch options work in whichever Quote Asset is chosen: its ticker and decimals, and quotes priced in it.
  const options = useLaunchOptions(quote && { mint: quote.mint, symbol: quoteTicker(quote), decimals: quote.decimals }, publicKey?.toBase58() ?? null);
  const copy = useCopyCheck({ name, symbol, image, creator: publicKey?.toBase58() ?? null });
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
      for (const k of LINK_KINDS) if (links[k].trim()) form.set(k, links[k].trim());
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

  /**
   * On a phone the step is shown alone; on a desktop every step is in view and the index scrolls to it. The scroll is
   * instant for a visitor who asked for less motion (and so for the suite's stilled shots, which caught the sticky
   * summary mid-animation once, 2026-11-02).
   */
  function goTo(id: StepId) {
    setCurrent(id);
    const behavior = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth";
    document.getElementById(`step-${id}`)?.scrollIntoView({ block: "start", behavior });
  }

  const review = step.kind === "reviewing" || step.kind === "signing" || step.kind === "confirming" ? step.review : null;
  const failed = step.kind === "failed" ? step : step.kind === "preparing" ? (step.retrying ?? null) : null;

  const launchable = quotes.filter((q) => q.launchable).length;
  // A step is done once it has what it needs: the coin its three fields, the pair a launchable asset; the launch step
  // is optional, so it is done once something on it was chosen and nothing on it is wrong; the review once prepared.
  const done: Record<StepId, boolean> = {
    coin: image !== null && name.trim() !== "" && symbol.trim() !== "",
    pair: Boolean(quote?.launchable),
    launch: !options.problem && (options.rewardTax !== null || options.firstBuyText.trim() !== "" || LINK_KINDS.some((k) => links[k].trim() !== "")),
    review: review !== null,
  };
  const protection = copy.protectionSeconds !== null ? windowWords(copy.protectionSeconds) : null;

  const coinHint = (
    <>
      The name and ticker go on-chain at launch and never change; the image and description are stored for good on Arweave.
      {protection ? ` Once launched, nobody else can use your coin's name, ticker or image here for ${protection}.` : " A launched coin's name, ticker and image are its own for a while."}
    </>
  );

  return (
    <form className={`shell grid ${styles.page}`} onSubmit={onSubmit} aria-busy={busy} data-step={current}>
      <header className={`col-12 ${styles.head}`}>
        <h1 className={`t-h1 ${styles.title}`}>Stoke a coin</h1>
        <p className={styles.lede}>
          A fixed-supply coin on a Raydium curve, priced in any of the {launchable.toLocaleString("en-US")} assets Raydium quotes. It moves to
          its own Raydium pool at its target, and you earn half of what the platform collects on its trades.
        </p>
      </header>

      {/* The step index: a row of its own across the grid, sticky under the header on every step, the list at the form's width. */}
      <nav className={`col-12 grid ${styles.steps}`} aria-label="Steps">
        <ol className={`col-8 ${styles.stepList}`}>
          {STEPS.map((s, i) => (
            <li key={s.id} className={styles.stepItem} data-done={done[s.id] || undefined}>
              <button type="button" className={styles.stepButton} aria-current={current === s.id ? "step" : undefined} onClick={() => goTo(s.id)}>
                <span className={styles.stepNumber} aria-hidden>{done[s.id] && current !== s.id ? <Tick /> : i + 1}</span>
                <span className={styles.stepLabel}>{s.label}</span>
              </button>
            </li>
          ))}
        </ol>
      </nav>

      <div className={`col-8 ${styles.main}`}>
        <fieldset className={`card ${styles.card}`} disabled={busy}>
          {/* 1. The coin: its image at the size the site shows it, the name and the ticker, each checked for a copy as it is typed. */}
          <section id="step-coin" className={styles.block} data-step="coin" aria-labelledby="block-coin" aria-busy={copy.pending}>
            <SectionHead id="block-coin" title="Your coin" hint={coinHint} />
            <div className={styles.coinRow}>
              <div className={styles.dropCell}>
                <label className={`${styles.drop} ${imageUrl ? styles.dropFilled : ""}`}>
                  {imageUrl ? (
                    <img src={imageUrl} alt="Coin image preview" />
                  ) : (
                    <span className={styles.dropEmpty}>
                      <span className={styles.dropPlus} aria-hidden />
                      <span>Add image</span>
                      <span className={styles.dropHint}>PNG, JPEG, WebP or GIF, square, up to 2 MB</span>
                    </span>
                  )}
                  <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="visually-hidden" onChange={(e) => pickImage(e.target.files?.[0])} />
                </label>
                <CheckLine status={copy.image.status} text={copy.image.text} field="image" />
              </div>
              <div className={styles.coinFields}>
                <CheckedField id="coin-name" label="Name" status={copy.name.status} text={copy.name.text} field="name">
                  <input id="coin-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={32} required placeholder="Tracer Bullet" aria-describedby="coin-name-check" />
                </CheckedField>
                <CheckedField id="coin-symbol" label="Ticker" status={copy.symbol.status} text={copy.symbol.text} field="symbol">
                  <input
                    id="coin-symbol"
                    value={symbol}
                    onChange={(e) => setSymbol(e.target.value.toUpperCase().replace(/[^A-Z0-9$]/g, ""))}
                    maxLength={10}
                    required
                    placeholder="TRCR"
                    className={styles.ticker}
                    aria-describedby="coin-symbol-check"
                  />
                </CheckedField>
                <p className={styles.hint}>A name up to 32 characters, a ticker up to 10.</p>
              </div>
            </div>
            <div className={styles.field}>
              <label htmlFor="coin-description">
                Description <em>optional</em>
              </label>
              <textarea id="coin-description" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={DESCRIPTION_MAX} rows={3} />
              <small className={styles.counter} aria-hidden>{description.length} / {DESCRIPTION_MAX}</small>
            </div>
            <StepNav next="pair" onGo={goTo} />
          </section>

          {/* 2. The pair: the recommended three and the way to the rest. */}
          <section id="step-pair" className={styles.block} data-step="pair" aria-labelledby="block-pair">
            <SectionHead id="block-pair" title="Paired with" hint="The asset your coin is priced and traded in. Every trade pays in it, and so does your share." />
            <QuoteChooser quotes={quotes} value={quoteMint} onChange={setQuoteMint} />
            <StepNav back="coin" next="launch" onGo={goTo} />
          </section>

          {/* 3. How it launches: the type, the links before the First Buy, then the First Buy itself. */}
          <section id="step-launch" className={styles.block} data-step="launch" aria-labelledby="block-type">
            <SectionHead id="block-type" title="Launch type" hint="A standard coin, or a Reward Launch that withholds a tax on every transfer and pays it to the coin's holders." />
            <LaunchType options={options} coin={symbol} labelId="block-type" />
          </section>
          <section className={styles.block} data-step="launch" aria-labelledby="block-links">
            <SectionHead
              id="block-links"
              title="Links"
              optional
              hint="Coins with a Telegram graduated nine times as often as those without, in a study of 832,941 launches. Saved in the coin's permanent metadata and shown on its page."
            />
            <div className={styles.links}>
              {FIRST_LINKS.map((k) => (
                <LinkField key={k} kind={k} value={links[k]} onChange={(v) => setLinks((l) => ({ ...l, [k]: v }))} />
              ))}
            </div>
            {/* The rest wait behind one button, so the step stays short for the coin that has only a Telegram. */}
            {moreLinks || MORE_LINKS.some((k) => links[k].trim() !== "") ? (
              <div className={styles.links}>
                {MORE_LINKS.map((k) => (
                  <LinkField key={k} kind={k} value={links[k]} onChange={(v) => setLinks((l) => ({ ...l, [k]: v }))} />
                ))}
              </div>
            ) : (
              <button type="button" className={`button button-ghost ${styles.moreLinks}`} onClick={() => setMoreLinks(true)}>
                More links: {MORE_LINKS.map((k) => LINK_INFO[k].label).join(", ")}
              </button>
            )}
          </section>
          <section className={styles.block} data-step="launch" aria-labelledby="block-options">
            <SectionHead id="block-options" title="First buy" optional hint="Your own buy inside the launch transaction itself, so nobody can buy before you; for allowed creators, an airdrop paid from it." />
            <LaunchOptions options={options} coin={symbol} />
            <StepNav back="pair" next="review" onGo={goTo} />
          </section>
        </fieldset>
      </div>

      {/* The summary: what the coin is and the terms it launches on, with the one action inside it; the review step on a phone. */}
      <aside id="step-review" className={`col-4 ${styles.side}`} aria-label="Launch summary">
        <Summary
          platform={platform}
          quote={quote}
          symbol={symbol}
          name={name}
          imageUrl={imageUrl}
          options={options}
          links={links}
          review={review}
          step={step}
          failed={failed}
          error={error}
          connected={publicKey !== null}
          walletName={wallet?.adapter.name ?? null}
          onEdit={() => { setError(null); setStep({ kind: "editing" }); }}
          onRetry={() => failed && retry(failed)}
          onSign={() => review && signAndLaunch(review)}
          onBack={() => goTo("launch")}
        />
      </aside>

      <Disclaimer
        open={disclaimerOpen}
        onCancel={() => setDisclaimerOpen(false)}
        onAccept={() => {
          setDisclaimerOpen(false);
          void prepare();
        }}
      />
    </form>
  );
}

/** A tick drawn from two borders, for a done step. */
function Tick() {
  return <span className={styles.tick} />;
}

/** A section's head: its title (the section's accessible name) and a line of hint. */
function SectionHead({ id, title, hint, optional = false }: { id: string; title: string; hint: ReactNode; optional?: boolean }) {
  return (
    <div className={styles.blockHead}>
      <h2 id={id} className="t-h3">
        {title}
        {optional && <em>optional</em>}
      </h2>
      <p>{hint}</p>
    </div>
  );
}

/** The step's foot on a phone: back, and on to the next step. On a desktop every step is in view and this is not shown. */
function StepNav({ back, next, onGo }: { back?: StepId; next: StepId; onGo: (id: StepId) => void }) {
  const label = STEPS.find((s) => s.id === next)!.label;
  return (
    <div className={styles.stepNav}>
      {back && <button type="button" className="button button-ghost" onClick={() => onGo(back)}>Back</button>}
      <button type="button" className="button button-primary" onClick={() => onGo(next)}>Next: {label}</button>
    </div>
  );
}

/** One link's field: the network's mark at the head of the well, the address after it. */
function LinkField({ kind, value, onChange }: { kind: LinkKind; value: string; onChange: (value: string) => void }) {
  const info = LINK_INFO[kind];
  return (
    <div className={styles.field}>
      <label htmlFor={`coin-${kind}`}>{info.label}</label>
      <span className={`input ${styles.linkWell}`}>
        <LinkIcon kind={kind} size={16} className={styles.linkMark} />
        <input id={`coin-${kind}`} type="url" value={value} onChange={(e) => onChange(e.target.value)} placeholder={info.placeholder} />
      </span>
    </div>
  );
}

/** A field with the copy check's mark at its end and the verdict under it once the field has a value. */
function CheckedField({ id, label, status, text, field, children }: { id: string; label: string; status: CopyStatus; text: string | null; field: string; children: ReactNode }) {
  return (
    <div className={styles.field} data-check={status}>
      <label htmlFor={id}>{label}</label>
      <span className={`input ${styles.checked}`}>
        {children}
        {status !== "empty" && <span className={styles.mark} data-status={status} aria-hidden />}
      </span>
      <CheckLine status={status} text={text} field={field} id={`${id}-check`} />
    </div>
  );
}

/** The verdict's line: "Free", or who holds the name and until when. Nothing until the field has a value. */
function CheckLine({ status, text, field, id }: { status: CopyStatus; text: string | null; field: string; id?: string }) {
  if (status === "empty" || !text) return null;
  return (
    <p id={id} className={styles.check} data-status={status} data-field={field}>
      {text}
    </p>
  );
}

/** The seconds since something started, for the status line while a launch confirms. */
function useElapsed(running: boolean) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    if (!running) {
      setSeconds(0);
      return;
    }
    const started = Date.now();
    const timer = setInterval(() => setSeconds(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(timer);
  }, [running]);
  return seconds;
}

type SummaryProps = {
  platform: PlatformInfo;
  quote: QuoteAsset | null;
  symbol: string;
  name: string;
  imageUrl: string | null;
  options: ReturnType<typeof useLaunchOptions>;
  links: Record<LinkKind, string>;
  review: Review | null;
  step: Step;
  failed: Failed | null;
  error: string | null;
  connected: boolean;
  walletName: string | null;
  onEdit: () => void;
  onRetry: () => void;
  onSign: () => void;
  onBack: () => void;
};

/**
 * The launch summary (the research's best component, kept): the coin's preview from the form's own fields, the terms
 * it launches on, every one fixed at launch, and the action. It stays in view beside the form and fits a laptop's
 * screen; when it must scroll, a fade says so. Once prepared it is the review: what the wallet pays and what the
 * first buy gets, then the signing step, styled like nothing else on the page, and the status while the launch lands.
 */
function Summary({
  platform, quote, symbol, name, imageUrl, options, links, review, step, failed, error, connected, walletName, onEdit, onRetry, onSign, onBack,
}: SummaryProps) {
  const ticker = quote ? quoteTicker(quote) : null;
  const scroller = useRef<HTMLDivElement>(null);
  const [fade, setFade] = useState(false);
  const elapsed = useElapsed(step.kind === "confirming");

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const update = () => setFade(el.scrollHeight - el.scrollTop - el.clientHeight > 8);
    update();
    el.addEventListener("scroll", update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(el);
    if (el.firstElementChild) observer.observe(el.firstElementChild);
    return () => {
      el.removeEventListener("scroll", update);
      observer.disconnect();
    };
  }, []);

  // The review, a failure or an error appears at the card's foot: bring it into view, inside the card and on the page.
  const outcome = useRef<HTMLDivElement>(null);
  const outcomeKey = review ? "review" : failed ? "failed" : error ? "error" : null;
  useEffect(() => {
    if (outcomeKey) outcome.current?.scrollIntoView({ block: "nearest" });
  }, [outcomeKey]);

  const cost = review ? `${(review.costLamports / LAMPORTS_PER_SOL).toFixed(4)} SOL` : null;
  const firstBuy = options.firstBuyQuote;
  // Market cap once the first buy has landed: the price it leaves the curve at, times the fixed supply, in the Quote Asset.
  const capAfter = firstBuy && quote ? (firstBuy.priceAfter * COIN_SUPPLY).toLocaleString("en-US", { maximumSignificantDigits: 4 }) : null;
  const fee = graduationFeeSol(platform);

  return (
    <div className={styles.summary} data-fade={fade || undefined}>
      <div ref={scroller} className={styles.summaryScroll}>
        <div className={`card card-raised ${styles.summaryCard}`}>
          <div className={styles.summaryHead}>
            <p className={`eyebrow ${styles.summaryEyebrow}`} aria-hidden>Launch summary</p>
            <span className={`tag ${styles.fixedTag}`}>Fixed at launch</span>
          </div>

          <div className={styles.preview}>
            {imageUrl ? <img src={imageUrl} alt="" /> : <div className={styles.previewImage} aria-hidden />}
            <div className={styles.previewTitles}>
              <PairMark base={symbol || "TICKER"} quote={ticker ?? "SOL"} size="lg" />
              <p className={styles.previewName}>{name || "Coin name"}</p>
            </div>
          </div>

          <dl className={styles.facts}>
            <div>
              <dt>Priced in</dt>
              <dd>
                {quote ? (
                  <span className={styles.pricedIn}>
                    <QuoteLogo quote={quote} size={16} />
                    {ticker}
                    <span className={styles.factNote}>{quoteKind(quote)}</span>
                  </span>
                ) : (
                  "Choose a Quote Asset"
                )}
              </dd>
            </div>
            <div>
              <dt>Graduates at</dt>
              <dd>{quote ? <GraduationTerms quote={quote} /> : "Choose a Quote Asset to see what your coin must raise."}</dd>
            </div>
            <div>
              <dt>Supply</dt>
              <dd>
                <span className="mono">{COIN_SUPPLY.toLocaleString("en-US")}</span> {symbol || "coins"}, fixed
              </dd>
            </div>
            <div>
              <dt>Launch type</dt>
              <dd>
                {options.rewardTax === null ? (
                  <>
                    Standard coin
                    <span className={styles.factNote}>no transfer tax</span>
                  </>
                ) : (
                  <>
                    Reward Launch
                    <span className={styles.factNote}>
                      {options.rewardTax / 100}% of every transfer to holders in {options.rewardPayout === "coin" ? symbol || "the coin" : (ticker ?? "the Quote Asset")}
                    </span>
                  </>
                )}
              </dd>
            </div>
            {firstBuy && quote && (
              <div>
                <dt>First buy</dt>
                <dd>
                  <span>
                    <span className="mono">{formatUnits(firstBuy.amountIn, quote.decimals, quote.decimals)}</span> {ticker} for{" "}
                    <span className="mono">{formatUnits(firstBuy.amountOut, COIN_DECIMALS, 0)}</span> {symbol || "coins"}
                  </span>
                  <span className={styles.factNote}>
                    {supplyShare(BigInt(firstBuy.amountOut))} of the supply; market cap after it <span className="mono">{capAfter}</span> {ticker}
                  </span>
                </dd>
              </div>
            )}
            {LINK_KINDS.some((k) => links[k].trim() !== "") && (
              <div>
                <dt>Links</dt>
                <dd>
                  <span className={styles.linkRow}>
                    {LINK_KINDS.filter((k) => links[k].trim() !== "").map((k) => (
                      <span key={k} className={styles.linkChip}>
                        <LinkIcon kind={k} size={14} />
                        <LinkName kind={k} />
                      </span>
                    ))}
                  </span>
                </dd>
              </div>
            )}
            <div>
              <dt>Fees</dt>
              <dd>
                <span>You earn half of what the platform collects on every trade</span>
                <details className={styles.feeDetails}>
                  <summary className={styles.factNote}>How the fees work</summary>
                  <span className={styles.factNote}>
                    Every trade pays a fee to Raydium and to the platform, on the curve and after graduation. Half of the platform&apos;s share is sent to your wallet in {ticker ?? "the Quote Asset"}, nothing to claim. No fee to launch
                    {fee ? `; ${fee}'s worth comes out of your earnings once the coin graduates` : ""}.{" "}
                    <Link href="/fees" className={styles.factLink}>Every fee, explained</Link>
                  </span>
                </details>
              </dd>
            </div>
            <div>
              <dt>Launch cost</dt>
              <dd>
                {review ? (
                  <>
                    <span className="mono">{cost}</span>
                    <span className={styles.factNote}>
                      {review.prepared.firstBuy && isSol(review.quote) ? "your first buy, network fees and account rent" : "network fees and account rent"}
                    </span>
                  </>
                ) : (
                  <>
                    Network fees and rent
                    <span className={styles.factNote}>no platform fee to launch; the figure comes with the review</span>
                  </>
                )}
              </dd>
            </div>
          </dl>

          <ul className={styles.trust}>
            <li>Liquidity locked for good once it graduates</li>
            <li>Image and metadata stored permanently on Arweave</li>
            <li>Every payment to you on the public ledger</li>
          </ul>

          <div ref={outcome} className={styles.action}>
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
                    <button type="button" className="button button-ghost button-lg" onClick={onEdit} disabled={step.kind !== "failed"}>
                      Edit
                    </button>
                  )}
                  <button type="button" className={`button button-primary button-lg ${styles.primary}`} onClick={onRetry} disabled={step.kind !== "failed"}>
                    {step.kind === "preparing" ? "Checking…" : "Try again"}
                  </button>
                </div>
              </div>
            ) : review ? (
              <div className={styles.review} role="region" aria-label="Review your launch">
                <ReviewText review={review} symbol={symbol} platform={platform} />
                {step.kind === "signing" ? (
                  <div className={styles.signing} role="status">
                    <Ring size={28} className={styles.signingRing} />
                    <p className={styles.signingTitle}>{walletName ? `Confirm in ${walletName}` : "Confirm in your wallet"}</p>
                    <p className={styles.signingText}>You sign in your wallet. Stoker never holds your funds.</p>
                    <dl className={styles.signingAmounts}>
                      <div>
                        <dt>Your wallet pays</dt>
                        <dd className="mono">{cost}</dd>
                      </div>
                      {review.prepared.firstBuy && !isSol(review.quote) && (
                        <div>
                          <dt>First buy</dt>
                          <dd className="mono">{formatUnits(review.prepared.firstBuy.amountIn, review.quote.decimals, review.quote.decimals)} {quoteTicker(review.quote)}</dd>
                        </div>
                      )}
                    </dl>
                  </div>
                ) : step.kind === "confirming" ? (
                  <div className={styles.status} role="status">
                    <span className={styles.statusDot} aria-hidden />
                    <span className={styles.statusText}>
                      Launching {symbol}, <span className="mono">{elapsed}s</span>
                    </span>
                    <Address value={step.signature} kind="tx" platform={platform} className={styles.statusLink} />
                  </div>
                ) : (
                  <div className={styles.actions}>
                    <button type="button" className="button button-ghost button-lg" onClick={onEdit} disabled={step.kind !== "reviewing"}>
                      Edit
                    </button>
                    <button type="button" className={`button button-primary button-lg ${styles.primary}`} onClick={onSign} disabled={step.kind !== "reviewing"}>
                      Stoke {symbol} for {cost}
                    </button>
                  </div>
                )}
              </div>
            ) : connected ? (
              <button type="submit" className={`button button-primary button-lg ${styles.primary}`} disabled={step.kind !== "editing" || !quote?.launchable}>
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
            <div className={styles.stepNav}>
              <button type="button" className="button button-ghost" onClick={onBack} disabled={step.kind !== "editing"}>Back</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** The Graduation Fee (ADR 0015), in the review's words: what the platform keeps of the Creator's earnings once the coin graduates. */
function graduationFeeNote(platform: PlatformInfo, ticker: string) {
  const fee = graduationFeeSol(platform);
  return fee ? ` Once it graduates, ${fee}'s worth of ${ticker} comes out of your earnings on it as the Graduation Fee, never out of your wallet.` : "";
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
          comes back to you as the coin&apos;s creator.{graduationFeeNote(platform, ticker)}
        </p>
      ) : (
        <p>
          Launching <strong>{symbol}</strong> paired with {ticker}. {graduates} Your wallet pays about {sol} in network fees
          and account rent.{graduationFeeNote(platform, ticker)}
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
