import Link from "next/link";
import type { CoinEarnings, CreatorBuyback, PlatformInfo } from "@launchpad/contract";
import { DESTINATION_TAGS, type EarningsRule } from "@/lib/earnings";
import { COIN_DECIMALS, explorerUrl, formatUnits, formatUtc, quoteTicker, SOL_DECIMALS } from "@/lib/format";
import { Address } from "./Address";
import { DiamondHands } from "./DiamondHands";
import styles from "./EarningsCard.module.css";

/** The rule's list, named for a screen reader. */
const LIST: Record<EarningsRule, string> = { holders: "Earnings rounds", burn: "Buybacks", liquidity: "Liquidity additions" };

/** A rule that has something waiting and has not run yet: what is missing, and when the platform's job next looks. */
const NOT_YET: Record<EarningsRule, string> = {
  holders: "No round yet. The platform's job runs about once an hour and opens the first once enough is waiting.",
  burn: "No buyback yet. The platform's job runs about once an hour and buys once enough is waiting.",
  liquidity: "Nothing added yet. The platform's job runs about once an hour and adds once enough is waiting.",
};

/**
 * Where a coin's Creator Earnings go when its Creator pointed them away from their own wallet at launch (ADR 0011): what
 * the rule does, who applies it (the platform's job, every action on the public Ledger: accountable, not trustless),
 * what has been collected for it and what waits for its next run, and every round it paid or buyback it made, each
 * with its transaction; until the rule has run, one line says what it is waiting for, as the Holder rewards card
 * does. A coin that pays its Creator's wallet has no rule and no card. `weighted` says the Reward Round rules in force
 * weigh coins by how long they were kept (the Holding Weight, ADR 0022): a coin that pays its holders then shows a
 * connected wallet its own Diamond Hands, since its rounds are split by them.
 */
