"use client";

import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey, SendTransactionError, VersionedTransaction } from "@solana/web3.js";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import type {
  LaunchSummary, PayWith, PlatformInfo, PreparedTrade, SolRoute, TradeQuote, TradeSide, TradeStep, TradeVenue,
} from "@launchpad/contract";
import { getQuote, listTrades, prepareTrade, reportTransaction } from "@/lib/api";
import { landedError as landedErrorOf } from "@/lib/transactions";
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
/**
 * A sent trade; `coins` is the indexed fill, null if the Indexer hasn't seen it yet. `unconfirmed` when it was sent but
 * its confirmation could not be followed, so it may well have landed.
 */
type Done = { side: TradeSide; coins: string | null; signature: string; unconfirmed?: boolean };

const SLIPPAGE_BPS = [50, 100, 200, 500] as const;
/** Buy presets, in SOL or their worth in any other Quote Asset. */
const BUY_PRESETS_SOL = [0.1, 0.5, 1] as const;
const SELL_PRESETS = [25, 50, 100] as const;
const QUOTE_DEBOUNCE_MS = 250;

export function TradePanel({
  launch, platform, referrer = null, onTraded,
}: {
  launch: LaunchSummary;
  platform: PlatformInfo;
  /** The wallet that sent the trader here, which earns the referral share fee on curve trades where the Quote Asset allows one. */
  referrer?: string | null;
  onTraded: () => void;
}) {
  const { connection } = useConnection();
  const { publicKey, signTransaction } = useWallet();
  const [side, setSide] = useState<TradeSide>("buy");
  const [amountText, setAmountText] = useState("");
  const [slippageBps, setSlippageBps] = useState<number>(100);
  const [payWith, setPayWith] = useState<PayWith>("quote");
  /** Whether the trader picked what to pay with; until then a wallet without the Quote Asset pays with SOL. */
  const payWithChosen = useRef(false);
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
  // A buy of a coin paired with anything but SOL can be paid with SOL, which the API swaps for the Quote Asset.
  const canPayWithSol = !solPair && platform.solRoute !== null;
  const paysSol = side === "buy" && canPayWithSol && payWith === "sol";
  const payDecimals = side === "buy" ? (paysSol ? SOL_DECIMALS : quoteDecimals) : COIN_DECIMALS;
  const getDecimals = side === "buy" ? COIN_DECIMALS : quoteDecimals;
  // After Graduation the coin trades in its Raydium pool; the API routes quotes and trades there by itself.
  const venue: TradeVenue = launch.curve.status === "graduated" ? "pool" : "curve";
  const paySymbol = side === "buy" ? (paysSol ? "SOL" : quoteSymbol) : launch.symbol;
  const getSymbol = side === "buy" ? launch.symbol : quoteSymbol;
  const amount = parseUnits(amountText, payDecimals);
  const invalidAmount = amountText.trim() !== "" && amount === null;
  const busy = step.kind !== "editing";
  const held = balances ? (side === "buy" ? (paysSol ? balances.sol : balances.quote) : balances.coins) : null;
  // A buy that takes the rest of the curve costs less than the amount typed, so check what the quote says it costs; a
  // buy paid with SOL may cost up to its swap's limit.
  const cost =
    side === "buy" && quote && amount !== null ? BigInt(quote.route ? quote.route.maxSolIn : quote.amountIn) : amount;
  const overBalance = cost !== null && held !== null && cost > held;

  // A trader never refers themselves; the referral is dropped for the referrer's own wallet.
  const referral = referrer && referrer !== publicKey?.toBase58() ? referrer : null;

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

  // A wallet that holds none of the Quote Asset but has SOL pays with SOL, unless the trader has chosen otherwise or has
  // already typed an amount in the other unit.
  useEffect(() => {
    if (!canPayWithSol || !balances || payWithChosen.current) return;
    const next = balances.quote === 0n && balances.sol > 0n ? "sol" : "quote";
    setPayWith((current) => (current === next || amountText !== "" ? current : next));
    // amountText is read, not followed: the pick happens when balances arrive, never while typing.
  }, [canPayWithSol, balances]);

  // A review is one wallet's transaction against one venue. When the wallet changes or goes away, or the coin moves to
  // its pool, whatever was under review is stale (it would fail on-chain or be signed by the wrong wallet), so it is dropped.
  const owner = publicKey?.toBase58() ?? null;
  useEffect(() => {
    setStep((s) => (s.kind === "reviewing" ? { kind: "editing" } : s));
  }, [owner, venue]);

  // A live quote while the trader types, so the fees and what they get are visible before anything is signed. It is
  // fetched again when the coin graduates, since it then trades in its pool at another price and other fees.
  useEffect(() => {
    setQuote(null);
    setQuoteError(null);
    if (amount === null) return;
    const abort = new AbortController();
    const timer = setTimeout(async () => {
      try {
        setQuote(
          await getQuote(launch.mint, { side, amount: amount.toString(), slippageBps, payWith: paysSol ? "sol" : "quote", referrer: referral ?? undefined }, abort.signal),
        );
      } catch (e) {
        if (!abort.signal.aborted) setQuoteError(tradeError((e as Error).message));
      }
    }, QUOTE_DEBOUNCE_MS);
    return () => {
      abort.abort();
      clearTimeout(timer);
    };
  }, [launch.mint, side, amount, slippageBps, paysSol, venue, referral]);

  function edit(next: () => void) {
    setError(null);
    setDone(null);
    next();
  }

  async function review() {
    if (!publicKey || amount === null) return;
    setStep({ kind: "preparing" });
    try {
      const prepared = await prepareTrade({
        mint: launch.mint, trader: publicKey.toBase58(), side, amount: amount.toString(), slippageBps, payWith: paysSol ? "sol" : "quote",
        referrer: referral ?? undefined,
      });
      const tx = VersionedTransaction.deserialize(Uint8Array.from(atob(prepared.transaction), (c) => c.charCodeAt(0)));
      // Simulate before asking for a signature, so the review shows what the wallet will actually pay or receive.
      const sim = await connection.simulateTransaction(tx, {
        sigVerify: false,
        accounts: { addresses: [publicKey.toBase58()], encoding: "base64" },
      });
      if (sim.value.err) {
        const text = `${JSON.stringify(sim.value.err)} ${(sim.value.logs ?? []).join(" ")}`;
        throw new Error(simulationError(text, prepared, solPair || prepared.quote.route ? null : quoteSymbol, quoteSymbol));
      }
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
    let signed: VersionedTransaction;
    try {
      signed = await signTransaction(r.tx);
    } catch (e) {
      const message = (e as Error).message ?? "";
      setError(/reject|declin|cancel/i.test(message) ? "You declined the transaction in your wallet. Nothing was traded." : message);
      return setStep({ kind: "editing" });
    }
    let signature: string;
    try {
      signature = await connection.sendRawTransaction(signed.serialize());
    } catch (e) {
      // The RPC simulates before sending, so a price that moved while the trader signed fails here, before any fee.
      // Only the node refusing it says the trade never went out; anything else may have reached the chain.
      setError(
        e instanceof SendTransactionError
          ? unsentError(`${e.message} ${(e.logs ?? []).join(" ")}`, r.prepared, quoteSymbol)
          : "We couldn't tell whether the trade was sent. Check your wallet's recent activity before trying again.",
      );
      void refreshBalances();
      return setStep({ kind: "editing" });
    }
    setStep({ kind: "confirming", review: r });
    try {
      const result = await connection.confirmTransaction(
        { signature, blockhash: signed.message.recentBlockhash, lastValidBlockHeight: r.prepared.lastValidBlockHeight },
        "confirmed",
      );
      if (result.value.err) {
        setError(landedError(JSON.stringify(result.value.err), r.prepared, quoteSymbol));
      } else {
        await reportTransaction(signature);
        // The fill can differ from the quote when others trade first, so report what the chain actually did.
        const filled = (await listTrades(launch.mint).catch(() => null))?.trades.find((t) => t.signature === signature);
        setDone({ side: r.prepared.quote.side, coins: filled?.baseAmount ?? null, signature });
        setAmountText("");
        onTraded();
      }
    } catch (e) {
      const landed = landedErrorOf(e);
      if (landed) {
        // It had already landed and failed when the confirmation looked: nothing moved but the network fee.
        setError(landedError(landed, r.prepared, quoteSymbol));
      } else {
        // Sent, but its confirmation could not be followed: it may well have landed, so it is never called untraded.
        setDone({ side: r.prepared.quote.side, coins: null, signature, unconfirmed: true });
        setError(
          e instanceof Error && e.name === "TransactionExpiredBlockheightExceededError"
            ? "The trade wasn't seen to land before it expired. Check the transaction before trading again."
            : "The trade was sent, but we lost track of it before it confirmed. Check the transaction before trading again.",
        );
        onTraded();
      }
    }
    void refreshBalances();
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
      {done.unconfirmed ? (
        <>Sent a {done.side} of {launch.symbol}, not yet confirmed. </>
      ) : (
        <>
          {done.side === "buy" ? "Bought" : "Sold"}{" "}
          {done.coins && <><span className="mono">{formatUnits(done.coins, COIN_DECIMALS, 0)}</span>{" "}</>}
          {launch.symbol}.{" "}
        </>
      )}
      <a href={explorerUrl("tx", done.signature, platform)} target="_blank" rel="noreferrer">View transaction</a>
    </p>
  );

  // A buy that sells out the curve lands here too, so its confirmation stays on screen until the pool opens.
  if (launch.curve.status === "graduating") {
    return (
      <section className={`${styles.card} ${styles.form}`} aria-labelledby="trade-title">
        <h2 id="trade-title" className={styles.title}>Trade</h2>
        {confirmation}
        <p className={styles.closed}>
          Trading pauses while Raydium moves the coin to its pool, and opens here again in a few seconds.
        </p>
      </section>
    );
  }

  const r = step.kind === "reviewing" || step.kind === "signing" || step.kind === "confirming" ? step.review : null;
  const shown = r?.prepared.quote ?? quote;
  const route = shown?.route ?? null;
  const moved = shown ? ((shown.priceAfter - shown.priceBefore) / shown.priceBefore) * 100 : 0;
  // In the pool a sell pays the pool's own fee in the coins going in; every other fee is in the Quote Asset, except the
  // swap's own fee in front of a buy paid with SOL.
  const poolFeeInCoins = shown?.venue === "pool" && shown.side === "sell";
  const quoteFees = shown
    ? BigInt(shown.fees.platform) + BigInt(shown.fees.creator) + (poolFeeInCoins ? 0n : BigInt(shown.fees.raydium)) + BigInt(shown.referral?.fee ?? "0")
    : 0n;
  type Fee = { label: string; pct: number | null; raw: string; unit: "quote" | "coin" | "sol" };
  // What the issuers withhold on the way: the Quote Asset's transfer fee, and the coin's Reward Tax on a Reward Launch.
  const transferFees: Fee[] = !shown
    ? []
    : [
        ...(shown.transferFees.quote !== "0"
          ? [{ label: `${quoteSymbol} transfer fee`, pct: shown.transferFeeBps.quote / 100, raw: shown.transferFees.quote, unit: "quote" as const }]
          : []),
        ...(shown.transferFees.base !== "0"
          ? [{ label: `${launch.symbol} reward tax`, pct: shown.transferFeeBps.base / 100, raw: shown.transferFees.base, unit: "coin" as const }]
          : []),
      ];
  const fees: Fee[] = !shown
    ? []
    : [
        ...(route?.fee ? [{ label: `Swap to ${quoteSymbol}`, pct: route.feeBps === null ? null : route.feeBps / 100, raw: route.fee, unit: "sol" as const }] : []),
        ...(shown.venue === "pool"
          ? [
              { label: "Raydium pool fee", pct: shown.feeBps.raydium / 100, raw: shown.fees.raydium, unit: poolFeeInCoins ? ("coin" as const) : ("quote" as const) },
              { label: "Platform fee", pct: shown.feeBps.platform / 100, raw: shown.fees.platform, unit: "quote" as const },
            ]
          : [
              { label: "Raydium", pct: shown.feeBps.raydium / 100, raw: shown.fees.raydium, unit: "quote" as const },
              { label: "Platform fee", pct: shown.feeBps.platform / 100, raw: shown.fees.platform, unit: "quote" as const },
              { label: "Creator fee", pct: shown.feeBps.creator / 100, raw: shown.fees.creator, unit: "quote" as const },
            ]),
        ...(shown.referral?.applies ? [{ label: "Referral fee", pct: shown.referral.bps / 100, raw: shown.referral.fee, unit: "quote" as const }] : []),
      ];
  const amountOf = (raw: string, unit: Fee["unit"]) =>
    unit === "coin" ? (
      <><span className="mono">{formatUnits(raw, COIN_DECIMALS, 0)}</span> {launch.symbol}</>
    ) : unit === "sol" ? (
      <><span className="mono">{sol(BigInt(raw))}</span> SOL</>
    ) : (
      <><span className="mono">{formatUnits(raw, quoteDecimals, 6)}</span> {quoteSymbol}</>
    );

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
          {side === "buy" && canPayWithSol && (
            <div className={`${styles.option} ${styles.payWith}`}>
              <span id="pay-with-label">Pay with</span>
              <div role="group" aria-labelledby="pay-with-label">
                {(["quote", "sol"] as const).map((p) => (
                  <button
                    key={p}
                    type="button"
                    aria-pressed={payWith === p}
                    onClick={() =>
                      edit(() => {
                        payWithChosen.current = true;
                        if (p !== payWith) setAmountText("");
                        setPayWith(p);
                      })
                    }
                  >
                    {p === "sol" ? "SOL" : quoteSymbol}
                  </button>
                ))}
              </div>
            </div>
          )}
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
                  ? paysSol
                    ? `Paid in SOL, swapped for ${quoteSymbol} in the same trade.`
                    : `Paid in ${quoteSymbol}, fees included.`
                  : venue === "pool"
                    ? "The coins you sell go to the coin's Raydium pool."
                    : "The coins you sell go back to the curve."}
          </p>
          <div className={styles.presets}>
            {side === "buy"
              ? (paysSol ? BUY_PRESETS_SOL.map(String) : buyPresets(launch, platform)).map((p) => (
                  <button key={p} type="button" onClick={() => edit(() => setAmountText(p))}>
                    {p} {paySymbol}
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

          <div className={`${styles.option} ${styles.slippage}`}>
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
              {route && (
                <>
                  <div className={styles.group}>
                    <dt>You pay about</dt>
                    <dd>
                      <span className="mono">{sol(roundLamports(BigInt(route.solIn), "nearest"))}</span> SOL
                    </dd>
                  </div>
                  <div>
                    <dt>At most</dt>
                    <dd>
                      <span className="mono">{sol(roundLamports(BigInt(route.maxSolIn), "up"))}</span> SOL
                    </dd>
                  </div>
                  <div>
                    <dt>Swapped for</dt>
                    <dd>
                      <span className="mono">{formatUnits(route.quoteOut, quoteDecimals, quoteDecimals)}</span> {quoteSymbol}
                    </dd>
                  </div>
                </>
              )}
              <div className={styles.group}>
                <dt>Fees</dt>
                <dd>
                  <span className="mono">{formatUnits(quoteFees.toString(), quoteDecimals, 6)}</span> {quoteSymbol}
                  {poolFeeInCoins && (
                    <>
                      {" "}+ <span className="mono">{formatUnits(shown.fees.raydium, COIN_DECIMALS, 0)}</span> {launch.symbol}
                    </>
                  )}
                  {route?.fee && (
                    <>
                      {" "}+ <span className="mono">{sol(BigInt(route.fee))}</span> SOL
                    </>
                  )}
                </dd>
              </div>
              {[...fees, ...transferFees].map((f) => (
                <div key={f.label} className={styles.fee}>
                  <dt>
                    {f.label}
                    {f.pct !== null && <> <span className="mono">{f.pct}%</span></>}
                  </dt>
                  <dd>{amountOf(f.raw, f.unit)}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className={styles.quoteHint}>
              {venue === "pool" && "This coin trades in its Raydium pool now. "}
              Enter an amount to see what you get and every fee you pay.
            </p>
          )}
          {route && <p className={styles.routeNote}>{routeNote(route, shown!.slippageBps, quoteSymbol)}</p>}
          {shown?.completesCurve && (
            <p className={styles.completes}>
              This buy takes the last coins on the curve and starts graduation, so it costs{" "}
              {route ? (
                <><span className="mono">{sol(roundLamports(BigInt(route.solIn), "nearest"))}</span> SOL</>
              ) : (
                <><span className="mono">{formatUnits(shown.amountIn, quoteDecimals, 6)}</span> {quoteSymbol}</>
              )}
              , not the full amount.
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
              ) : r.prepared.quote.route ? (
                <>
                  Your wallet pays <strong className="mono">{sol(-r.walletLamports)} SOL</strong> in total, including network fees
                  and any account rent. It buys exactly{" "}
                  <strong className="mono">{formatUnits(r.prepared.quote.route.quoteOut, quoteDecimals, quoteDecimals)} {quoteSymbol}</strong>{" "}
                  with it and spends all of it {r.prepared.quote.venue === "pool" ? "in the pool" : "on the curve"}, so none is left over.
                </>
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
              {r.prepared.quote.route
                ? `If the prices move more than ${slippageBps / 100}% in total first, the trade fails and nothing is traded.`
                : `If the price moves more than ${slippageBps / 100}% first, the trade fails and nothing is traded.`}
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

/** How a buy paid with SOL is routed and how its slippage is split, in a line. */
function routeNote(route: SolRoute, slippageBps: number, quoteSymbol: string) {
  const { route: swap, trade } = route.slippageBps;
  return (
    `Swapped through ${route.via.join(", ")}. Your ${slippageBps / 100}% slippage allows up to ${swap / 100}% more SOL for the ` +
    `${quoteSymbol} and ${trade / 100}% fewer coins.`
  );
}

/** Turns an API or wallet error into what happened and what to do next. */
function tradeError(message: string) {
  if (/too small/.test(message)) return "That amount is too small to trade. Enter a larger amount.";
  if (/more than the curve has sold/.test(message)) return "That's more coins than the curve has sold. Enter a smaller amount.";
  if (/^[A-Z]/.test(message) && message.endsWith(".")) return message;
  return "Something went wrong preparing the trade. Try again in a moment.";
}

/** A SOL amount from lamports, to six decimal places. */
const sol = (lamports: bigint) => formatUnits(lamports.toString(), SOL_DECIMALS, 6);

/**
 * Lamports rounded to the six decimals `sol` shows: a swap bought to the Quote Asset's last unit costs a few lamports
 * under the SOL typed (0.499999997 for 0.5), which truncating would show as 0.499999. Limits round up.
 */
function roundLamports(lamports: bigint, how: "nearest" | "up") {
  const step = 1_000n;
  return ((lamports + (how === "up" ? step - 1n : step / 2n)) / step) * step;
}

/**
 * Buy presets worth about 0.1, 0.5 and 1 SOL. For any other Quote Asset they are converted at the price the Launch's
 * Graduation Target was fixed at, rounded to two significant digits so they read as round numbers.
 */
function buyPresets(launch: LaunchSummary, platform: PlatformInfo) {
  if (isSol(launch.quote)) return BUY_PRESETS_SOL.map(String);
  const perSol = (Number(launch.graduationTarget) / 10 ** launch.quote.decimals) / (Number(platform.graduationTargetLamports) / 10 ** SOL_DECIMALS);
  // Two significant digits, but never more decimals than the Quote Asset has, or the preset would be unparseable.
  return BUY_PRESETS_SOL.map((s) =>
    (s * perSol).toLocaleString("en-US", {
      maximumSignificantDigits: 2, maximumFractionDigits: launch.quote.decimals, roundingPriority: "lessPrecision", useGrouping: false,
    }),
  );
}

// ExceededSlippage of LaunchLab (the curve), of Raydium's CPMM (the pool after Graduation, and the local SOL route) and
// Jupiter's SlippageToleranceExceeded, as a transaction error and as the RPC's preflight log writes them.
const SLIPPAGE_CODES: Record<TradeVenue | "raydium-cpmm" | "jupiter", number> = { curve: 6004, pool: 6005, "raydium-cpmm": 6005, jupiter: 6001 };
const hasCode = (text: string, code: number) => text.includes(`"Custom":${code}`) || text.includes(`0x${code.toString(16)}`);

/**
 * Which step of the trade failed, from a transaction error (`"InstructionError":[3,…]`) or the RPC's preflight message
 * ("Error processing Instruction 3: …"), and whether it failed on its slippage limit.
 */
function failure(text: string, prepared: PreparedTrade): { step: TradeStep | null; slippage: boolean } {
  const match = /"InstructionError":\[(\d+)|Instruction (\d+)/.exec(text);
  const index = match ? Number(match[1] ?? match[2]) : null;
  const step = index === null ? null : (prepared.steps[index] ?? null);
  const { venue, route } = prepared.quote;
  const slippage =
    step === "route" && route
      ? hasCode(text, SLIPPAGE_CODES[route.source]) || /SlippageToleranceExceeded/.test(text)
      : (step === null || step === "trade") && hasCode(text, SLIPPAGE_CODES[venue]);
  return { step, slippage };
}

/** A trade that landed but failed: nothing moved except the network fee. */
function landedError(text: string, prepared: PreparedTrade, quoteSymbol: string) {
  const f = failure(text, prepared);
  if (f.step === "route")
    return f.slippage
      ? `SOL bought less ${quoteSymbol} than your slippage allows before the trade landed, so nothing was swapped or traded and only the network fee was charged. Try again, or allow more slippage.`
      : `The swap from SOL to ${quoteSymbol} failed on-chain, so nothing was traded and only the network fee was charged. Try again, or pay in ${quoteSymbol}.`;
  return f.slippage
    ? "The price moved past your slippage before the trade landed, so nothing was traded and only the network fee was charged. Try again, or allow more slippage."
    : "The trade failed on-chain, so nothing was traded and only the network fee was charged. Try again.";
}

/** A trade the RPC refused to send after its own simulation: nothing moved and nothing was charged. */
function unsentError(text: string, prepared: PreparedTrade, quoteSymbol: string) {
  const f = failure(text, prepared);
  if (f.step === "route")
    return f.slippage
      ? `SOL buys less ${quoteSymbol} now than your slippage allows, so nothing was sent, swapped or charged. Check the new quote and try again, or allow more slippage.`
      : `The swap from SOL to ${quoteSymbol} would fail, so nothing was sent or charged. Try again in a moment, or pay in ${quoteSymbol}.`;
  return f.slippage
    ? "The price moved past your slippage before the trade was sent, so nothing was traded or charged. Check the new quote and try again, or allow more slippage."
    : "The trade couldn't be sent. Nothing was traded; try again in a moment.";
}

/**
 * Turns a failed simulation into something the trader can act on. `payingQuote` is the Quote Asset's ticker when the
 * trade spends a Quote Asset other than SOL from the wallet.
 */
function simulationError(text: string, prepared: PreparedTrade, payingQuote: string | null, quoteSymbol: string) {
  if (payingQuote && /insufficient funds|"Custom":1\b/.test(text) && !/insufficient lamports|InsufficientFundsForRent/.test(text))
    return `Your wallet doesn't have enough ${payingQuote} for this trade. Lower the amount or add ${payingQuote}.`;
  if (/insufficient (lamports|funds)|InsufficientFundsForRent|"Custom":1\b/.test(text))
    return payingQuote
      ? "Your wallet doesn't have enough SOL for this trade's network fees. Add SOL and try again."
      : "Your wallet doesn't have enough to cover this trade and its network fees. Lower the amount or add SOL.";
  if (/AccountNotFound/.test(text)) return "Your wallet has no SOL yet. Add SOL and try again.";
  const f = failure(text, prepared);
  if (f.step === "route")
    return f.slippage
      ? `SOL buys less ${quoteSymbol} now than your slippage allows. Check the new quote and try again.`
      : `The swap from SOL to ${quoteSymbol} would fail, so nothing was sent. Try again in a moment, or pay in ${quoteSymbol}.`;
  if (f.slippage) return "The price has moved past your slippage. Check the new quote and try again.";
  return "The trade would fail on-chain, so nothing was sent. Try again in a moment.";
}
