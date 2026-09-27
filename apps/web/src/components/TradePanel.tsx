"use client";

import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey, VersionedTransaction } from "@solana/web3.js";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { LaunchSummary, PlatformInfo, PreparedTrade, TradeQuote, TradeSide } from "@launchpad/contract";
import { getQuote, listTrades, prepareTrade, reportTransaction } from "@/lib/api";
import { COIN_DECIMALS, explorerUrl, formatUnits, isSol, parseUnits, quoteTicker, SOL_DECIMALS } from "@/lib/format";
import { Disclaimer, hasAcceptedDisclaimer } from "./Disclaimer";
import { Price } from "./Price";
import { WalletButton } from "./WalletButton";
import styles from "./TradePanel.module.css";

type Review = { prepared: PreparedTrade; tx: VersionedTransaction; walletLamports: bigint };
type Step =
  | { kind: "editing" }
  | { kind: "preparing" }
  | { kind: "reviewing"; review: Review }
  | { kind: "signing"; review: Review }
  | { kind: "confirming"; review: Review };
/** A confirmed trade; `coins` is the indexed fill, null if the Indexer hasn't seen it yet. */
type Done = { side: TradeSide; coins: string | null; signature: string };

const SLIPPAGE_BPS = [50, 100, 200, 500] as const;
/** Buy presets, in SOL or their worth in any other Quote Asset. */
const BUY_PRESETS_SOL = [0.1, 0.5, 1] as const;
const SELL_PRESETS = [25, 50, 100] as const;
const RAYDIUM_FEE_PCT = 0.25;
const QUOTE_DEBOUNCE_MS = 250;
// LaunchLab's ExceededSlippage error, as a transaction error and as the RPC's preflight log writes it.
const EXCEEDED_SLIPPAGE = 6004;
const exceededSlippage = (text: string) => text.includes(`"Custom":${EXCEEDED_SLIPPAGE}`) || text.includes(`0x${EXCEEDED_SLIPPAGE.toString(16)}`);

