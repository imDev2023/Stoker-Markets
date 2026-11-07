"use client";

import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import {
  LAMPORTS_PER_SOL, SendTransactionError, TransactionExpiredBlockheightExceededError, VersionedTransaction,
} from "@solana/web3.js";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { LAUNCH_IMAGE_MAX_BYTES, type PlatformInfo, type PreparedLaunch, type QuoteAsset, type TradeQuote } from "@launchpad/contract";
import { ApiRequestError, getLaunchQuote, prepareLaunch, reportTransaction, retryLaunch } from "@/lib/api";
import { landedError } from "@/lib/transactions";
import { graduationFeeSol } from "@/lib/fees";
import { COIN_DECIMALS, COIN_SUPPLY, formatAmount, formatUnits, isSol, quoteTicker } from "@/lib/format";
import { FIRST_LINKS, LINK_INFO, LINK_KINDS, MORE_LINKS, type LinkKind } from "@/lib/links";
import { Address } from "./Address";
import { CoinCard, type CoinCardData } from "./CoinCard";
import { useCopyCheck, type CopyStatus } from "./CopyCheck";
import { Disclaimer, hasAcceptedDisclaimer } from "./Disclaimer";
import { LaunchOptions, LaunchType, supplyShare, useLaunchOptions, type LaunchOptionsState } from "./LaunchOptions";
import { Ring } from "./Mark";
import { QuoteChooser } from "./QuoteChooser";
import { WalletButton } from "./WalletButton";
import styles from "./LaunchForm.module.css";

/** A prepared launch, simulated: the transaction the wallet signs and what it costs the wallet in SOL. */
type Prepared = { prepared: PreparedLaunch; quote: QuoteAsset; tx: VersionedTransaction; costLamports: number };
/**
 * An attempt that was signed and handed to the network but did not visibly land. Trying again prepares the same coin,
 * so it can never launch twice. While it is `uncertain` whether it landed, the Creator can't start over with a new coin.
 */
type Failed = { kind: "failed"; mint: string; quote: QuoteAsset; uncertain: boolean };
type Step =
  | { kind: "editing" }
  | { kind: "preparing"; retrying: Failed | null }
  | { kind: "signing"; launch: Prepared }
  | { kind: "confirming"; launch: Prepared; signature: string }
  | Failed;

const DESCRIPTION_MAX = 1000;

