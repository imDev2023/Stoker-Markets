"use client";

import { useId, useMemo, useState } from "react";
import type { QuoteAsset } from "@launchpad/contract";
import { searchQuotes } from "@/lib/assets";
import { inChip, PAIRED_CHIPS, type PairedChip } from "@/lib/board";
import { formatAmount, quoteTicker } from "@/lib/format";
import { quoteKind } from "@/lib/landing";
import { QuoteLogo } from "./QuoteLogo";
import styles from "./QuoteChooser.module.css";

/** Cards shown before "Show all": three rows of three; with hundreds of Quote Assets, a kind or a search is the way to the rest. */
const SHOWN = 9;

/** The name, unless it only repeats the ticker (common for memecoins). */
const distinctName = (q: QuoteAsset) => (q.name && q.name.toLowerCase() !== q.symbol?.toLowerCase() ? q.name : null);

const graduationAmount = (q: QuoteAsset) => (q.graduationTarget ? `${formatAmount(q.graduationTarget.raw, q.decimals)} ${quoteTicker(q)}` : null);

/**
 * The Quote Asset chooser on the launch form: the kinds as chips with their counts (the same chips as the board and the
 * assets page), a search, and the assets as cards, one radio each. An asset that can't be launched against stays in
 * view with its reason but can't be chosen. Each card says what kind of asset it is; what its issuer can do is further
 * information under the form and on the asset's page, never a chip under its name (owner, 2026-10-10).
 */
export function QuoteChooser({ quotes, value, onChange }: { quotes: QuoteAsset[]; value: string | null; onChange: (mint: string) => void }) {
  const id = useId();
  const [chip, setChip] = useState<PairedChip>(PAIRED_CHIPS[0]!);
  const [query, setQuery] = useState("");
  const [all, setAll] = useState(false);
  // Only kinds something is quoted in: the dev chain quotes six assets, mainnet six hundred.
  const chips = useMemo(() => PAIRED_CHIPS.map((c) => ({ chip: c, count: quotes.filter((q) => inChip(q, c)).length })).filter((c) => c.count > 0), [quotes]);
  const matches = useMemo(() => searchQuotes(quotes.filter((q) => inChip(q, chip)), query), [quotes, chip, query]);
  const shown = all || query.trim() ? matches : matches.slice(0, SHOWN);

  return (
    <div className={styles.chooser}>
      <div className={styles.tools}>
        <div className={styles.chips} role="group" aria-label="Kind">
          {chips.map(({ chip: c, count }) => (
            <button key={c.label} type="button" aria-pressed={c === chip} onClick={() => { setChip(c); setAll(false); }}>
              {c.label} <span className={styles.count}>{count}</span>
            </button>
          ))}
        </div>
        <label className={styles.search}>
          <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true">
            <circle cx="8.5" cy="8.5" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
            <path d="m13 13 4.5 4.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
          <input
            type="search"
            aria-label="Search Quote Assets"
            placeholder="Search by name, ticker or mint"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoComplete="off"
            spellCheck={false}
          />
        </label>
      </div>

      <div className={styles.grid} role="radiogroup" aria-label="Pair with">
        {shown.map((q) => (
          <label key={q.mint} className={`${styles.card} ${q.launchable ? "" : styles.closed}`}>
            <input
              type="radio"
              name={`${id}-quote`}
              value={q.mint}
              checked={q.mint === value}
              disabled={!q.launchable}
              onChange={() => onChange(q.mint)}
            />
            <QuoteLogo quote={q} size={30} />
            <span className={styles.text}>
              <span className={styles.title}>
                <span className={styles.ticker}>{quoteTicker(q)}</span>
                {distinctName(q) && <span className={styles.name}>{distinctName(q)}</span>}
              </span>
              <span className={styles.kind}>{quoteKind(q)}</span>
              <span className={styles.target}>{q.launchable ? `graduates at ${graduationAmount(q)}` : q.reason}</span>
            </span>
          </label>
        ))}
      </div>
      {shown.length === 0 && <p className={styles.note}>No Quote Asset matches &ldquo;{query.trim()}&rdquo;.</p>}
      {matches.length > shown.length && (
        <button type="button" className={styles.more} onClick={() => setAll(true)}>
          Show all {matches.length.toLocaleString("en-US")}
        </button>
      )}
    </div>
  );
}
