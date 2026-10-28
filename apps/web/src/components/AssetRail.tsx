"use client";

import type { LaunchQuote, LaunchSummary } from "@launchpad/contract";
import type { BoardQuery } from "@/lib/api";
import { inChip, PAIRED_CHIPS, type PairedChip } from "@/lib/board";
import { quoteTicker } from "@/lib/format";
import { QuoteLogo } from "./QuoteLogo";
import styles from "./AssetRail.module.css";

const compactUsd = (usd: number) => `$${usd.toLocaleString("en-US", { notation: "compact", maximumFractionDigits: 1 })}`;

/**
 * The board's "Paired with" control (docs/design/layout.md, B1): a rail of the kinds of Quote Asset, and under each the
 * assets coins are paired with, each with how many coins and their 24h volume across the coins in view. A kind filters
 * the board as the chips did, an asset narrows it to that one pair; the kinds are there before the first coin, so an
 * empty board still shows what it can do. Narrow windows lay the rail down as a strip of chips.
 */
export function AssetRail({ className = "", quotes, launches, query, onKind, onAsset }: {
  className?: string;
  quotes: LaunchQuote[];
  launches: LaunchSummary[];
  query: BoardQuery;
  onKind: (chip: PairedChip) => void;
  onAsset: (mint: string) => void;
}) {
  const volume = new Map<string, number>();
  for (const l of launches) volume.set(l.quote.mint, (volume.get(l.quote.mint) ?? 0) + (l.market.volume24h.usd ?? 0));
  const assets = quotes
    .map((q) => ({ quote: q, volumeUsd: volume.get(q.mint) ?? 0 }))
    .sort((a, b) => b.volumeUsd - a.volumeUsd || b.quote.launches - a.quote.launches);
  const total = quotes.reduce((n, q) => n + q.launches, 0);
  const [all, ...kinds] = PAIRED_CHIPS;
  const kindChosen = (chip: PairedChip) => query.quote === null && query.category === chip.category && query.issuer === chip.issuer;
  const coins = (n: number) => (n > 0 ? <span className={styles.count}>{n} {n === 1 ? "coin" : "coins"}</span> : null);
  return (
    <div className={`${styles.rail} ${className}`} role="group" aria-label="Paired with">
      <button type="button" className={styles.all} aria-pressed={kindChosen(all!)} onClick={() => onKind(all!)}>
        All assets
        {coins(total)}
      </button>
      {kinds.map((chip) => {
        const inKind = assets.filter((a) => inChip(a.quote, chip));
        return (
          <section key={chip.label} className={styles.group}>
            <button type="button" className={styles.kind} aria-pressed={kindChosen(chip)} onClick={() => onKind(chip)}>
              {chip.label}
              {coins(inKind.reduce((n, a) => n + a.quote.launches, 0))}
            </button>
            {inKind.map(({ quote, volumeUsd }) => (
              <button key={quote.mint} type="button" className={styles.asset} aria-pressed={query.quote === quote.mint} onClick={() => onAsset(quote.mint)}>
                <QuoteLogo quote={quote} size={20} />
                <span className={styles.ticker}>{quoteTicker(quote)}</span>
                <span className={styles.figures}>
                  {coins(quote.launches)}
                  <span className={styles.volume}>{compactUsd(volumeUsd)}</span>
                </span>
              </button>
            ))}
          </section>
        );
      })}
    </div>
  );
}