/**
 * The launch form after new-stoker's launch page (#172; the owner's answer of 2026-11-06: its look and layout in this
 * site's colours and type). One page without steps: the coin, the pair, the launch type, the links and the First Buy
 * as plain headed sections, and beside them the summary, which is the review and holds the one action: a preview of the
 * coin as the site's coin card draws it, the terms it launches on, and "Stoke TRCR", which prepares the launch on the
 * server, simulates it, and asks the wallet to sign while the signing panel says what it pays; then it sends, waits for
 * the chain, reports the transaction for indexing and opens the coin's page. On a phone the summary follows the form.
 * `initialQuote` is the asset an asset's page sent the Creator here for; the first launchable one otherwise.
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
  const [error, setError] = useState<string | null>(null);
  const [disclaimerOpen, setDisclaimerOpen] = useState(false);

  const imageUrl = useMemo(() => (image ? URL.createObjectURL(image) : null), [image]);
  useEffect(() => () => { if (imageUrl) URL.revokeObjectURL(imageUrl); }, [imageUrl]);

  const quote = quotes.find((q) => q.mint === quoteMint) ?? null;
  // The launch options work in whichever Quote Asset is chosen: its ticker and decimals, and quotes priced in it.
  const options = useLaunchOptions(quote && { mint: quote.mint, symbol: quoteTicker(quote), decimals: quote.decimals }, publicKey?.toBase58() ?? null);
  const copy = useCopyCheck({ name, symbol, image, creator: publicKey?.toBase58() ?? null });
  const launchPrice = useLaunchPrice(quote);
  const failed = step.kind === "failed" ? step : step.kind === "preparing" ? step.retrying : null;
  const busy = step.kind !== "editing" && step.kind !== "failed";

  function pickImage(file: File | undefined) {
    setError(null);
    if (!file) return;
    if (file.size > LAUNCH_IMAGE_MAX_BYTES) return setError("The image is larger than 2 MB. Choose a smaller one.");
    setImage(file);
  }

  /** Simulates a prepared launch before any signature is asked for, so the signing panel shows what the wallet really pays. */
  async function simulate(prepared: PreparedLaunch, launchQuote: QuoteAsset): Promise<Prepared> {
    if (!publicKey) throw new Error("Connect a wallet to launch.");
    const tx = VersionedTransaction.deserialize(Uint8Array.from(atob(prepared.transaction), (c) => c.charCodeAt(0)));
    const sim = await connection.simulateTransaction(tx, {
      sigVerify: false,
      accounts: { addresses: [publicKey.toBase58()], encoding: "base64" },
    });
    if (sim.value.err) throw new Error(simulationError(sim.value.err, sim.value.logs ?? [], prepared.firstBuy && !isSol(launchQuote) ? quoteTicker(launchQuote) : null));
    const before = await connection.getBalance(publicKey, "confirmed");
    // The simulated balance already has the network fee taken off.
    const after = sim.value.accounts?.[0]?.lamports ?? before;
    return { prepared, quote: launchQuote, tx, costLamports: before - after };
  }

  /** The one action: prepares (or prepares the same coin again), simulates, has the wallet sign, sends, confirms, reports, then opens the coin. */
  async function launch(prepare: () => Promise<PreparedLaunch>, launchQuote: QuoteAsset, retrying: Failed | null) {
    if (!signTransaction) return setError("This wallet can't sign transactions. Try another wallet.");
    setError(null);
    setStep({ kind: "preparing", retrying });
    let ready: Prepared;
    try {
      ready = await simulate(await prepare(), launchQuote);
    } catch (e) {
      // A retry of a coin that landed after all goes to it.
      if (retrying && e instanceof ApiRequestError && e.status === 409 && /already launched/.test(e.message)) return router.push(`/coin/${retrying.mint}`);
      setError((e as Error).message);
      return setStep(retrying ?? { kind: "editing" });
    }

    setStep({ kind: "signing", launch: ready });
    let signed: VersionedTransaction;
    try {
      signed = await signTransaction(ready.tx);
    } catch (e) {
      const message = (e as Error).message ?? "";
      setError(/reject|declin|cancel/i.test(message) ? "You declined the transaction in your wallet. Nothing was launched." : message);
      return setStep(retrying ?? { kind: "editing" });
    }
    try {
      const signature = await connection.sendRawTransaction(signed.serialize());
      setStep({ kind: "confirming", launch: ready, signature });
      const result = await connection.confirmTransaction(
        { signature, blockhash: signed.message.recentBlockhash, lastValidBlockHeight: ready.prepared.lastValidBlockHeight },
        "confirmed",
      );
      if (result.value.err) throw new LaunchFailed(onChainError(result.value.err));
      await reportTransaction(signature);
      router.push(`/coin/${ready.prepared.mint}`);
    } catch (e) {
      const failure = launchFailure(e);
      setError(failure.message);
      setStep({ kind: "failed", mint: ready.prepared.mint, quote: ready.quote, uncertain: failure.uncertain });
    }
  }

  function start() {
    if (!publicKey || !quote) return;
    const form = new FormData();
    form.set("creator", publicKey.toBase58());
    form.set("quoteMint", quote.mint);
    form.set("name", name.trim());
    form.set("symbol", symbol.trim());
    form.set("description", description.trim());
    for (const k of LINK_KINDS) if (links[k].trim()) form.set(k, links[k].trim());
    for (const [k, v] of options.fields()) form.set(k, v);
    form.set("image", image!);
    void launch(() => prepareLaunch(form), quote, null);
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError(null);
    if (failed) return void launch(() => retryLaunch(failed.mint), failed.quote, failed);
    if (!image) return setError("Add an image for your coin.");
    if (!quote?.launchable) return setError("Choose a Quote Asset to pair your coin with.");
    if (options.problem) return setError(options.problem);
    if (!hasAcceptedDisclaimer()) return setDisclaimerOpen(true);
    start();
  }

  const side = useStickySide();
  const ticker = quote ? quoteTicker(quote) : null;
  const preview = previewCard({ imageUrl, symbol, name, quote, firstBuy: options.firstBuyQuote, launchPrice, rewardTax: options.rewardTax });
  // While a launch is in flight or uncertain, nothing on the form may change under it.
  const locked = busy || failed !== null;

  return (
    <form className={`shell grid ${styles.page}`} onSubmit={onSubmit} aria-busy={busy}>
      <header className={`col-12 ${styles.head}`}>
        <h1 className={`t-h1 ${styles.title}`}>Stoke a coin</h1>
      </header>

      <fieldset className={`col-8 ${styles.form}`} disabled={locked}>
        {/* The coin: the image, then the name and the ticker, each checked for a copy as it is typed. */}
        <section className={styles.set} aria-labelledby="block-coin" aria-busy={copy.pending}>
          <h2 id="block-coin" className={`t-h3 ${styles.legend}`}>Your coin</h2>
          <div className={styles.field}>
            <label className={styles.drop} data-filled={imageUrl ? true : undefined}>
              {imageUrl ? (
                <>
                  <img className={styles.dropImage} src={imageUrl} alt="Coin image preview" />
                  <span>Change image</span>
                </>
              ) : (
                <span>Add image</span>
              )}
              <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="visually-hidden" onChange={(e) => pickImage(e.target.files?.[0])} />
            </label>
            <CheckLine status={copy.image.status} text={copy.image.text} field="image" />
          </div>
          <div className={styles.two}>
            <CheckedField id="coin-name" label="Name" status={copy.name.status} text={copy.name.text} field="name">
              <input id="coin-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={32} required placeholder="Tracer Bullet" autoComplete="off" aria-describedby="coin-name-check" />
            </CheckedField>
            <CheckedField id="coin-symbol" label="Ticker" status={copy.symbol.status} text={copy.symbol.text} field="symbol">
              <input
                id="coin-symbol"
                value={symbol}
                onChange={(e) => setSymbol(e.target.value.toUpperCase().replace(/[^A-Z0-9$]/g, ""))}
                maxLength={10}
                required
                placeholder="TRCR"
                autoComplete="off"
                spellCheck={false}
                aria-describedby="coin-symbol-check"
              />
            </CheckedField>
          </div>
          <div className={styles.field}>
            <label htmlFor="coin-description">Description</label>
            <span className={`input ${styles.area}`}>
              <textarea id="coin-description" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={DESCRIPTION_MAX} rows={3} />
            </span>
          </div>
        </section>

        <section className={styles.set} aria-labelledby="block-pair">
          <h2 id="block-pair" className={`t-h3 ${styles.legend}`}>Paired with</h2>
          <QuoteChooser quotes={quotes} value={quoteMint} onChange={setQuoteMint} labelId="block-pair" />
        </section>

        <section className={styles.set} aria-labelledby="block-type">
          <h2 id="block-type" className={`t-h3 ${styles.legend}`}>Launch type</h2>
          <LaunchType options={options} coin={symbol} labelId="block-type" />
        </section>

        <section className={styles.set} aria-labelledby="block-links">
          <h2 id="block-links" className={`t-h3 ${styles.legend}`}>Links</h2>
          {/* Telegram and X side by side, the website across both, the rest two by two behind one button. */}
          <div className={styles.two}>
            {FIRST_LINKS.map((k) => (
              <LinkField key={k} kind={k} value={links[k]} onChange={(v) => setLinks((l) => ({ ...l, [k]: v }))} wide={k === "website"} />
            ))}
          </div>
          {moreLinks || MORE_LINKS.some((k) => links[k].trim() !== "") ? (
            <div className={styles.two}>
              {MORE_LINKS.map((k) => (
                <LinkField key={k} kind={k} value={links[k]} onChange={(v) => setLinks((l) => ({ ...l, [k]: v }))} />
              ))}
            </div>
          ) : (
            <button type="button" className={`button button-ghost ${styles.more}`} onClick={() => setMoreLinks(true)}>
              More links
            </button>
          )}
        </section>

        <section className={styles.set} aria-labelledby="block-first-buy">
          <h2 id="block-first-buy" className={`t-h3 ${styles.legend}`}>First buy</h2>
          <LaunchOptions options={options} coin={symbol} />
        </section>
      </fieldset>

      {/* The summary: the coin's preview, the terms it launches on, and the one action; after the form on a phone. */}
      <aside ref={side} className={`col-4 ${styles.side}`} aria-label="Launch summary">
        <Summary
          platform={platform}
          quote={quote}
          ticker={ticker}
          symbol={symbol}
          preview={preview}
          options={options}
          step={step}
          failed={failed}
          error={error}
          connected={publicKey !== null}
          walletName={wallet?.adapter.name ?? null}
          onEdit={() => { setError(null); setStep({ kind: "editing" }); }}
        />
      </aside>

      <Disclaimer
        open={disclaimerOpen}
        onCancel={() => setDisclaimerOpen(false)}
        onAccept={() => {
          setDisclaimerOpen(false);
          start();
        }}
      />
    </form>
  );
}

