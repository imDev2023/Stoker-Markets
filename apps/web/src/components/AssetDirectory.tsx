"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { LaunchQuote, QuoteAsset } from "@launchpad/contract";
import { assetKind, assetsSearch, ASSETS_SEARCH_MAX, DEFAULT_ASSETS, filterAssets, formatUsd, graduationInWords, groupAssets, type AssetsQuery } from "@/lib/assets";
import { inChip, PAIRED_CHIPS, type PairedChip } from "@/lib/board";
import { quoteTicker } from "@/lib/format";
import { QuoteLogo } from "./QuoteLogo";
import styles from "./AssetDirectory.module.css";
import { EmptyState } from "./EmptyState";

const COLUMNS = ["Asset", "Kind", "Price", "A coin graduates at", "Coins", ""] as const;

/** The name, unless it only repeats the ticker (common for memecoins). */
const distinctName = (q: QuoteAsset) => (q.name && q.name.toLowerCase() !== q.symbol?.toLowerCase() ? q.name : null);

/**
 * Every Quote Asset the registry quotes, in the terminal look: the kinds as chips with their counts, a search, and one
 * row an asset, grouped by kind until a chip or a search narrows the list. The query lives in the page's URL, so a
 * group can be linked to. Nothing here is a warning: what an asset's issuer can do is on the asset's own page.
 */
export function AssetDirectory({ quotes, inUse, initialQuery }: { quotes: QuoteAsset[]; inUse: LaunchQuote[]; initialQuery: AssetsQuery }) {
  const [query, setQuery] = useState(initialQuery);
  const coins = useMemo(() => new Map(inUse.map((q) => [q.mint, q.launches])), [inUse]);
  const counts = useMemo(() => new Map(PAIRED_CHIPS.map((c) => [c, quotes.filter((q) => inChip(q, c)).length])), [quotes]);
  const shown = useMemo(() => filterAssets(quotes, query), [quotes, query]);
  // Grouped only when the whole registry is on view; a chip or a search is one list, closest match first.
  const groups = useMemo(() => (query.category || query.issuer || query.q ? null : groupAssets(shown)), [shown, query]);
  const launchable = quotes.filter((q) => q.launchable).length;
  const chosen = PAIRED_CHIPS.find((c) => c.category === query.category && c.issuer === query.issuer) ?? PAIRED_CHIPS[0]!;

  function change(next: AssetsQuery) {
    setQuery(next);
    window.history.replaceState(null, "", `${window.location.pathname}${assetsSearch(next)}`);
  }

  const chip = (c: PairedChip) => change({ ...query, category: c.category, issuer: c.issuer });

  const rows = (assets: QuoteAsset[], label: string) => (
    <ul className={styles.rows} aria-label={label}>
      {assets.map((q) => {
        const target = graduationInWords(q);
        const n = coins.get(q.mint) ?? 0;
        return (
          <li key={q.mint}>
            <Link href={`/assets/${q.mint}`} className={styles.row}>
              <span className={styles.asset}>
                <QuoteLogo quote={q} size={22} />
                <span className={styles.ticker}>{quoteTicker(q)}</span>
                {distinctName(q) && <span className={styles.name}>{distinctName(q)}</span>}
              </span>
              <span className={styles.kind}>{assetKind(q)}</span>
              <span className={`${styles.num} ${styles.price}`} data-label="Price">{q.price?.usd ? formatUsd(q.price.usd) : "no price"}</span>
              <span className={`${styles.num} ${styles.target}`} data-label="Graduates at">{target ? target.amount : "-"}</span>
              <span className={`${styles.num} ${styles.coins}`} data-label="Coins">{n.toLocaleString("en-US")}</span>
              <span className={`${styles.status} ${q.launchable ? styles.open : styles.closed}`} title={q.reason ?? undefined}>
                {q.launchable ? "Launchable" : "Not launchable"}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );

  return (
    <section className={`shell ${styles.section}`} aria-labelledby="assets-title">
      <div className={styles.head}>
        <h1 id="assets-title" className={`t-h1 ${styles.title}`}>Assets</h1>
        <span className={styles.count}>
          {quotes.length.toLocaleString("en-US")} assets, {launchable.toLocaleString("en-US")} launchable
        </span>
      </div>
      <p className={styles.lead}>
        Every asset a coin can be priced in: each one Raydium quotes, read from the chain every five minutes and grouped by what it is. Pick one to
        see what is known about it and the coins paired with it.
      </p>
      <div className={styles.toolbar}>
        <label className={`input ${styles.search}`}>
          <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">
            <circle cx="8.5" cy="8.5" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
            <path d="m13 13 4.5 4.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
          <input
            type="search"
            value={query.q}
            maxLength={ASSETS_SEARCH_MAX}
            placeholder="Search name, ticker or mint address"
            aria-label="Search assets"
            autoComplete="off"
            spellCheck={false}
            onChange={(e) => change({ ...query, q: e.target.value.trim().slice(0, ASSETS_SEARCH_MAX) })}
          />
        </label>
        <div className={styles.chips} role="group" aria-label="Kind">
          {PAIRED_CHIPS.map((c) => (
            <button key={c.label} type="button" className="chip" aria-pressed={c === chosen} onClick={() => chip(c)}>
              {c.label} <span className={styles.chipCount}>{counts.get(c) ?? 0}</span>
            </button>
          ))}
        </div>
      </div>

      {shown.length === 0 ? (
        <EmptyState title="Nothing matches" action={<button type="button" className="button button-ghost" onClick={() => change(DEFAULT_ASSETS)}>Show every asset</button>}>
          {query.q ? `No asset matches "${query.q}".` : `No ${chosen.label.toLowerCase()} asset is quoted yet.`}
        </EmptyState>
      ) : (
        <div className={`card ${styles.table}`}>
          <div className={styles.columns} aria-hidden>
            {COLUMNS.map((c, i) => (
              <span key={i}>{c}</span>
            ))}
          </div>
          {groups
            ? groups.map((g) => (
                <section key={g.category} className={styles.group} aria-labelledby={`group-${g.category}`}>
                  <div className={styles.groupHead}>
                    <h2 id={`group-${g.category}`} className={styles.groupTitle}>
                      {g.label} <span className={styles.groupCount}>{g.assets.length.toLocaleString("en-US")}</span>
                    </h2>
                    <p className={styles.groupNote}>{g.note}</p>
                  </div>
                  {rows(g.assets, `${g.label} assets`)}
                </section>
              ))
            : rows(shown, "Assets")}
        </div>
      )}
    </section>
  );
}