export function EarningsCard({ earnings, symbol, platform, weighted = false }: { earnings: CoinEarnings; symbol: string; platform: PlatformInfo; weighted?: boolean }) {
  const rule = earnings.destination;
  if (rule === "wallet") return null;
  const quote = quoteTicker(earnings.quote);
  const decimals = earnings.quote.decimals;
  const coins = (raw: string) => formatUnits(raw, COIN_DECIMALS, 0);
  const amount = (raw: string) => formatUnits(raw, decimals, Math.min(decimals, 6));
  const { totals } = earnings;
  const waiting = earnings.waiting ?? "0";
  const minimum = earnings.minLamports ? formatUnits(earnings.minLamports, SOL_DECIMALS) : null;
  const ran = rule === "holders" ? earnings.rounds.length > 0 : earnings.buybacks.length > 0;

  return (
    <section className={`card ${styles.card}`} aria-labelledby="earnings-title" data-earnings-rule={rule}>
      <div className={styles.head}>
        <h2 id="earnings-title" className={`t-h3 ${styles.title}`}>Creator earnings</h2>
        <span className="tag tag-accent">{DESTINATION_TAGS[rule]}</span>
      </div>
      <p className={styles.note}>
        {rule === "holders" ? (
          <>
            At launch, the Creator of {symbol} pointed their earnings on this coin at its holders, for good. What the platform collects for
            the Creator is paid in {quote} to every wallet holding at least the minimum, by the size of its holding.
          </>
        ) : rule === "burn" ? (
          <>
            At launch, the Creator of {symbol} pointed their earnings on this coin at a buyback, for good. What the platform collects for
            the Creator buys {symbol} in its own market, on the curve or in its pool, and burns every coin it buys.
          </>
        ) : (
          <>
            At launch, the Creator of {symbol} pointed their earnings on this coin at its liquidity, for good. What the platform collects
            for the Creator buys {symbol} in its pool, pairs it with {quote} and adds both to the pool, locked for good.
            {earnings.waitsForGraduation && <> A coin has no pool until it graduates, so until then the earnings wait.</>}
          </>
        )}
      </p>
      <p className={styles.note}>
        No program on the chain enforces this: the platform&apos;s scheduled job applies it, and everything the job does is on the
        public <Link href="/revenue#ledger-title">Ledger</Link> for anyone to check.
      </p>
      {earnings.collected !== "0" && (
        <dl className={styles.facts}>
          <div>
            <dt>Collected so far</dt>
            <dd><span className="mono">{amount(earnings.collected)}</span> {quote}</dd>
          </div>
          {earnings.withheld !== "0" && (
            <div>
              <dt>Kept as Graduation Fee</dt>
              <dd><span className="mono">{amount(earnings.withheld)}</span> {quote}</dd>
            </div>
          )}
          {rule === "holders" && totals.rounds > 0 && (
            <div>
              <dt>Paid to holders</dt>
              <dd><span className="mono">{amount(totals.paidToHolders)}</span> {quote}</dd>
            </div>
          )}
          {rule !== "holders" && totals.buybacks > 0 && (
            <div>
              <dt>{rule === "burn" ? "Spent on buybacks" : "Spent on liquidity"}</dt>
              <dd><span className="mono">{amount(totals.spent)}</span> {quote}</dd>
            </div>
          )}
          {rule === "burn" && totals.buybacks > 0 && (
            <div>
              <dt>Burned</dt>
              <dd><span className="mono">{coins(totals.burned)}</span> {symbol}</dd>
            </div>
          )}
          {rule === "liquidity" && totals.buybacks > 0 && (
            <div>
              <dt>Added to the pool</dt>
              <dd>
                <span className="mono">{coins(totals.coinsAdded)}</span> {symbol} and <span className="mono">{amount(totals.quoteAdded)}</span> {quote}
              </dd>
            </div>
          )}
          {/* One label for every rule, short enough to keep to a line beside its neighbour on a phone. */}
          <div>
            <dt>{earnings.waitsForGraduation ? "Waiting for the pool" : "Waiting for the next run"}</dt>
            <dd><span className="mono">{amount(waiting)}</span> {quote}</dd>
          </div>
          {minimum && !earnings.waitsForGraduation && (
            <div>
              <dt>Runs once that is worth</dt>
              <dd><span className="mono">{minimum}</span> SOL</dd>
            </div>
          )}
        </dl>
      )}
      {rule === "holders" && earnings.rounds.length > 0 && (
        <ul className={styles.rows} aria-label={LIST[rule]}>
          {earnings.rounds.map((r) => (
            <li key={r.id}>
              <span>
                <Link href={`/rewards/rounds/${r.id}`}>Round of <time dateTime={r.startedAt}>{formatUtc(r.startedAt)}</time></Link>{" "}
                <span className={`${styles.status} ${r.status === "paid" ? styles.paid : ""}`}>
                  {r.status === "paid" ? "Paid" : "Paying"} · {r.eligibleHolders} {r.eligibleHolders === 1 ? "holder" : "holders"}
                </span>
              </span>
              <span className={`mono ${styles.amount}`}>
                {formatUnits(r.status === "paid" ? r.paid : r.distributable, r.payout.decimals, Math.min(r.payout.decimals, 6))} {r.payout.symbol}
              </span>
            </li>
          ))}
        </ul>
      )}
      {rule !== "holders" && earnings.buybacks.length > 0 && (
        <ul className={styles.rows} aria-label={LIST[rule]}>
          {earnings.buybacks.map((b) => (
            <li key={b.signature}>
              <span>
                <a href={explorerUrl("tx", b.signature, platform)} target="_blank" rel="noreferrer">
                  <Did buyback={b} symbol={symbol} quote={quote} coins={coins} amount={amount} />
                </a>{" "}
                <time dateTime={b.time}>{formatUtc(b.time)}</time>
                {b.liquidity && (
                  <>
                    {" "}· locked as <Address value={b.liquidity.lockedLiquidity} platform={platform} />
                  </>
                )}
              </span>
              <span className={`mono ${styles.amount}`}>{b.spent === null ? "Landing…" : `${amount(b.spent)} ${quote}`}</span>
            </li>
          ))}
        </ul>
      )}
      {!ran && (
        <p className={styles.note} data-earnings-waiting>
          {earnings.collected === "0"
            ? "Nothing has been collected for the Creator yet. The platform collects its fees about once an hour, and the Creator's share of them comes here."
            : earnings.waitsForGraduation
              ? `Nothing added yet: what has been collected waits for the pool ${symbol} gets when it graduates.`
              : NOT_YET[rule]}
        </p>
      )}
      {rule === "holders" && weighted && <DiamondHands mint={earnings.mint} symbol={symbol} />}
      {rule === "holders" && (
        <p className={styles.note}>
          <Link href="/rewards">The rules, and where your rewards are</Link>
        </p>
      )}
    </section>
  );
}

/** What one buyback did, as the words its transaction's link carries; one still landing says what it set out to do. */
function Did({ buyback: b, symbol, quote, coins, amount }: {
  buyback: CreatorBuyback;
  symbol: string;
  quote: string;
  coins: (raw: string) => string;
  amount: (raw: string) => string;
}) {
  const venue = b.venue === "curve" ? "on the curve" : "in the pool";
  if (b.status === "sending") return <>{b.kind === "burn" ? `Buying ${symbol} ${venue} to burn it` : `Adding ${symbol} and its pair to the pool`}</>;
  if (b.kind === "burn")
    return (
      <>
        Bought and burned <span className="mono">{coins(b.burned ?? b.coins ?? "0")}</span> {symbol} {venue}
      </>
    );
  if (b.liquidity)
    return (
      <>
        Added <span className="mono">{coins(b.liquidity.coins)}</span> {symbol} and <span className="mono">{amount(b.liquidity.quote)}</span> {quote} to the pool
      </>
    );
  return (
    <>
      Bought <span className="mono">{coins(b.coins ?? "0")}</span> {symbol} for the pool
    </>
  );
}
