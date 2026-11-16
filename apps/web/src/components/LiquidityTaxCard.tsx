import Link from "next/link";
import type { CoinLiquidityTax, PlatformInfo, QuoteRef } from "@launchpad/contract";
import { COIN_DECIMALS, explorerUrl, formatUnits, formatUtc, quoteTicker } from "@/lib/format";
import { LIQUIDITY_LAUNCH, liquidityLine } from "@/lib/liquidityLaunch";
import styles from "./RewardsCard.module.css";

/**
 * A Liquidity Launch's tax (#215), in the place a Reward Launch's Holder Rewards card takes and in its shape, so the two
 * read as one family: the type's line (the whole tax goes to the coin's pool, and holders are paid nothing from it),
 * what waits for the pool and that it waits for Graduation, what every addition has put into the pool so far, and the
 * latest additions, each with its transaction. No round, no Payout Asset, no sale and no Diamond Hands: the coin has
 * none of them. The name and the line are `@/lib/liquidityLaunch`'s.
 */
export function LiquidityTaxCard({ tax, symbol, quote, graduated, platform }: {
  tax: CoinLiquidityTax;
  symbol: string;
  /** The coin's Quote Asset: the other half of every addition. */
  quote: QuoteRef;
  graduated: boolean;
  platform: PlatformInfo;
}) {
  const ticker = quoteTicker(quote);
  const coins = (raw: string) => formatUnits(raw, COIN_DECIMALS, 0);
  const paired = (raw: string) => formatUnits(raw, quote.decimals, Math.min(quote.decimals, 4));
  const rate = tax.taxBps / 100;
  return (
    <section className={`card ${styles.card}`} aria-labelledby="liquidity-tax-title" data-liquidity-tax-card="">
      <div className={styles.head}>
        <h2 id="liquidity-tax-title" className={`t-h3 ${styles.title}`}>{LIQUIDITY_LAUNCH.tax}</h2>
        <span className={styles.rate}>{rate}%</span>
      </div>
      {/* One string, so one text node, whatever the coin's state. */}
      <p className={styles.note}>
        {`Every transfer of ${symbol} withholds ${rate}% for its pool. ${liquidityLine(symbol)} ${
          graduated
            ? `Once enough has collected, part of it is sold in the pool for ${ticker} and the pair is added, locked for good.`
            : `It waits until ${symbol} graduates: then part of it is sold in the pool for ${ticker} and the pair is added, locked for good.`
        }`}
      </p>
      <dl className={styles.facts}>
        <div>
          <dt>Waiting for the pool</dt>
          <dd>
            <span className="mono">{coins(tax.waiting.total)}</span> {symbol}
            {tax.waiting.quote !== "0" && <> and <span className="mono">{paired(tax.waiting.quote)}</span> {ticker}</>}
          </dd>
        </div>
        <div>
          <dt>Added to the pool so far</dt>
          <dd>
            <span className="mono">{coins(tax.coinsAdded)}</span> {symbol}
            {tax.quoteAdded !== "0" && <> and <span className="mono">{paired(tax.quoteAdded)}</span> {ticker}</>}
          </dd>
        </div>
      </dl>
      {tax.recent.length > 0 ? (
        <ul className={styles.rounds} aria-label="Additions to the pool">
          {tax.recent.map((a) => (
            <li key={a.signature}>
              <span>
                <a href={explorerUrl("tx", a.signature, platform)} target="_blank" rel="noreferrer">
                  Added <span className="mono">{coins(a.coins)}</span> {symbol} to the pool, locked
                </a>{" "}
                <time dateTime={a.time}>{formatUtc(a.time)}</time>
              </span>
              <span className={`mono ${styles.amount}`}>{paired(a.quote)} {ticker}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className={styles.note}>
          {graduated
            ? "Nothing added yet: the first addition runs once enough tax has collected."
            : `Nothing added yet: the tax waits for ${symbol} to graduate.`}
        </p>
      )}
      <p className={styles.note}>
        <Link href="/fees">Every fee, explained</Link>
      </p>
    </section>
  );
}