/**
 * The summary's height as `--side-h` on its column, so the column's sticky offset can keep its foot (the action and the
 * note) in the window when the summary is taller than the window: it then sticks with its foot 24px above the window's
 * bottom instead of its top under the header (LaunchForm.module.css, `.side`).
 */
function useStickySide() {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => el.style.setProperty("--side-h", `${Math.ceil(el.getBoundingClientRect().height)}px`);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return ref;
}

/**
 * The price a new coin starts at in the chosen Quote Asset, for the preview card before a First Buy is typed: a launch
 * quote for a sliver of the Graduation Target, read for its price before the buy, which is the curve's opening price
 * whatever the amount. Null until the API has answered, or for an asset that can't be launched against.
 */
function useLaunchPrice(quote: QuoteAsset | null) {
  const [answer, setAnswer] = useState<{ mint: string; price: number } | null>(null);
  const mint = quote?.launchable ? quote.mint : null;
  const target = quote?.launchable ? (quote.graduationTarget?.raw ?? null) : null;
  useEffect(() => {
    if (mint === null || target === null) return;
    const abort = new AbortController();
    const sliver = BigInt(target) / 1000n;
    getLaunchQuote(mint, (sliver > 0n ? sliver : 1n).toString(), null, abort.signal)
      .then((q) => setAnswer({ mint, price: q.firstBuy.priceBefore }))
      .catch(() => undefined);
    return () => abort.abort();
  }, [mint, target]);
  return answer && answer.mint === mint ? answer.price : null;
}

