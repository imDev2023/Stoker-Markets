import { Fragment } from "react";
import type { Graduation, QuoteRef, Trade } from "@launchpad/contract";
import { COIN_DECIMALS, explorerUrl, formatUnits, quoteTicker } from "@/lib/format";
import { Address } from "./Address";
import { EmptyState } from "./EmptyState";
import { Price } from "./Price";
import { RelativeTime } from "./RelativeTime";
import styles from "./TradeHistory.module.css";

/** The latest trades of a Launch's coin, on its curve and after Graduation in its pool, newest first. */
export function TradeHistory({
  trades, symbol, quote, platform, now, graduation, headingHidden = false,
}: {
  trades: Trade[];
  symbol: string;
  quote: QuoteRef;
  platform: { cluster: string; rpcUrl: string };
  now: number;
  graduation: Graduation | null;
  /** When a tab names the panel: the heading stays as the region's name, unseen. */
  headingHidden?: boolean;
}) {
  // Graduation is marked where the curve's trades end and the pool's begin.
  const lastCurveTrade = graduation ? trades.findIndex((t) => t.venue === "curve") : -1;
  return (
    <section className={`card ${styles.card}`} aria-labelledby="trades-title">
      <h2 id="trades-title" className={headingHidden ? "visually-hidden" : `t-h3 ${styles.title}`}>Trades</h2>
      {trades.length === 0 ? (
        <EmptyState bare title="The book opens with the first trade">No trades yet. Be the first to buy.</EmptyState>
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
                    <Address value={t.trader} platform={platform} />
                  </td>
                  <td className={styles.num}>
                    <a href={explorerUrl("tx", t.signature, platform)} target="_blank" rel="noreferrer">
                      <RelativeTime iso={t.time} now={now} />
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
