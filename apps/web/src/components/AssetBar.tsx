"use client";

import { Fragment } from "react";
import type { LaunchQuote } from "@launchpad/contract";
import type { BoardQuery } from "@/lib/api";
import { inChip, PAIRED_CHIPS, type PairedChip } from "@/lib/board";
import { quoteTicker } from "@/lib/format";
import { QuoteLogo } from "./QuoteLogo";
import styles from "./AssetBar.module.css";

const compactUsd = (usd: number) => `$${usd.toLocaleString("en-US", { notation: "compact", maximumFractionDigits: 1 })}`;

/**
 * The board's "Paired with" control (owner, 2026-10-31, after Pump.fun's filter row; from 2026-10-11 to then it was a
 * rail beside the board, B1 of docs/design/layout.md): one row of chips that slides sideways, the kinds of Quote Asset
 * and after each kind the assets coins are paired with, each with how many coins and (an asset) the day's volume
 * across every coin paired with it, as the API sums it; a zero volume says nothing and is left out (#135). A kind
 * filters the board, an asset narrows it to that one pair; the kinds are there before the first coin (the owner's
 * rule: never a control behind an empty state), so an empty board still shows what it can do. The row runs to the
 * column's edges and fades at an end where there is more; the table has the whole column under it.
 */
export function AssetBar({ className = "", quotes, query, onKind, onAsset }: {
  className?: string;
  quotes: LaunchQuote[];
  query: BoardQuery;
  onKind: (chip: PairedChip) => void;
  onAsset: (mint: string) => void;
}) {
  const assets = quotes
    .map((q) => ({ quote: q, volumeUsd: q.volume24h.usd ?? 0 }))
    .sort((a, b) => b.volumeUsd - a.volumeUsd || b.quote.launches - a.quote.launches);
  const total = quotes.reduce((n, q) => n + q.launches, 0);
  const [all, ...kinds] = PAIRED_CHIPS;
  const kindChosen = (chip: PairedChip) => query.quote === null && query.category === chip.category && query.issuer === chip.issuer;
  // The figure alone on the chip; its unit stays in the chip's name ("14 coins").
  const coins = (n: number) =>
    n > 0 ? (
      <span className={styles.count}>
        {n} <span className="visually-hidden">{n === 1 ? "coin" : "coins"}</span>
      </span>
    ) : null;
  return (
    <div className={`${styles.bar} ${className}`} role="group" aria-label="Paired with" data-scrolls>
      <button type="button" className={styles.all} aria-pressed={kindChosen(all!)} onClick={() => onKind(all!)}>
        All assets
        {coins(total)}
      </button>
      {kinds.map((chip) => {
        const inKind = assets.filter((a) => inChip(a.quote, chip));
        return (
          <Fragment key={chip.label}>
            <button type="button" className={styles.kind} aria-pressed={kindChosen(chip)} onClick={() => onKind(chip)}>
              {chip.label}
              {coins(inKind.reduce((n, a) => n + a.quote.launches, 0))}
            </button>
            {inKind.map(({ quote, volumeUsd }) => (
              <button key={quote.mint} type="button" className={styles.asset} aria-pressed={query.quote === quote.mint} onClick={() => onAsset(quote.mint)}>
                <QuoteLogo quote={quote} size={18} />
                <span className={styles.ticker}>{quoteTicker(quote)}</span>
                {coins(quote.launches)}
                {volumeUsd > 0 && <span className={styles.volume}>{compactUsd(volumeUsd)}</span>}
              </button>
            ))}
          </Fragment>
        );
      })}
    </div>
  );
}