/**
 * The coin as the site's coin card will draw it right after launch (#172, the owner's ask of 2026-11-06): the form's
 * image, ticker and name on the chosen pair, at the opening price, or after the First Buy when one is quoted, with the
 * curve and the day's volume that buy leaves behind.
 */
function previewCard({
  imageUrl, symbol, name, quote, firstBuy, launchPrice, rewardTax,
}: {
  imageUrl: string | null;
  symbol: string;
  name: string;
  quote: QuoteAsset | null;
  firstBuy: TradeQuote | null;
  launchPrice: number | null;
  rewardTax: number | null;
}): CoinCardData {
  const ticker = quote ? quoteTicker(quote) : "SOL";
  const target = quote?.graduationTarget ? BigInt(quote.graduationTarget.raw) : 0n;
  // What the First Buy leaves in the curve: what it pays, less every fee and the Quote Asset's own transfer fee.
  const raised = firstBuy
    ? BigInt(firstBuy.amountIn) - BigInt(firstBuy.fees.raydium) - BigInt(firstBuy.fees.platform) - BigInt(firstBuy.fees.creator) - BigInt(firstBuy.transferFees.quote)
    : 0n;
  const progress = target > 0n && raised > 0n ? Math.min(100, Number((raised * 1000n) / target) / 10) : 0;
  return {
    image: imageUrl,
    symbol: symbol || "TICKER",
    name: name.trim() || "Your coin",
    quote: ticker,
    price: firstBuy ? firstBuy.priceAfter : launchPrice,
    change24h: null,
    progress,
    curve: firstBuy?.completesCurve ? "graduating" : "live",
    volume: `${firstBuy && quote ? formatUnits(firstBuy.amountIn, quote.decimals, 4) : "0"} ${ticker}`,
    rewardTaxBps: rewardTax,
  };
}

