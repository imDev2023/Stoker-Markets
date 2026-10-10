"use client";

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import type { QuoteAsset } from "@launchpad/contract";
import { searchQuotes } from "@/lib/assets";
import { formatAmount, quoteTicker } from "@/lib/format";
import { quoteKind } from "@/lib/landing";
import { QuoteLogo } from "./QuoteLogo";
import styles from "./QuotePicker.module.css";

/** Enough rows to scan; with hundreds of Quote Assets, searching is the way to the rest. */
const RESULT_LIMIT = 50;

/** The name, unless it only repeats the ticker (common for memecoins). */
const distinctName = (q: QuoteAsset) => (q.name && q.name.toLowerCase() !== q.symbol?.toLowerCase() ? q.name : null);

const graduationAmount = (q: QuoteAsset) =>
  q.graduationTarget ? `${formatAmount(q.graduationTarget.raw, q.decimals)} ${quoteTicker(q)}` : null;

/**
 * The Quote Asset picker: a button showing the choice, opening a searchable list. Assets that can't be launched against
 * stay in the list with their reason, but can't be chosen. Each option says what kind of asset it is; what its issuer
 * can do and what the token list says of it is further information on the form and the asset's page, never a chip
 * under its name (owner, 2026-10-10).
 */
export function QuotePicker({ quotes, value, onChange }: { quotes: QuoteAsset[]; value: string | null; onChange: (mint: string) => void }) {
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const selected = quotes.find((q) => q.mint === value) ?? null;
  const matches = useMemo(() => searchQuotes(quotes, query), [quotes, query]);
  const shown = matches.slice(0, RESULT_LIMIT);
  const optionId = (mint: string) => `${id}-option-${mint}`;

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const activeId = shown[active] ? optionId(shown[active].mint) : undefined;
  useEffect(() => {
    if (activeId) document.getElementById(activeId)?.scrollIntoView({ block: "nearest" });
  }, [activeId]);

  function openList() {
    setQuery("");
    setActive(Math.max(0, quotes.findIndex((q) => q.mint === value)));
    setOpen(true);
  }

  function close() {
    setOpen(false);
    trigger.current?.focus();
  }

  function choose(q: QuoteAsset | undefined) {
    if (!q?.launchable) return;
    onChange(q.mint);
    close();
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    const last = shown.length - 1;
    if (e.key === "ArrowDown") setActive((i) => Math.min(last, i + 1));
    else if (e.key === "ArrowUp") setActive((i) => Math.max(0, i - 1));
    else if (e.key === "Home") setActive(0);
    else if (e.key === "End") setActive(last);
    else if (e.key === "Enter") choose(shown[active]);
    else if (e.key === "Escape") close();
    else if (e.key === "Tab") setOpen(false);
    else return;
    if (e.key !== "Tab") e.preventDefault();
  }

  return (
    <div className={styles.picker} ref={root}>
      <span className={styles.label} id={`${id}-label`}>Pair with</span>
      <button
        ref={trigger}
        type="button"
        className={styles.trigger}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-labelledby={`${id}-label ${id}-value`}
        onClick={() => (open ? setOpen(false) : openList())}
      >
        {selected ? (
          <>
            <QuoteLogo quote={selected} size={30} />
            <span className={styles.value} id={`${id}-value`}>
              <span className={styles.ticker}>{quoteTicker(selected)}</span>
              {distinctName(selected) && <span className={styles.name}>{distinctName(selected)}</span>}
            </span>
          </>
        ) : (
          <span className={styles.placeholder} id={`${id}-value`}>Choose a Quote Asset</span>
        )}
        <span className={styles.chevron} aria-hidden />
      </button>

      {open && (
        <div className={styles.popover}>
          <input
            className={styles.search}
            role="combobox"
            aria-expanded
            aria-controls={`${id}-list`}
            aria-autocomplete="list"
            aria-activedescendant={activeId}
            aria-label="Search Quote Assets"
            placeholder="Search by name, ticker or mint"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={onKeyDown}
            autoFocus
            spellCheck={false}
            autoComplete="off"
          />
          <ul className={styles.list} id={`${id}-list`} role="listbox" aria-label="Quote Assets">
            {shown.map((q, i) => (
              <li
                key={q.mint}
                id={optionId(q.mint)}
                role="option"
                aria-selected={q.mint === value}
                aria-disabled={!q.launchable}
                className={`${styles.option} ${i === active ? styles.active : ""}`}
                onMouseEnter={() => setActive(i)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(q)}
              >
                <QuoteLogo quote={q} size={30} />
                <span className={styles.optionText}>
                  <span className={styles.optionTitle}>
                    <span className={styles.ticker}>{quoteTicker(q)}</span>
                    {distinctName(q) && <span className={styles.name}>{distinctName(q)}</span>}
                    <span className={styles.kind}>{quoteKind(q)}</span>
                  </span>
                  {q.launchable ? null : <span className={styles.reason}>{q.reason}</span>}
                </span>
                {q.launchable && <span className={`mono ${styles.target}`}>{graduationAmount(q)}</span>}
              </li>
            ))}
          </ul>
          {shown.length === 0 && <p className={styles.note}>No Quote Asset matches &ldquo;{query.trim()}&rdquo;.</p>}
          {matches.length > shown.length && (
            <p className={styles.note}>
              Showing {shown.length} of {matches.length}. Keep typing to narrow it down.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
