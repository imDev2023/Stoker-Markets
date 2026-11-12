"use client";

import Link from "next/link";
import { useState } from "react";
import type { LedgerEntry, LedgerKind, LedgerPage, PlatformInfo } from "@launchpad/contract";
import { listLedger } from "@/lib/api";
import { explorerUrl, formatUnits, formatUtc, quoteTicker } from "@/lib/format";
import styles from "./LedgerList.module.css";
import { Address } from "./Address";

const KIND: Record<LedgerKind, string> = {
  platform_fee: "Platform Fee from curves",
  pool_fee: "Platform Fee from a pool",
  fee_key: "Fee Key LP fees",
  sweep: "Swept to treasury",
  creator_forward: "Forwarded to a Creator",
  burn: "Platform Token burn",
  flywheel: "Flywheel burn",
  arweave_top_up: "Arweave credits bought",
  metadata_upload: "Permanent metadata",
  reward_sale: "Reward Tax sold for holders",
  graduation_fee: "Graduation Fee, kept from a Creator's share",
  holder_dividend: "Creator Earnings paid to holders",
  creator_burn: "Creator Earnings bought back and burned",
  creator_liquidity: "Creator Earnings added as liquidity",
  rebate: "Volume Rebate paid to a trader",
};

/** Entries that move revenue out of the operations wallet rather than into it. */
const OUT = new Set<LedgerKind>(["sweep", "creator_forward", "holder_dividend", "arweave_top_up", "metadata_upload", "rebate"]);

/** A Creator's buyback (ADR 0011), which burns what it buys or adds it to the pool: two entries of one transaction. */
const BUYBACK = new Set<LedgerKind>(["creator_burn", "creator_liquidity"]);

/** An entry in the coin it names rather than in a Quote Asset: the coins a Reward Sale sold, or a buyback burned or added. */
const inItsCoin = (e: LedgerEntry) => e.launch?.mint === e.asset.mint;

/**
 * A buyback's second entry: the coins it burned or added to the pool. They were bought and gone in the one
 * transaction, so they are a count beside the money spent, neither revenue in nor revenue out.
 */
const isCoinCount = (e: LedgerEntry) => BUYBACK.has(e.kind) && inItsCoin(e);

/**
 * A Reward Sale is two entries: the coins that left the wallet, and the Quote Asset that came in (the holders' pot, not
 * revenue). A buyback is two as well: the Quote Asset that left the wallet, and the coins it burned or added.
 */
const isOut = (e: LedgerEntry) => OUT.has(e.kind) || (e.kind === "reward_sale" && inItsCoin(e)) || (BUYBACK.has(e.kind) && !inItsCoin(e));

/** Where an entry's money came from, in words: every curve pools its Platform Fee in one vault per Quote Asset. */
function origin(e: LedgerEntry, platform: PlatformInfo) {
  if (e.kind === "sweep") return "From the operations wallet";
  // A Creator's page is their own; the wallet a forward reached is public on the explorer. So is the trader's a Volume
  // Rebate was paid to (ADR 0021): one entry per wallet a payment paid.
  if (e.kind === "creator_forward" || e.kind === "rebate")
    return <>To <Address value={e.destination} platform={platform} /></>;
  if (e.kind === "arweave_top_up") return "SOL to ArDrive Turbo";
  if (e.kind === "metadata_upload")
    return e.launch ? <>Uploaded for <Link href={`/coin/${e.launch.mint}`}>{e.launch.symbol}</Link>, in credits</> : "Uploaded, in credits";
  if (e.kind === "reward_sale") return e.launch ? <>For the holders of <Link href={`/coin/${e.launch.mint}`}>{e.launch.symbol}</Link></> : "For holders";
  // Nothing moved: the Creator's share of what was already collected becomes the platform's, against the graduation.
  if (e.kind === "graduation_fee") return e.launch ? <>Out of the Creator&apos;s earnings on <Link href={`/coin/${e.launch.mint}`}>{e.launch.symbol}</Link></> : "Out of a Creator's earnings";
  // A Creator's share that went where they pointed it at launch instead of their wallet (ADR 0011).
  if (e.kind === "holder_dividend") return e.launch ? <>To the holders of <Link href={`/coin/${e.launch.mint}`}>{e.launch.symbol}</Link></> : "To a coin's holders";
  if (e.kind === "creator_burn") {
    if (!e.launch) return "Bought back and burned";
    return inItsCoin(e)
      ? <>Burned, every coin of <Link href={`/coin/${e.launch.mint}`}>{e.launch.symbol}</Link> it bought</>
      : <>Spent buying <Link href={`/coin/${e.launch.mint}`}>{e.launch.symbol}</Link> in its own market</>;
  }
  if (e.kind === "creator_liquidity") {
    if (!e.launch) return "Added to a pool, locked";
    return inItsCoin(e)
      ? <>Added to the pool of <Link href={`/coin/${e.launch.mint}`}>{e.launch.symbol}</Link>, locked for good</>
      : <>Spent buying <Link href={`/coin/${e.launch.mint}`}>{e.launch.symbol}</Link> and pairing it, into its pool</>;
  }
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
    <section className={`card ${styles.card}`} aria-labelledby="ledger-title">
      <h2 id="ledger-title" className={`t-h3 ${styles.title}`}>Ledger</h2>
      <ol className={styles.entries}>
        {inReadingOrder(entries).map((e) => (
          <li key={`${e.signature}.${e.index}`} className={isOut(e) || isCoinCount(e) ? styles.out : undefined}>
            <span className={styles.kind}>{KIND[e.kind]}</span>
            <span className={styles.amount}>
              {isCoinCount(e) ? "" : isOut(e) ? "−" : "+"}
              <span className="mono">{formatUnits(e.amount, e.asset.decimals, e.asset.decimals)}</span> {quoteTicker(e.asset)}
            </span>
            <span className={styles.origin}>{origin(e, platform)}</span>
            <a className={styles.tx} href={explorerUrl("tx", e.signature, platform)} target="_blank" rel="noreferrer" title="View transaction">
              <time dateTime={e.time}>{formatUtc(e.time)}</time>
            </a>
          </li>
        ))}
      </ol>
      {error && <p className={styles.error} role="alert">{error}</p>}
      {next && (
        <button type="button" className={`button button-ghost ${styles.more}`} onClick={() => void older()} disabled={loading} aria-busy={loading}>
          {loading ? "Loading…" : "Show older entries"}
        </button>
      )}
    </section>
  );
}