/** One link's field: its name over the address. `wide` spans the grid's row. */
function LinkField({ kind, value, onChange, wide = false }: { kind: LinkKind; value: string; onChange: (value: string) => void; wide?: boolean }) {
  const info = LINK_INFO[kind];
  return (
    <div className={`${styles.field} ${wide ? styles.wide : ""}`}>
      <label htmlFor={`coin-${kind}`}>{info.label}</label>
      <span className={`input ${styles.well}`}>
        <input id={`coin-${kind}`} type="url" inputMode="url" autoComplete="off" spellCheck={false} value={value} onChange={(e) => onChange(e.target.value)} placeholder={info.placeholder} />
      </span>
    </div>
  );
}

/** A field with Copy Protection's verdict under it once the field has a value. */
function CheckedField({ id, label, status, text, field, children }: { id: string; label: string; status: CopyStatus; text: string | null; field: string; children: ReactNode }) {
  return (
    <div className={styles.field} data-check={status}>
      <label htmlFor={id}>{label}</label>
      <span className={`input ${styles.well}`}>{children}</span>
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
  ticker: string | null;
  symbol: string;
  preview: CoinCardData;
  options: LaunchOptionsState;
  step: Step;
  failed: Failed | null;
  error: string | null;
  connected: boolean;
  walletName: string | null;
  onEdit: () => void;
};

/**
 * The launch summary beside the form (new-stoker's, in our tokens): the coin's preview as the site's coin card, the terms
 * it launches on, every one fixed at launch, the three promises, and the one action with what follows it: the signing
 * panel while the wallet asks, the status while the launch lands, and a way back when it did not visibly land.
 */
function Summary({ platform, quote, ticker, symbol, preview, options, step, failed, error, connected, walletName, onEdit }: SummaryProps) {
  const elapsed = useElapsed(step.kind === "confirming");
  const outcome = useRef<HTMLDivElement>(null);
  // A failure, an error or the signing panel appears at the card's foot: bring it into view.
  const outcomeKey = step.kind === "signing" ? "signing" : failed ? "failed" : error ? "error" : null;
  useEffect(() => {
    if (outcomeKey) outcome.current?.scrollIntoView({ block: "nearest" });
  }, [outcomeKey]);

  const target = quote?.graduationTarget ?? null;
  const firstBuy = options.firstBuyQuote;
  const fee = graduationFeeSol(platform);
  const launch = step.kind === "signing" || step.kind === "confirming" ? step.launch : null;
  const cost = launch ? `${(launch.costLamports / LAMPORTS_PER_SOL).toFixed(4)} SOL` : null;

  return (
    <div className={`card card-raised ${styles.summary}`}>
      {/* The preview window: the coin as the landing's coin card shows it, drawn from the form as it is filled. */}
      <section className={styles.preview} aria-label="Preview">
        <p className={styles.previewLabel} aria-hidden>Preview</p>
        <CoinCard card={preview} />
      </section>

      <dl className={styles.facts}>
        <div>
          <dt>Supply</dt>
          <dd>{COIN_SUPPLY.toLocaleString("en-US")}, fixed</dd>
        </div>
        <div>
          <dt>Graduates at</dt>
          <dd>{target && quote ? `${formatAmount(target.raw, quote.decimals)} ${ticker} raised` : (quote?.reason ?? "Choose a Quote Asset")}</dd>
        </div>
        <div>
          <dt>Launch type</dt>
          <dd>{options.rewardTax === null ? "Standard" : `Reward Launch, ${options.rewardTax / 100}%`}</dd>
        </div>
        {firstBuy && quote && (
          <>
            <div>
              <dt>First buy</dt>
              <dd>{formatUnits(firstBuy.amountIn, quote.decimals, quote.decimals)} {ticker}</dd>
            </div>
            <div>
              <dt>You get</dt>
              <dd>
                {formatUnits(firstBuy.amountOut, COIN_DECIMALS, 0)} {symbol || "coins"} ({supplyShare(BigInt(firstBuy.amountOut))})
              </dd>
            </div>
          </>
        )}
        <div>
          <dt>You earn</dt>
          <dd><Link href="/fees" className={styles.factLink}>Half of what we collect</Link></dd>
        </div>
        {fee && (
          <div>
            <dt>Graduation Fee</dt>
            <dd>{fee} from earnings</dd>
          </div>
        )}
        <div>
          <dt>Launch cost</dt>
          <dd>Network fees and rent</dd>
        </div>
      </dl>

      <ul className={styles.checks}>
        <li>Liquidity locked at graduation</li>
        <li>Metadata stored on Arweave</li>
        <li>Every payment on the ledger</li>
      </ul>

      <div ref={outcome} className={styles.action}>
        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}

        {launch && step.kind === "signing" ? (
          <div className={styles.signing} role="status">
            <Ring size={28} className={styles.signingRing} />
            <p className={styles.signingTitle}>{walletName ? `Confirm in ${walletName}` : "Confirm in your wallet"}</p>
            <p className={styles.signingText}>You sign in your wallet. Stoker never holds your funds.</p>
            <dl className={styles.signingAmounts}>
              <div>
                <dt>Your wallet pays</dt>
                <dd className="mono">{cost}</dd>
              </div>
              {launch.prepared.firstBuy && !isSol(launch.quote) && (
                <div>
                  <dt>First buy</dt>
                  <dd className="mono">{formatUnits(launch.prepared.firstBuy.amountIn, launch.quote.decimals, launch.quote.decimals)} {quoteTicker(launch.quote)}</dd>
                </div>
              )}
            </dl>
          </div>
        ) : launch && step.kind === "confirming" ? (
          <div className={styles.status} role="status">
            <span className={styles.statusDot} aria-hidden />
            <span className={styles.statusText}>
              Launching {symbol}, <span className="mono">{elapsed}s</span>
            </span>
            <Address value={step.signature} kind="tx" platform={platform} className={styles.statusLink} />
          </div>
        ) : failed ? (
          <div className={styles.failed} role="region" aria-label="Launch not confirmed">
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
              <button type="submit" className={`button button-primary button-lg ${styles.primary}`} disabled={step.kind !== "failed"} aria-busy={step.kind === "preparing" || undefined}>
                {step.kind === "preparing" ? "Checking…" : "Try again"}
              </button>
            </div>
          </div>
        ) : connected ? (
          <button
            type="submit"
            className={`button button-primary button-lg ${styles.primary}`}
            disabled={step.kind !== "editing" || !quote?.launchable}
            aria-busy={step.kind === "preparing" || undefined}
          >
            {step.kind === "preparing" ? "Preparing…" : `Stoke ${symbol || "a coin"}`}
          </button>
        ) : (
          <WalletButton variant="block" />
        )}

        <p className={styles.note}>
          What you earn is approximate and depends on trading that may never happen. A coin can lose all of its value, and nothing
          here is investment advice.
        </p>
      </div>
    </div>
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
