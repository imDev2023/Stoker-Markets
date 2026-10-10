import { Fragment } from "react";
import type { Graduation, QuoteRef, Trade } from "@launchpad/contract";
import { COIN_DECIMALS, explorerUrl, formatUnits, quoteTicker, shortAddress, timeAgo } from "@/lib/format";
import { Price } from "./Price";
import styles from "./TradeHistory.module.css";

/** The latest trades of a Launch's coin, on its curve and after Graduation in its pool, newest first. */
export function TradeHistory({
  trades, symbol, quote, platform, now, graduation,
}: {
  trades: Trade[];
  symbol: string;
  quote: QuoteRef;
  platform: { cluster: string; rpcUrl: string };
  now: number;
  graduation: Graduation | null;
}) {
  // Graduation is marked where the curve's trades end and the pool's begin.
  const lastCurveTrade = graduation ? trades.findIndex((t) => t.venue === "curve") : -1;
  return (
    <section className={`card ${styles.card}`} aria-labelledby="trades-title">
      <h2 id="trades-title" className={`t-h3 ${styles.title}`}>Trades</h2>
      {trades.length === 0 ? (
        <p className={styles.empty}>No trades yet. Be the first to buy.</p>
      ) : (
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col">Side</th>
              <th scope="col" className={styles.num}>{symbol}</th>
              <th scope="col" className={styles.num}>{quoteTicker(quote)}</th>
              <th scope="col" className={`${styles.num} ${styles.wide}`}>Price</th>
              <th scope="col" className={styles.wide}>Trader</th>
              <th scope="col" className={`${styles.num} ${styles.time}`}>Time</th>
            </tr>
          </thead>
          <tbody>
            {trades.map((t, i) => (
              <Fragment key={`${t.signature}-${t.baseAmount}-${t.side}`}>
                {i === lastCurveTrade && graduation && (
                  <tr className={styles.milestone}>
                    <td colSpan={6}>
                      <a href={explorerUrl("tx", graduation.signature, platform)} target="_blank" rel="noreferrer">
                        Graduated to its Raydium pool
                      </a>
                    </td>
                  </tr>
                )}
                <tr>
                  <td>
                    <span className={`${styles.side} ${styles[t.side]}`}>{t.side === "buy" ? "Buy" : "Sell"}</span>
                  </td>
                  <td className={`mono ${styles.num}`}>{formatUnits(t.baseAmount, COIN_DECIMALS, 0)}</td>
                  <td className={`mono ${styles.num}`}>{formatUnits(t.quoteAmount, quote.decimals)}</td>
                  <td className={`${styles.num} ${styles.wide}`}><Price value={t.price} /></td>
                  <td className={styles.wide}>
                    <a className="mono" href={explorerUrl("address", t.trader, platform)} target="_blank" rel="noreferrer">
                      {shortAddress(t.trader)}
                    </a>
                  </td>
                  <td className={styles.num}>
                    <a href={explorerUrl("tx", t.signature, platform)} target="_blank" rel="noreferrer" title="View transaction">
                      <time dateTime={t.time}>{timeAgo(t.time, now)}</time>
                    </a>
                  </td>
                </tr>
              </Fragment>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
