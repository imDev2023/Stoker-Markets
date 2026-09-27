import type { QuoteRef, Trade } from "@launchpad/contract";
import { COIN_DECIMALS, explorerUrl, formatUnits, quoteTicker, shortAddress, timeAgo } from "@/lib/format";
import { Price } from "./Price";
import styles from "./TradeHistory.module.css";

/** The latest trades on a Launch's curve, newest first. */
export function TradeHistory({
  trades, symbol, quote, platform, now,
}: { trades: Trade[]; symbol: string; quote: QuoteRef; platform: { cluster: string; rpcUrl: string }; now: number }) {
  return (
    <section className={styles.card} aria-labelledby="trades-title">
      <h2 id="trades-title" className={styles.title}>Trades</h2>
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
            {trades.map((t) => (
              <tr key={`${t.signature}-${t.baseAmount}-${t.side}`}>
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
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