export function TradePanel({ launch, platform, onTraded }: { launch: LaunchSummary; platform: PlatformInfo; onTraded: () => void }) {
  const { connection } = useConnection();
  const { publicKey, signTransaction } = useWallet();
  const [side, setSide] = useState<TradeSide>("buy");
  const [amountText, setAmountText] = useState("");
  const [slippageBps, setSlippageBps] = useState<number>(100);
  const [quote, setQuote] = useState<TradeQuote | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  /** Raw units held: SOL in lamports, the Quote Asset (the same as SOL for a SOL pair) and the coin. */
  const [balances, setBalances] = useState<{ sol: bigint; quote: bigint; coins: bigint } | null>(null);
  const [step, setStep] = useState<Step>({ kind: "editing" });
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Done | null>(null);
  const [disclaimerOpen, setDisclaimerOpen] = useState(false);

  const quoteSymbol = quoteTicker(launch.quote);
  const quoteDecimals = launch.quote.decimals;
  const solPair = isSol(launch.quote);
  const payDecimals = side === "buy" ? quoteDecimals : COIN_DECIMALS;
  const getDecimals = side === "buy" ? COIN_DECIMALS : quoteDecimals;
  const paySymbol = side === "buy" ? quoteSymbol : launch.symbol;
  const getSymbol = side === "buy" ? launch.symbol : quoteSymbol;
  const amount = parseUnits(amountText, payDecimals);
  const invalidAmount = amountText.trim() !== "" && amount === null;
  const busy = step.kind !== "editing";
  const held = balances ? (side === "buy" ? balances.quote : balances.coins) : null;
  // A buy that takes the rest of the curve costs less than the amount typed, so check what the quote says it costs.
  const cost = side === "buy" && quote && amount !== null ? BigInt(quote.amountIn) : amount;
  const overBalance = cost !== null && held !== null && cost > held;

  const refreshBalances = useCallback(async () => {
    if (!publicKey) return setBalances(null);
    try {
      const held = async (mint: string) => {
        const accounts = await connection.getParsedTokenAccountsByOwner(publicKey, { mint: new PublicKey(mint) }, "confirmed");
        return accounts.value.reduce((sum, a) => sum + BigInt(a.account.data.parsed.info.tokenAmount.amount as string), 0n);
      };
      const [sol, coins, quote] = await Promise.all([
        connection.getBalance(publicKey, "confirmed").then(BigInt),
        held(launch.mint),
        solPair ? null : held(launch.quote.mint),
      ]);
      setBalances({ sol, quote: quote ?? sol, coins });
    } catch {
      setBalances(null);
    }
  }, [connection, publicKey, launch.mint, launch.quote.mint, solPair]);

  useEffect(() => void refreshBalances(), [refreshBalances]);

  // A live quote while the trader types, so the fees and what they get are visible before anything is signed.
  useEffect(() => {
    setQuote(null);
    setQuoteError(null);
    if (amount === null) return;
    const abort = new AbortController();
    const timer = setTimeout(async () => {
      try {
        setQuote(await getQuote(launch.mint, { side, amount: amount.toString(), slippageBps }, abort.signal));
      } catch (e) {
        if (!abort.signal.aborted) setQuoteError(tradeError((e as Error).message));
      }
    }, QUOTE_DEBOUNCE_MS);
    return () => {
      abort.abort();
      clearTimeout(timer);
    };
  }, [launch.mint, side, amount, slippageBps]);

  function edit(next: () => void) {
    setError(null);
    setDone(null);
    next();
  }

  async function review() {
    if (!publicKey || amount === null) return;
    setStep({ kind: "preparing" });
    try {
      const prepared = await prepareTrade({ mint: launch.mint, trader: publicKey.toBase58(), side, amount: amount.toString(), slippageBps });
      const tx = VersionedTransaction.deserialize(Uint8Array.from(atob(prepared.transaction), (c) => c.charCodeAt(0)));
      // Simulate before asking for a signature, so the review shows what the wallet will actually pay or receive.
      const sim = await connection.simulateTransaction(tx, {
        sigVerify: false,
        accounts: { addresses: [publicKey.toBase58()], encoding: "base64" },
      });
      if (sim.value.err) throw new Error(simulationError(sim.value.err, sim.value.logs ?? [], solPair ? null : quoteSymbol));
      const before = BigInt(await connection.getBalance(publicKey, "confirmed"));
      // The simulated balance already has the network fee taken off.
      const after = BigInt(sim.value.accounts?.[0]?.lamports ?? before);
      setQuote(prepared.quote);
      setStep({ kind: "reviewing", review: { prepared, tx, walletLamports: after - before } });
    } catch (e) {
      setError(tradeError((e as Error).message));
      setStep({ kind: "editing" });
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
        setError(
          exceededSlippage(JSON.stringify(result.value.err))
            ? "The price moved past your slippage before the trade landed, so nothing was traded and only the network fee was charged. Try again, or allow more slippage."
            : "The trade failed on-chain, so nothing was traded and only the network fee was charged. Try again.",
        );
      } else {
        await reportTransaction(signature);
        // The fill can differ from the quote when others trade first, so report what the chain actually did.
        const filled = (await listTrades(launch.mint).catch(() => null))?.trades.find((t) => t.signature === signature);
        setDone({ side: r.prepared.quote.side, coins: filled?.baseAmount ?? null, signature });
        setAmountText("");
        onTraded();
      }
      void refreshBalances();
    } catch (e) {
      const message = (e as Error).message ?? "";
      // The RPC simulates before sending, so a price that moved while the trader signed fails here, before any fee.
      setError(
        /reject|declin|cancel/i.test(message)
          ? "You declined the transaction in your wallet. Nothing was traded."
          : exceededSlippage(message)
            ? "The price moved past your slippage before the trade was sent, so nothing was traded or charged. Check the new quote and try again, or allow more slippage."
            : "The trade couldn't be sent. Nothing was traded; try again in a moment.",
      );
    }
    setStep({ kind: "editing" });
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setDone(null);
    if (!hasAcceptedDisclaimer()) return setDisclaimerOpen(true);
    void review();
  }

  const confirmation = done && (
    <p className={styles.done} role="status">
      {done.side === "buy" ? "Bought" : "Sold"}{" "}
      {done.coins && <><span className="mono">{formatUnits(done.coins, COIN_DECIMALS, 0)}</span>{" "}</>}
      {launch.symbol}.{" "}
      <a href={explorerUrl("tx", done.signature, platform)} target="_blank" rel="noreferrer">View transaction</a>
    </p>
  );

  // A buy that sells out the curve lands here too, so its confirmation stays on screen.
  if (launch.curve.status !== "live") {
    return (
      <section className={`${styles.card} ${styles.form}`} aria-labelledby="trade-title">
        <h2 id="trade-title" className={styles.title}>Trade</h2>
        {confirmation}
        <p className={styles.closed}>
          The curve sold out, so this coin no longer trades here. It trades on Raydium once it has moved to its pool.
        </p>
      </section>
    );
  }

  const r = step.kind === "reviewing" || step.kind === "signing" || step.kind === "confirming" ? step.review : null;
  const shown = r?.prepared.quote ?? quote;
  const moved = shown ? ((shown.priceAfter - shown.priceBefore) / shown.priceBefore) * 100 : 0;
  const totalFees = shown ? BigInt(shown.fees.raydium) + BigInt(shown.fees.platform) + BigInt(shown.fees.creator) : 0n;
  const fees = [
    ["Raydium", RAYDIUM_FEE_PCT, shown?.fees.raydium],
    ["Platform fee", platform.platformFeeBps / 100, shown?.fees.platform],
    ["Creator fee", platform.creatorFeeBps / 100, shown?.fees.creator],
  ] as const;

  return (
    <section className={styles.card} aria-labelledby="trade-title">
      <h2 id="trade-title" className="visually-hidden">Trade {launch.symbol}</h2>
      <form className={styles.form} onSubmit={onSubmit} aria-busy={busy}>
        <div className={styles.sides} role="group" aria-label="Buy or sell">
          {(["buy", "sell"] as const).map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={side === s}
              className={styles[s]}
              disabled={busy}
              onClick={() => edit(() => { setSide(s); setAmountText(""); })}
            >
              {s === "buy" ? "Buy" : "Sell"}
            </button>
          ))}
        </div>

        <fieldset className={styles.fields} disabled={busy}>
          <div className={styles.amountHead}>
            <label htmlFor="trade-amount">You pay</label>
            {held !== null && (
              <span className={styles.balance}>
                Balance <span className="mono">{formatUnits(held.toString(), payDecimals)}</span> {paySymbol}
              </span>
            )}
          </div>
          <div className={`${styles.amount} ${invalidAmount || overBalance ? styles.invalid : ""}`}>
            <input
              id="trade-amount"
              className="mono"
              inputMode="decimal"
              autoComplete="off"
              placeholder="0.00"
              value={amountText}
              onChange={(e) => edit(() => setAmountText(e.target.value.replace(",", ".")))}
              aria-invalid={invalidAmount || overBalance}
              aria-describedby="trade-amount-hint"
            />
            <span className={styles.unit}>{paySymbol}</span>
          </div>
          <p id="trade-amount-hint" className={invalidAmount || overBalance ? styles.hintError : styles.hint}>
            {invalidAmount
              ? `Enter an amount above zero with up to ${payDecimals} decimal places.`
              : overBalance
                ? held === 0n
                  ? `Your wallet has no ${paySymbol}.`
                  : `You have ${formatUnits(held!.toString(), payDecimals)} ${paySymbol}. Enter a smaller amount.`
                : side === "buy"
                  ? `Paid in ${quoteSymbol}, fees included.`
                  : `The coins you sell go back to the curve.`}
          </p>
          <div className={styles.presets}>
            {side === "buy"
              ? buyPresets(launch, platform).map((p) => (
                  <button key={p} type="button" onClick={() => edit(() => setAmountText(p))}>
                    {p} {quoteSymbol}
                  </button>
                ))
              : SELL_PRESETS.map((pct) => (
                  <button
                    key={pct}
                    type="button"
                    disabled={!balances || balances.coins === 0n}
                    onClick={() => edit(() => setAmountText(formatUnits(((balances!.coins * BigInt(pct)) / 100n).toString(), COIN_DECIMALS, COIN_DECIMALS).replace(/,/g, "")))}
                  >
                    {pct === 100 ? "All" : `${pct}%`}
                  </button>
                ))}
          </div>

          <div className={styles.slippage}>
            <span id="slippage-label">Slippage</span>
            <div role="group" aria-labelledby="slippage-label">
              {SLIPPAGE_BPS.map((bps) => (
                <button key={bps} type="button" aria-pressed={slippageBps === bps} onClick={() => edit(() => setSlippageBps(bps))}>
                  {bps / 100}%
                </button>
              ))}
            </div>
          </div>
        </fieldset>

        <div className={styles.quote} aria-live="polite">
          {quoteError ? (
            <p className={styles.quoteError}>{quoteError}</p>
          ) : shown ? (
            <dl>
              <div className={styles.receive}>
                <dt>You get about</dt>
                <dd>
                  <span className="mono">{formatUnits(shown.amountOut, getDecimals, side === "buy" ? 0 : 6)}</span> {getSymbol}
                </dd>
              </div>
              <div>
                <dt>At least</dt>
                <dd>
                  <span className="mono">{formatUnits(shown.minAmountOut, getDecimals, side === "buy" ? 0 : 6)}</span> {getSymbol}
                </dd>
              </div>
              <div>
                <dt>Price after</dt>
                <dd>
                  <Price value={shown.priceAfter} /> {quoteSymbol}{" "}
                  <span className={styles.move}>({moved >= 0 ? "+" : ""}{moved.toFixed(moved !== 0 && Math.abs(moved) < 0.1 ? 2 : 1)}%)</span>
                </dd>
              </div>
              <div className={styles.feeTotal}>
                <dt>Fees</dt>
                <dd>
                  <span className="mono">{formatUnits(totalFees.toString(), quoteDecimals, 6)}</span> {quoteSymbol}
                </dd>
              </div>
              {fees.map(([label, pct, raw]) => (
                <div key={label} className={styles.fee}>
                  <dt>
                    {label} <span className="mono">{pct}%</span>
                  </dt>
                  <dd>
                    <span className="mono">{formatUnits(raw ?? "0", quoteDecimals, 6)}</span> {quoteSymbol}
                  </dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className={styles.quoteHint}>Enter an amount to see what you get and every fee you pay.</p>
          )}
          {shown?.completesCurve && (
            <p className={styles.completes}>
              This buy takes the last coins on the curve and starts graduation, so it costs{" "}
              <span className="mono">{formatUnits(shown.amountIn, quoteDecimals, 6)}</span> {quoteSymbol}, not the full amount.
            </p>
          )}
        </div>

        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
        {confirmation}

        {r ? (
          <div className={styles.review} role="region" aria-label="Review your trade">
            <p>
              {solPair ? (
                r.walletLamports < 0n ? (
                  <>
                    Your wallet pays <strong className="mono">{sol(-r.walletLamports)} SOL</strong> in total, including network fees
                    and any account rent.
                  </>
                ) : (
                  <>
                    Your wallet receives about <strong className="mono">{sol(r.walletLamports)} SOL</strong> after network fees.
                  </>
                )
              ) : r.prepared.quote.side === "buy" ? (
                <>
                  Your wallet pays <strong className="mono">{formatUnits(r.prepared.quote.amountIn, quoteDecimals, quoteDecimals)} {quoteSymbol}</strong>{" "}
                  and <strong className="mono">{sol(-r.walletLamports)} SOL</strong> in network fees and any account rent.
                </>
              ) : (
                <>
                  Your wallet receives about{" "}
                  <strong className="mono">{formatUnits(r.prepared.quote.amountOut, quoteDecimals, 6)} {quoteSymbol}</strong> and pays{" "}
                  <strong className="mono">{sol(-r.walletLamports)} SOL</strong> in network fees and any account rent.
                </>
              )}{" "}
              If the price moves more than {slippageBps / 100}% first, the trade fails and nothing is traded.
            </p>
            <div className={styles.actions}>
              <button type="button" className={styles.secondary} onClick={() => setStep({ kind: "editing" })} disabled={step.kind !== "reviewing"}>
                Edit
              </button>
              <button type="button" className={styles.primary} onClick={() => signAndSend(r)} disabled={step.kind !== "reviewing"}>
                {step.kind === "signing" ? "Confirm in your wallet…" : step.kind === "confirming" ? "Confirming…" : side === "buy" ? "Sign and buy" : "Sign and sell"}
              </button>
            </div>
          </div>
        ) : publicKey ? (
          <button type="submit" className={styles.primary} disabled={busy || amount === null || overBalance || !quote}>
            {step.kind === "preparing" ? "Preparing…" : side === "buy" ? "Review buy" : "Review sell"}
          </button>
        ) : (
          <div className={styles.connect}>
            <p>Connect a wallet to trade.</p>
            <WalletButton variant="inline" />
          </div>
        )}
      </form>

      <Disclaimer
        action="trade"
        open={disclaimerOpen}
        onCancel={() => setDisclaimerOpen(false)}
        onAccept={() => {
          setDisclaimerOpen(false);
          void review();
        }}
      />
    </section>
  );
}

/** Turns an API or wallet error into what happened and what to do next. */
function tradeError(message: string) {
  if (/sold out/.test(message)) return "This coin's curve has sold out, so it no longer trades here.";
  if (/too small/.test(message)) return "That amount is too small to trade. Enter a larger amount.";
  if (/more than the curve has sold/.test(message)) return "That's more coins than the curve has sold. Enter a smaller amount.";
  if (/^[A-Z]/.test(message) && message.endsWith(".")) return message;
  return "Something went wrong preparing the trade. Try again in a moment.";
}

/** A SOL amount from lamports, to six decimal places. */
const sol = (lamports: bigint) => formatUnits(lamports.toString(), SOL_DECIMALS, 6);

/**
 * Buy presets worth about 0.1, 0.5 and 1 SOL. For any other Quote Asset they are converted at the price the Launch's
 * Graduation Target was fixed at, rounded to two significant digits so they read as round numbers.
 */
function buyPresets(launch: LaunchSummary, platform: PlatformInfo) {
  if (isSol(launch.quote)) return BUY_PRESETS_SOL.map(String);
  const perSol = (Number(launch.graduationTarget) / 10 ** launch.quote.decimals) / (Number(platform.graduationTargetLamports) / 10 ** SOL_DECIMALS);
  return BUY_PRESETS_SOL.map((s) =>
    (s * perSol).toLocaleString("en-US", { maximumSignificantDigits: 2, maximumFractionDigits: launch.quote.decimals, useGrouping: false }),
  );
}

/** Turns a failed simulation into something the trader can act on; `quote` is the Quote Asset's ticker when it isn't SOL. */
function simulationError(err: unknown, logs: string[], quote: string | null) {
  const text = `${JSON.stringify(err)} ${logs.join(" ")}`;
  if (quote && /insufficient funds|"Custom":1\b/.test(text) && !/insufficient lamports|InsufficientFundsForRent/.test(text))
    return `Your wallet doesn't have enough ${quote} for this trade. Lower the amount or add ${quote}.`;
  if (/insufficient (lamports|funds)|InsufficientFundsForRent|"Custom":1\b/.test(text))
    return quote
      ? "Your wallet doesn't have enough SOL for this trade's network fees. Add SOL and try again."
      : "Your wallet doesn't have enough to cover this trade and its network fees. Lower the amount or add SOL.";
  if (/AccountNotFound/.test(text)) return "Your wallet has no SOL yet. Add SOL and try again.";
  if (exceededSlippage(text)) return "The price has moved past your slippage. Check the new quote and try again.";
  return "The trade would fail on-chain, so nothing was sent. Try again in a moment.";
}
