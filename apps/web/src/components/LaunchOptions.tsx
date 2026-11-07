"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AIRDROP_MAX_RECIPIENTS, REWARD_SALE_MAX_RESERVE_BPS, REWARD_TAX_RATES, type RewardPayoutAsset, type RewardTaxBps, type TradeQuote,
} from "@launchpad/contract";
import { getLaunchPermissions, getLaunchQuote } from "@/lib/api";
import { parseAirdropList } from "@/lib/airdrop";
import { COIN_DECIMALS, COIN_SUPPLY, formatUnits, parseUnits } from "@/lib/format";
import { OptionRow } from "./OptionRow";
import styles from "./LaunchOptions.module.css";

const QUOTE_DEBOUNCE_MS = 250;
const LIST_MIN_ROWS = 4;
const LIST_MAX_ROWS = 12;

/** The Quote Asset a launch pairs with, as the launch options need it. */
export type OptionsQuote = { mint: string; symbol: string; decimals: number };

/** A share of the supply, to two decimals: 34,567,890 coins is 3.46%. */
export function supplyShare(raw: bigint) {
  const basisPoints = Number((raw * 10_000n) / (BigInt(COIN_SUPPLY) * 10n ** BigInt(COIN_DECIMALS)));
  return `${(basisPoints / 100).toLocaleString("en-US", { maximumFractionDigits: 2 })}%`;
}

/**
 * The launch modes on the launch form: the launch type (a standard coin or a Reward Launch), a first buy inside the
 * launch transaction, and an airdrop paid from it.
 * Holds their state, the live first-buy quote, and what (if anything) stops the launch from being prepared.
 */
export function useLaunchOptions(quote: OptionsQuote | null, creator: string | null) {
  const [rewardTax, setRewardTax] = useState<RewardTaxBps | null>(null);
  // What a Reward Launch pays its holders in: the coin itself, or the Quote Asset bought with the tax (ADR 0006).
  const [rewardPayout, setRewardPayout] = useState<RewardPayoutAsset>("coin");
  const [firstBuyText, setFirstBuyText] = useState("");
  const [airdropChosen, setAirdropOn] = useState(false);
  const [airdropText, setAirdropText] = useState("");
  // An airdrop at launch is only offered to wallets the operator has allowed; until the answer is in, to nobody.
  const [airdropAllowedFor, setAirdropAllowedFor] = useState<string | null>(null);
  const [firstBuyQuote, setFirstBuyQuote] = useState<TradeQuote | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);

  const quoteMint = quote?.mint ?? null;
  const firstBuy = quote ? parseUnits(firstBuyText, quote.decimals) : null;
  const firstBuyInvalid = quote !== null && firstBuyText.trim() !== "" && firstBuy === null;
  const airdrop = useMemo(() => parseAirdropList(airdropText, COIN_DECIMALS, creator), [airdropText, creator]);

  useEffect(() => {
    if (creator === null) return;
    const abort = new AbortController();
    getLaunchPermissions(creator, abort.signal)
      .then((p) => setAirdropAllowedFor(p.airdrop ? creator : null))
      .catch(() => undefined);
    return () => abort.abort();
  }, [creator]);
  const airdropAllowed = creator !== null && airdropAllowedFor === creator;
  const airdropOn = airdropAllowed && airdropChosen;

  // A live quote while the Creator types, so they see the coins they get before preparing anything. On a Reward Launch
  // the Reward Tax comes off the first buy's coins too, so the quote follows the chosen rate.
  useEffect(() => {
    setFirstBuyQuote(null);
    setQuoteError(null);
    if (firstBuy === null || quoteMint === null) return;
    const abort = new AbortController();
    const timer = setTimeout(async () => {
      try {
        setFirstBuyQuote((await getLaunchQuote(quoteMint, firstBuy.toString(), rewardTax, abort.signal)).firstBuy);
      } catch (e) {
        if (!abort.signal.aborted) setQuoteError((e as Error).message);
      }
    }, QUOTE_DEBOUNCE_MS);
    return () => {
      abort.abort();
      clearTimeout(timer);
    };
  }, [firstBuy, quoteMint, rewardTax]);

  const bought = firstBuyQuote ? BigInt(firstBuyQuote.amountOut) : null;
  // Shown as an error as soon as it is true: something in the list the Creator has to fix.
  const airdropProblem = !airdropOn
    ? null
    : airdrop.problem ??
      (bought !== null && airdrop.total > bought
        ? "The airdrop gives away more coins than your first buy gets. Buy more or airdrop less."
        : null);
  // Still to do rather than wrong: it only stops the launch when the Creator tries to go ahead.
  const airdropMissing = !airdropOn
    ? null
    : firstBuy === null
      ? "An airdrop is paid from your first buy. Add a first buy."
      : airdrop.recipients.length === 0
        ? "Add the wallets to airdrop to, or turn the airdrop off."
        : null;
  const firstBuyProblem = firstBuyInvalid
    ? `Enter a first buy above zero with up to ${quote!.decimals} decimal places.`
    : quoteError;

  return {
    quote,
    rewardTax, setRewardTax, rewardPayout, setRewardPayout,
    firstBuyText, setFirstBuyText, firstBuyInvalid, firstBuyQuote, firstBuyProblem,
    airdropAllowed, airdropOn, setAirdropOn, airdropText, setAirdropText, airdrop, airdropProblem, airdropMissing, bought,
    /** What stops the launch from being prepared, if anything. */
    problem: firstBuyProblem ?? airdropProblem ?? airdropMissing,
    /** The form fields these options add to the prepare request. */
    fields(): [string, string][] {
      const out: [string, string][] = [];
      if (rewardTax !== null) out.push(["rewardTax", String(rewardTax)], ["rewardPayout", rewardPayout]);
      if (firstBuy !== null) out.push(["firstBuy", firstBuy.toString()]);
      if (airdropOn && airdrop.recipients.length > 0)
        out.push(["airdrop", JSON.stringify(airdrop.recipients.map((r) => ({ wallet: r.wallet, amount: r.amount.toString() })))]);
      return out;
    },
  };
}

