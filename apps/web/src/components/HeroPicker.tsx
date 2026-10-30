"use client";

import { useRouter } from "next/navigation";
import { useId, useMemo, useState, type FormEvent } from "react";
import type { QuoteAsset } from "@launchpad/contract";
import { searchQuotes } from "@/lib/assets";
import { quoteTicker } from "@/lib/format";
import { quoteKind, recommendedQuotes } from "@/lib/landing";
import { PairMark } from "./PairMark";
import { QuoteLogo } from "./QuoteLogo";
import styles from "./HeroPicker.module.css";

/** The form's own limits (packages/contract): a name up to 32 characters, a ticker up to 10 of A to Z, 0 to 9 and $. */
const NAME_MAX = 32;
const SYMBOL_MAX = 10;
/** Enough matches to pick from while typing; the launch form has every asset. */
const MATCHES = 5;

/**
 * The hero's pair picker (#133, candidate F, owner 2026-10-30): the product's own verb as the visual. A name, a ticker
 * and the asset the coin is priced in, chosen live over the Quote Assets the API lists (the launch form's recommended
 * three first, then a search over the rest), with the pair mark drawing itself as the fields fill. "Stoke it" opens
 * the launch form with the three carried in the query, so it opens filled and the launch itself happens there, with
 * the wallet, the image and the options. A plain GET form, so it works before the script does.
 */
export function HeroPicker({ quotes }: { quotes: QuoteAsset[] }) {
  const router = useRouter();
  const id = useId();
  const launchable = useMemo(() => quotes.filter((q) => q.launchable), [quotes]);
  const picks = useMemo(() => recommendedQuotes(launchable), [launchable]);
  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("");
  const [query, setQuery] = useState("");
  const [mint, setMint] = useState<string | null>(picks[0]?.mint ?? launchable[0]?.mint ?? null);
  const chosen = launchable.find((q) => q.mint === mint) ?? null;
  const searching = query.trim() !== "";
  // The matches while searching, else the recommended three; the chosen asset stays in view either way.
  const shown = useMemo(() => {
    const base = searching ? searchQuotes(launchable, query).slice(0, MATCHES) : picks;
    return chosen && !base.some((q) => q.mint === chosen.mint) ? [chosen, ...base].slice(0, searching ? MATCHES + 1 : 4) : base;
  }, [searching, query, launchable, picks, chosen]);

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const params = new URLSearchParams();
    if (name.trim()) params.set("name", name.trim());
    if (symbol) params.set("symbol", symbol);
    if (chosen) params.set("quote", chosen.mint);
    router.push(`/launch?${params}`);
  }

  return (
    <form className={`card card-raised ${styles.card}`} action="/launch" method="get" onSubmit={onSubmit} aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`} className="visually-hidden">Pick your pair</h2>
      {/* The pair as it stands: the mark the coin page and the board will show. */}
      <div className={styles.preview} aria-live="polite">
        <span className={styles.pairBox}><PairMark base={symbol || "TICKER"} quote={chosen ? quoteTicker(chosen) : "SOL"} size="lg" /></span>
      </div>
      <div className={styles.fields}>
        <label className={styles.field}>
          <span className={`t-label ${styles.label}`}>Name</span>
          <span className="input">
            <input name="name" value={name} onChange={(e) => setName(e.target.value)} maxLength={NAME_MAX} placeholder="Tracer Bullet" autoComplete="off" />
          </span>
        </label>
        <label className={`${styles.field} ${styles.tickerField}`}>
          <span className={`t-label ${styles.label}`}>Ticker</span>
          <span className="input">
            <input
              name="symbol"
              className={styles.ticker}
              value={symbol}
              onChange={(e) => setSymbol(e.target.value.toUpperCase().replace(/[^A-Z0-9$]/g, ""))}
              maxLength={SYMBOL_MAX}
              placeholder="TRCR"
              autoComplete="off"
              spellCheck={false}
            />
          </span>
        </label>
      </div>
      <fieldset className={styles.pairs}>
        <legend className={`t-label ${styles.label}`}>Paired with</legend>
        <div className={styles.choices} role="radiogroup" aria-label="Paired with">
          {shown.map((q) => (
            <label key={q.mint} className={`${styles.choice} ${q.mint === mint ? styles.chosen : ""}`}>
              <input type="radio" name="quote" value={q.mint} checked={q.mint === mint} onChange={() => setMint(q.mint)} />
              <QuoteLogo quote={q} size={22} />
              <span className={styles.choiceTicker}>{quoteTicker(q)}</span>
              <span className={styles.choiceKind}>{quoteKind(q)}</span>
            </label>
          ))}
          {searching && shown.length === 0 && <p className={styles.none}>No Quote Asset matches &ldquo;{query.trim()}&rdquo;.</p>}
        </div>
        <label className={`input ${styles.search}`}>
          <svg viewBox="0 0 20 20" width="15" height="15" aria-hidden="true">
            <circle cx="8.5" cy="8.5" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
            <path d="m13 13 4.5 4.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
          <input
            type="search"
            aria-label="Search Quote Assets"
            placeholder={`Any of the ${launchable.length.toLocaleString("en-US")} assets Raydium quotes`}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoComplete="off"
            spellCheck={false}
          />
        </label>
      </fieldset>
      <div className={styles.actions}>
        <button type="submit" className="button button-primary button-lg" disabled={!chosen}>Stoke it</button>
        <span className={styles.hint}>The image, the options and your wallet come next.</span>
      </div>
    </form>
  );
}
