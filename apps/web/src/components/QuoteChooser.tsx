"use client";

import { useId, useMemo, useState } from "react";
import type { QuoteAsset } from "@launchpad/contract";
import { searchQuotes } from "@/lib/assets";
import { CATEGORY_LABELS, inChip, ISSUER_LABELS, PAIRED_CHIPS, type PairedChip } from "@/lib/board";
import { formatAmount, quoteTicker } from "@/lib/format";
import { QuoteLogo } from "./QuoteLogo";
import styles from "./QuoteChooser.module.css";

/** Cards shown before "Show all": three rows of three; with hundreds of Quote Assets, a kind or a search is the way to the rest. */
const SHOWN = 9;
/**
 * A card's Graduation Target fits one line: whole units from a thousand up (9,360 USDC), 1.66M from a million. The
 * summary beside the form carries the exact figure.
 */
const WHOLE_FROM = 1_000n;
const COMPACT_FROM = 1_000_000n;

/** The name, unless it only repeats the ticker (common for memecoins). */
const distinctName = (q: QuoteAsset) => (q.name && q.name.toLowerCase() !== q.symbol?.toLowerCase() ? q.name : null);

/** The kind the chips name the asset by: its issuer for a stock, its category otherwise. */
const kindOf = (q: QuoteAsset) => (q.issuer ? ISSUER_LABELS[q.issuer] : CATEGORY_LABELS[q.category]);

function graduationAmount(q: QuoteAsset) {
  if (!q.graduationTarget) return null;
  const units = BigInt(q.graduationTarget.raw) / 10n ** BigInt(q.decimals);
  const amount = units >= COMPACT_FROM
    ? Number(units).toLocaleString("en-US", { notation: "compact", maximumSignificantDigits: 3 })
    : units >= WHOLE_FROM
      ? units.toLocaleString("en-US")
      : formatAmount(q.graduationTarget.raw, q.decimals);
  return `${amount} ${quoteTicker(q)}`;
}

/** The chooser's search, placed by the form beside the section's title so the kinds get the whole width under it. */
export function QuoteSearch({ value, onChange }: { value: string; onChange: (query: string) => void }) {
  return (
    <label className={styles.search}>
      <svg viewBox="0 0 20 20" width="15" height="15" aria-hidden="true">
        <circle cx="8.5" cy="8.5" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
        <path d="m13 13 4.5 4.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
      <input
        type="search"
        aria-label="Search Quote Assets"
        placeholder="Search by name, ticker or mint"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete="off"
        spellCheck={false}
      />
    </label>
  );
}

/**
 * The Quote Asset chooser on the launch form: a recommended three ahead of everything (SOL, the deepest stablecoin and
 * the deepest stock, docs/design/layout.md), the kinds as chips with their counts (the same chips as the board and the
 * assets page), and the assets as cards, one radio each, the deepest markets first. An asset that can't be launched
 * against stays in view with its reason but can't be chosen. Nine cards show before "Show all", which opens the rest
 * in a region that scrolls on its own, so the form never grows by hundreds of cards. Each card says what kind of asset
 * it is; what its issuer can do is further information under the form and on the asset's page, never a chip under its
 * name (owner, 2026-10-10).
 */
export function QuoteChooser({ quotes, value, query, onChange }: { quotes: QuoteAsset[]; value: string | null; query: string; onChange: (mint: string) => void }) {
  const id = useId();
  const [chip, setChip] = useState<PairedChip>(PAIRED_CHIPS[0]!);
  const [all, setAll] = useState(false);
  // Only kinds something is quoted in: the test chain quotes six assets, mainnet six hundred.
  const chips = useMemo(() => PAIRED_CHIPS.map((c) => ({ chip: c, count: quotes.filter((q) => inChip(q, c)).length })).filter((c) => c.count > 0), [quotes]);
  const matches = useMemo(() => searchQuotes(quotes.filter((q) => inChip(q, chip)), query), [quotes, chip, query]);
  const searching = query.trim() !== "";
  const shown = all || searching ? matches : matches.slice(0, SHOWN);
  // The recommended few ahead of the hundreds: SOL, the deepest stablecoin and the deepest stock, which the chooser's
  // order (deepest first) picks out.
  const picks = useMemo(() => {
    const first = (category: QuoteAsset["category"]) => quotes.find((q) => q.category === category && q.launchable);
    return [first("sol"), first("stablecoin"), first("tokenized_stock")].filter((q): q is QuoteAsset => q !== undefined);
  }, [quotes]);

  // A recommended card mirrors its card in the grid, so it is a radio group of its own: two radios of one group can't both show chosen.
  const card = (q: QuoteAsset, big = false) => (
    <label key={q.mint} className={`${styles.card} ${big ? styles.big : ""} ${q.launchable ? "" : styles.closed}`}>
      <input
        type="radio"
        name={big ? `${id}-pick` : `${id}-quote`}
        value={q.mint}
        checked={q.mint === value}
        disabled={!q.launchable}
        onChange={() => onChange(q.mint)}
      />
      <QuoteLogo quote={q} size={big ? 44 : 34} />
      <span className={styles.text}>
        <span className={styles.title}>
          <span className={styles.ticker}>{quoteTicker(q)}</span>
          {distinctName(q) && <span className={styles.name}>{distinctName(q)}</span>}
        </span>
        <span className={styles.meta}>
          <span className={styles.kind}>{kindOf(q)}</span>
          <span className={q.launchable ? styles.target : styles.reason}>{q.launchable ? `graduates at ${graduationAmount(q)}` : q.reason}</span>
        </span>
      </span>
    </label>
  );

  return (
    <div className={styles.chooser}>
      {picks.length > 0 && !searching && chip === PAIRED_CHIPS[0] && (
        <div className={styles.featured} role="radiogroup" aria-label="Recommended">
          {picks.map((q) => card(q, true))}
        </div>
      )}
      <div className={styles.chips} role="group" aria-label="Kind">
        {chips.map(({ chip: c, count }) => (
          <button key={c.label} type="button" className="chip" aria-pressed={c === chip} onClick={() => { setChip(c); setAll(false); }}>
            {c.label} <span className={styles.count}>{count.toLocaleString("en-US")}</span>
          </button>
        ))}
      </div>

      <div className={`${styles.grid} ${all && !searching ? styles.expanded : ""}`} role="radiogroup" aria-label="Pair with">
        {shown.map((q) => card(q))}
      </div>
      {shown.length === 0 && <p className={styles.note}>No Quote Asset matches &ldquo;{query.trim()}&rdquo;.</p>}
      {!searching && matches.length > SHOWN && (
        <button type="button" className={`button button-ghost ${styles.more}`} aria-expanded={all} onClick={() => setAll(!all)}>
          {all ? "Show fewer" : `Show all ${matches.length.toLocaleString("en-US")}`}
          <span className={styles.chevron} aria-hidden />
        </button>
      )}
    </div>
  );
}
