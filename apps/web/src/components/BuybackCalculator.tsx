"use client";

import { useState } from "react";
import styles from "./BuybackCalculator.module.css";

/** A SOL figure to read: compact above a million, else whole SOL with separators, two decimals under ten. */
function sol(n: number) {
  if (!Number.isFinite(n)) return "-";
  if (n >= 1_000_000) return n.toLocaleString("en-US", { notation: "compact", maximumSignificantDigits: 3 });
  return n.toLocaleString("en-US", { maximumFractionDigits: n < 10 ? 2 : 0 });
}

/**
 * "Run the numbers" (owner, 2026-10-30, after the shape of pump.fun's coin page): what a year of revenue at the Burn's
 * share buys back, against a market cap, as a yield and a multiple. Illustrative and labelled so: the two inputs
 * start from today's figures and the visitor moves them; nothing here is a projection.
 */
export function BuybackCalculator({ annualSol, marketCapSol, burnShareBps, symbol }: { annualSol: number | null; marketCapSol: number | null; burnShareBps: number; symbol: string }) {
  const [revenue, setRevenue] = useState(annualSol === null ? "" : String(Math.round(annualSol)));
  const [cap, setCap] = useState(marketCapSol === null ? "" : String(Math.round(marketCapSol)));
  const r = Number(revenue);
  const c = Number(cap);
  const buyback = r > 0 ? (r * burnShareBps) / 10_000 : null;
  const yieldPct = buyback !== null && c > 0 ? (buyback / c) * 100 : null;
  const multiple = r > 0 && c > 0 ? c / r : null;
  return (
    <div className={styles.calc}>
      <div className={styles.inputs}>
        <label className={styles.field}>
          <span>Revenue a year, SOL</span>
          <input className="input" inputMode="decimal" value={revenue} onChange={(e) => setRevenue(e.target.value.replace(/[^\d.]/g, ""))} placeholder="0" />
        </label>
        <label className={styles.field}>
          <span>{symbol} market cap, SOL</span>
          <input className="input" inputMode="decimal" value={cap} onChange={(e) => setCap(e.target.value.replace(/[^\d.]/g, ""))} placeholder="0" />
        </label>
      </div>
      <dl className={styles.results}>
        <div>
          <dt>Bought back and burned a year</dt>
          <dd><span className="mono">{buyback === null ? "-" : sol(buyback)}</span> SOL</dd>
          <dd className={styles.how}>{burnShareBps / 100}% of the revenue</dd>
        </div>
        <div>
          <dt>Buyback yield</dt>
          <dd><span className="mono">{yieldPct === null ? "-" : yieldPct.toLocaleString("en-US", { maximumFractionDigits: yieldPct < 1 ? 2 : 1 })}</span>%</dd>
          <dd className={styles.how}>of the market cap, a year</dd>
        </div>
        <div>
          <dt>Market cap to revenue</dt>
          <dd><span className="mono">{multiple === null ? "-" : multiple.toLocaleString("en-US", { maximumFractionDigits: multiple < 10 ? 1 : 0 })}</span>x</dd>
          <dd className={styles.how}>the multiple at these figures</dd>
        </div>
      </dl>
      <p className={styles.note}>
        Illustrative only: the inputs start from today&apos;s figures and move as you type. Revenue varies with trading, the Burn buys at the
        market&apos;s price, and nothing here is a forecast or a promise.
      </p>
    </div>
  );
}
