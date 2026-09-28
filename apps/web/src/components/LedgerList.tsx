"use client";

import Link from "next/link";
import { useState } from "react";
import type { LedgerEntry, LedgerKind, LedgerPage, PlatformInfo } from "@launchpad/contract";
import { listLedger } from "@/lib/api";
import { explorerUrl, formatUnits, formatUtc, quoteTicker } from "@/lib/format";
import styles from "./LedgerList.module.css";

const KIND: Record<LedgerKind, string> = {
  platform_fee: "Platform Fee from curves",
  pool_fee: "Platform Fee from a pool",
  fee_key: "Fee Key LP fees",
  sweep: "Swept to treasury",
  burn: "Platform Token burn",
  flywheel: "Flywheel burn",
};

/** Where an entry's money came from, in words: every curve pools its Platform Fee in one vault per Quote Asset. */
function origin(e: LedgerEntry) {
  if (e.kind === "sweep") return "From the operations wallet";
  if (e.kind === "burn" || e.kind === "flywheel")
    return e.launch ? <>Bought and burned <Link href={`/coin/${e.launch.mint}`}>{e.launch.symbol}</Link></> : "Bought and burned";
  if (e.launch) return <>From <Link href={`/coin/${e.launch.mint}`}>{e.launch.symbol}</Link></>;
  return "From every curve";
}

const WSOL_MINT = "So11111111111111111111111111111111111111112";

/**
 * Newest transaction first, as the Ledger lists them; within one transaction, SOL first and then by ticker. A pool pays
 * out its two tokens in the order of their mint addresses, which says nothing to a reader.
 */
function inReadingOrder(entries: LedgerEntry[]) {
  const position = new Map<string, number>();
  entries.forEach((e) => position.set(e.signature, position.get(e.signature) ?? position.size));
  const rank = (e: LedgerEntry) => (e.asset.mint === WSOL_MINT ? "" : quoteTicker(e.asset));
  return [...entries].sort((a, b) => position.get(a.signature)! - position.get(b.signature)! || rank(a).localeCompare(rank(b), "en"));
}

/** The Ledger, newest first, a page at a time: every movement of platform revenue with its transaction. */
export function LedgerList({ initial, platform }: { initial: LedgerPage; platform: PlatformInfo }) {
  const [entries, setEntries] = useState(initial.entries);
  const [next, setNext] = useState(initial.next);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function older() {
    setLoading(true);
    setError(null);
    try {
      const page = await listLedger(next);
      setEntries((shown) => [...shown, ...page.entries]);
      setNext(page.next);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className={styles.card} aria-labelledby="ledger-title">
      <h2 id="ledger-title" className={styles.title}>Ledger</h2>
      <ol className={styles.entries}>
        {inReadingOrder(entries).map((e) => (
          <li key={`${e.signature}.${e.index}`} className={e.kind === "sweep" ? styles.out : undefined}>
            <span className={styles.kind}>{KIND[e.kind]}</span>
            <span className={styles.amount}>
              {e.kind === "sweep" ? "−" : "+"}
              <span className="mono">{formatUnits(e.amount, e.asset.decimals, e.asset.decimals)}</span> {quoteTicker(e.asset)}
            </span>
            <span className={styles.origin}>{origin(e)}</span>
            <a className={styles.tx} href={explorerUrl("tx", e.signature, platform)} target="_blank" rel="noreferrer" title="View transaction">
              <time dateTime={e.time}>{formatUtc(e.time)}</time>
            </a>
          </li>
        ))}
      </ol>
      {error && <p className={styles.error} role="alert">{error}</p>}
      {next && (
        <button type="button" className={styles.more} onClick={() => void older()} disabled={loading}>
          {loading ? "Loading…" : "Show older entries"}
        </button>
      )}
    </section>
  );
}