export type LaunchOptionsState = ReturnType<typeof useLaunchOptions>;

/**
 * The launch type on the launch form (#172, after new-stoker's launch page): four rows, a standard coin, a Reward Launch
 * paid in the coin, one paid in the Quote Asset, and Holder rewards, shown before it is built; a Reward Launch then asks
 * its Reward Tax. All of it is fixed at launch. `labelId` names the section's heading, which the form renders above.
 */
export function LaunchType({ options: o, coin, labelId }: { options: LaunchOptionsState; coin: string; labelId: string }) {
  const coinLabel = coin || "the coin";
  const quoteLabel = o.quote?.symbol ?? null;
  const reward = o.rewardTax !== null;
  const chooseReward = (payout: RewardPayoutAsset) => {
    o.setRewardTax(o.rewardTax ?? REWARD_TAX_RATES[0]);
    o.setRewardPayout(payout);
  };

  return (
    <div className={styles.type}>
      <div className={styles.types} role="radiogroup" aria-labelledby={labelId}>
        <OptionRow name="launch-type" value="standard" checked={!reward} onChange={() => o.setRewardTax(null)}>
          <span><b>Standard</b></span>
        </OptionRow>
        <OptionRow name="launch-type" value="coin" checked={reward && o.rewardPayout === "coin"} onChange={() => chooseReward("coin")}>
          <span><b>Reward Launch</b>, paid in the coin</span>
        </OptionRow>
        <OptionRow name="launch-type" value="quote" checked={reward && o.rewardPayout === "quote"} onChange={() => chooseReward("quote")} disabled={!quoteLabel}>
          <span><b>Reward Launch</b>, paid in {quoteLabel ?? "its pair"}</span>
        </OptionRow>
        {/* #113's Holders destination (ADR 0011), shown before it is built (owner, 2026-10-30): the row says so and takes no choice. */}
        <OptionRow name="launch-type" value="holders" checked={false} disabled end={<span className="tag">Coming soon</span>}>
          <span><b>Holder rewards</b></span>
        </OptionRow>
      </div>
      {reward && (
        <div className={styles.rates} role="group" aria-label="Reward Tax">
          <span className={styles.ratesLabel} aria-hidden>Reward Tax</span>
          <div className={`segmented ${styles.segmented}`}>
            {REWARD_TAX_RATES.map((bps) => (
              <button key={bps} type="button" aria-pressed={o.rewardTax === bps} onClick={() => o.setRewardTax(bps)}>
                {bps / 100}%
              </button>
            ))}
          </div>
          <p className={styles.hint}>
            {o.rewardPayout === "coin" ? (
              <>Holders are paid in {coinLabel} itself, never sold. Fixed at launch, like the rate.</>
            ) : (
              <>
                The tax is sold for {quoteLabel} in small slices, at most {REWARD_SALE_MAX_RESERVE_BPS / 100}% of the coins in the market
                per run, and holders are paid in {quoteLabel}. Fixed at launch, like the rate.
              </>
            )}
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * The First Buy (#172, after new-stoker's launch page): one large amount in the Quote Asset, whose live quote the summary
 * shows, and for a Creator the operator has allowed, an airdrop paid from it.
 */
export function LaunchOptions({ options: o, coin }: { options: LaunchOptionsState; coin: string }) {
  const coinLabel = coin || "coins";
  const kept = o.bought !== null && o.airdropOn && !o.airdrop.problem ? o.bought - o.airdrop.total : null;

  return (
    <div className={styles.options}>
      <label className={`${styles.amount} ${o.firstBuyProblem ? styles.invalid : ""}`}>
        <input
          id="first-buy"
          className="mono"
          inputMode="decimal"
          autoComplete="off"
          placeholder="0"
          aria-label="First buy"
          value={o.firstBuyText}
          onChange={(e) => o.setFirstBuyText(e.target.value.replace(",", "."))}
          aria-invalid={Boolean(o.firstBuyProblem)}
          aria-describedby={o.firstBuyProblem ? "first-buy-error" : undefined}
        />
        <span className={styles.unit}>{o.quote?.symbol}</span>
      </label>
      {o.firstBuyProblem && (
        <p id="first-buy-error" className={styles.hintError}>
          {o.firstBuyProblem}
        </p>
      )}

      {o.airdropAllowed && (
        <div className={styles.airdrop}>
          <label className={styles.toggle}>
            <input type="checkbox" checked={o.airdropOn} onChange={(e) => o.setAirdropOn(e.target.checked)} />
            <span>Airdrop part of your first buy to other wallets</span>
          </label>
          {o.airdropOn && (
            <div className={styles.field}>
              <label htmlFor="airdrop-list">Wallets and amounts</label>
              <textarea
                id="airdrop-list"
                className={`${styles.list} ${o.airdropProblem ? styles.invalid : ""}`}
                // One wallet per line; on a phone its amount wraps under the address, which the type is sized to keep whole.
                // The box grows with the list up to a point, then scrolls (by wrapped lines where CSS `field-sizing` works).
                rows={Math.min(Math.max(o.airdropText.split("\n").length, LIST_MIN_ROWS), LIST_MAX_ROWS)}
                spellCheck={false}
                autoComplete="off"
                placeholder={"Wallet address, coins\nOne wallet per line"}
                value={o.airdropText}
                onChange={(e) => o.setAirdropText(e.target.value)}
                aria-invalid={Boolean(o.airdropProblem)}
                aria-describedby="airdrop-hint"
              />
              <p id="airdrop-hint" className={o.airdropProblem ? styles.hintError : styles.hint}>
                {o.airdropProblem ? (
                  o.airdropProblem
                ) : o.airdrop.recipients.length === 0 ? (
                  `One wallet per line: its address, then the coins it gets. Up to ${AIRDROP_MAX_RECIPIENTS} wallets.`
                ) : o.airdropMissing ? (
                  o.airdropMissing
                ) : (
                  <>
                    {o.airdrop.recipients.length} {o.airdrop.recipients.length === 1 ? "wallet gets" : "wallets get"}{" "}
                    <span className="mono">{formatUnits(o.airdrop.total.toString(), COIN_DECIMALS, COIN_DECIMALS)}</span> {coinLabel},{" "}
                    {supplyShare(o.airdrop.total)} of the supply
                    {kept !== null && (
                      <>
                        . You keep <span className="mono">{formatUnits(kept.toString(), COIN_DECIMALS, 0)}</span>
                      </>
                    )}
                    . Sent from your wallet right after the launch.
                  </>
                )}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
