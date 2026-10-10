"use client";

import type { LaunchQuote, LaunchSummary } from "@launchpad/contract";
import { quoteTicker } from "@/lib/format";
import { quoteKind } from "@/lib/landing";
import { QuoteLogo } from "./QuoteLogo";
import styles from "./AssetRail.module.css";

/** The Quote Assets coins are paired with, each with its coins' count and their 24h volume across the coins in view, grouped by kind. */
export function assetGroups(quotes: LaunchQuote[], launches: LaunchSummary[]) {
  const volume = new Map<string, number>();
  for (const l of launches) volume.set(l.quote.mint, (volume.get(l.quote.mint) ?? 0) + (l.market.volume24h.usd ?? 0));
  const entries = quotes
    .map((q) => ({ quote: q, volumeUsd: volume.get(q.mint) ?? 0 }))
    .sort((a, b) => b.volumeUsd - a.volumeUsd || b.quote.launches - a.quote.launches);
  const groups = new Map<string, typeof entries>();
  for (const e of entries) {
    const kind = quoteKind(e.quote);
    groups.set(kind, [...(groups.get(kind) ?? []), e]);
  }
  return [...groups.entries()].map(([kind, assets]) => ({ kind, assets }));
}

export const compactUsd = (usd: number) => `$${usd.toLocaleString("en-US", { notation: "compact", maximumFractionDigits: 1 })}`;

/**
 * Candidate B1: a rail of the Quote Assets in use, "All" first, then each asset under its kind with how many coins it
 * pairs and their 24h volume; the chosen one filters the board. It replaces the chip row and the Quote Asset filter.
 */
export function AssetRail({ quotes, launches, value, onChange }: { quotes: LaunchQuote[]; launches: LaunchSummary[]; value: string | null; onChange: (mint: string | null) => void }) {
  const total = quotes.reduce((n, q) => n + q.launches, 0);
  const groups = assetGroups(quotes, launches);
  return (
    <nav className={styles.rail} aria-label="Paired with">
      <button type="button" className={styles.all} aria-pressed={value === null} onClick={() => onChange(null)}>
        <span className={styles.ticker}>All assets</span>
        <span className={styles.count}>{total}</span>
      </button>
      {groups.map(({ kind, assets }) => (
        <section key={kind} className={styles.group}>
          <h3 className={styles.kind}>{kind}</h3>
          {assets.map(({ quote, volumeUsd }) => (
            <button key={quote.mint} type="button" className={styles.asset} aria-pressed={value === quote.mint} onClick={() => onChange(quote.mint)}>
              <QuoteLogo quote={quote} size={22} />
              <span className={styles.ticker}>{quoteTicker(quote)}</span>
              <span className={styles.figures}>
                <span className={styles.count}>{quote.launches} {quote.launches === 1 ? "coin" : "coins"}</span>
                <span className={styles.volume}>{compactUsd(volumeUsd)}</span>
              </span>
            </button>
          ))}
        </section>
      ))}
    </nav>
  );
}

/**
 * Candidate B3: the same assets as a strip of tiles above the table, the busiest first, scrolling sideways past the
 * first few; a tile filters the board.
 */
export function AssetStrip({ quotes, launches, value, onChange }: { quotes: LaunchQuote[]; launches: LaunchSummary[]; value: string | null; onChange: (mint: string | null) => void }) {
  const total = quotes.reduce((n, q) => n + q.launches, 0);
  const assets = assetGroups(quotes, launches).flatMap((g) => g.assets);
  return (
    <div className={styles.strip} role="group" aria-label="Paired with">
      <button type="button" className={styles.tile} aria-pressed={value === null} onClick={() => onChange(null)}>
        <span className={styles.tileTop}><span className={styles.ticker}>All</span></span>
        <span className={styles.tileKind}>every asset</span>
        <span className={styles.tileFigures}><span>{total} coins</span></span>
      </button>
      {assets.map(({ quote, volumeUsd }) => (
        <button key={quote.mint} type="button" className={styles.tile} aria-pressed={value === quote.mint} onClick={() => onChange(quote.mint)}>
          <span className={styles.tileTop}>
            <QuoteLogo quote={quote} size={22} />
            <span className={styles.ticker}>{quoteTicker(quote)}</span>
          </span>
          <span className={styles.tileKind}>{quoteKind(quote)}</span>
          <span className={styles.tileFigures}>
            <span>{quote.launches} {quote.launches === 1 ? "coin" : "coins"}</span>
            <span className={styles.volume}>{compactUsd(volumeUsd)}</span>
          </span>
        </button>
      ))}
    </div>
  );
}
