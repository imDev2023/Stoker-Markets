/**
 * Quote Risk Labels (#11): facts about a Quote Asset a Creator or trader should know before using it, each read from
 * its mint on-chain (authorities and Token-2022 extensions) or from a token list, and each written for people. Labels
 * inform and never block: nothing here decides whether an asset can be launched against or traded.
 */
import { PublicKey, type Connection } from "@solana/web3.js";
import { inArray, sql } from "drizzle-orm";
import { readQuoteMints, type QuoteMintInfo } from "@launchpad/chain";
import { QUOTE_LABEL_KINDS, type QuoteLabel, type QuoteLabelKind } from "@launchpad/contract";
import { quoteAssets, type Db } from "@launchpad/db";
import type { TokenListing } from "./pricing";

export const MINT_SOURCE = "Read from the mint on-chain";

/** Under this much market liquidity (USD) a Quote Asset's price can move a lot on one trade. */
export const LOW_LIQUIDITY_USD = 100_000;

/** The kinds read from the mint itself; the rest come from the token list. */
const MINT_LABEL_KINDS = new Set<QuoteLabelKind>(["freeze", "permanent_delegate", "pausable", "transfer_hook", "default_frozen", "transfer_fee", "scaled_balance", "interest_bearing"]);

const short = (k: PublicKey) => `${k.toBase58().slice(0, 4)}…${k.toBase58().slice(-4)}`;
const percent = (bps: number) => `${(bps / 100).toLocaleString("en-US", { maximumFractionDigits: 2 })}%`;

const label = (kind: QuoteLabelKind, severity: QuoteLabel["severity"], title: string, detail: string, source: string): QuoteLabel => ({ kind, severity, title, detail, source });

/** What a mint's authorities and extensions say about it, in the words the site shows. `ticker` is how the asset is named. */
export function mintLabels(m: QuoteMintInfo, ticker: string): QuoteLabel[] {
  const out: (QuoteLabel | null)[] = [];
  const c = m.controls;
  if (m.freezeAuthority)
    out.push(label("freeze", "caution", "Can freeze wallets",
      `The issuer (${short(m.freezeAuthority)}) can freeze any wallet's ${ticker}, which would stop that wallet buying, selling or claiming.`, MINT_SOURCE));
  if (m.permanentDelegate)
    out.push(label("permanent_delegate", "caution", "Issuer can move tokens",
      `The issuer (${short(m.permanentDelegate)}) can move or burn ${ticker} from any wallet without its owner's signature.`, MINT_SOURCE));
  if (c.pausable)
    out.push(c.pausable.paused
      ? label("pausable", "caution", "Transfers paused",
        `The issuer has paused every transfer of ${ticker}: nothing can be bought, sold or claimed until it resumes them.`, MINT_SOURCE)
      : label("pausable", "caution", "Can pause transfers",
        `The issuer (${short(c.pausable.authority)}) can stop every transfer of ${ticker} at any time; buys, sells and claims fail while it is paused.`, MINT_SOURCE));
  if (c.transferHook)
    out.push(c.transferHook.programId
      ? label("transfer_hook", "caution", "Transfer hook",
        `A program (${short(c.transferHook.programId)}) runs on every transfer of ${ticker}${c.transferHook.authority ? `, set by the issuer (${short(c.transferHook.authority)})` : ""}; it can refuse or change any transfer.`, MINT_SOURCE)
      : c.transferHook.authority
        ? label("transfer_hook", "caution", "Can add a transfer hook",
          `The issuer (${short(c.transferHook.authority)}) can attach a program that runs on every transfer of ${ticker}; trades and claims could then need extra accounts or fail.`, MINT_SOURCE)
        : null);
  if (c.defaultAccountState)
    out.push(c.defaultAccountState === "frozen"
      ? label("default_frozen", "caution", "New wallets start frozen",
        `Every new ${ticker} account starts frozen until the issuer thaws it, so a first buy into a new wallet can be stuck.`, MINT_SOURCE)
      : m.freezeAuthority
        ? label("default_frozen", "caution", "Can freeze new wallets by default",
          `New ${ticker} accounts open unfrozen today, but the issuer can make every new one start frozen until it approves it.`, MINT_SOURCE)
        : null);
  if (c.transferFee) {
    const { currentBps, scheduled, authority } = c.transferFee;
    const canChange = authority ? ` The issuer (${short(authority)}) can change the fee.` : "";
    if (currentBps > 0 || scheduled) {
      const changing = scheduled ? `, changing to ${percent(scheduled.bps)}` : "";
      const when = scheduled ? ` It changes to ${percent(scheduled.bps)} from epoch ${scheduled.epoch}.` : "";
      out.push(label("transfer_fee", "info", `${percent(currentBps)} transfer fee${changing}`,
        `The issuer withholds ${percent(currentBps)} of every transfer of ${ticker}, on the way into a curve or pool and out of it.${when}${canChange}`, MINT_SOURCE));
    } else if (authority) {
      out.push(label("transfer_fee", "info", "Can add a transfer fee",
        `${ticker} charges no transfer fee today, but its issuer (${short(authority)}) can add one at any time.`, MINT_SOURCE));
    }
  }
  if (c.scaledUiAmount)
    out.push(label("scaled_balance", "info", "Scaled balances",
      `${ticker} balances are shown through a multiplier (${c.scaledUiAmount.multiplier.toLocaleString("en-US", { maximumFractionDigits: 4 })} today) its issuer changes on dividends and splits; curves and prices here work in raw units.`, MINT_SOURCE));
  if (c.interestBearing)
    out.push(label("interest_bearing", "info", "Interest-bearing balances",
      `${ticker} shows balances with interest accrued at ${percent(c.interestBearing.rateBps)} a year; curves and prices here work in raw units.`, MINT_SOURCE));
  return out.filter((l): l is QuoteLabel => l !== null);
}

/** What the token list says: whether the asset is on its verified list, and how much market liquidity it tracks. */
export function listLabels(listing: TokenListing | undefined, ticker: string, listName: string): QuoteLabel[] {
  const source = `From ${listName}`;
  const out: QuoteLabel[] = [];
  if (!listing?.verified)
    out.push(label("unverified", "caution", "Not on the verified list",
      `${ticker} is not on ${listName}'s verified list; check its mint address before trusting the name.`, source));
  const liquidity = listing?.liquidityUsd ?? null;
  if (liquidity === null)
    out.push(label("low_liquidity", "caution", "Unknown liquidity",
      `${listName} knows no market liquidity for ${ticker}, so it may be hard to sell and its price can move a lot.`, source));
  else if (liquidity < LOW_LIQUIDITY_USD)
    out.push(label("low_liquidity", "caution", "Low liquidity",
      `About $${Math.round(liquidity).toLocaleString("en-US")} of ${ticker} is in the markets ${listName} tracks, so its price can move a lot on one trade.`, source));
  return out;
}

/** Cautions before facts, and a fixed order within each, so the same asset always reads the same. */
export function sortLabels(labels: QuoteLabel[]): QuoteLabel[] {
  const rank = (l: QuoteLabel) => (l.severity === "caution" ? 0 : 1) * QUOTE_LABEL_KINDS.length + QUOTE_LABEL_KINDS.indexOf(l.kind);
  return [...labels].sort((a, b) => rank(a) - rank(b));
}

export const tickerOf = (m: { symbol: string | null; mint: PublicKey }) => m.symbol ?? short(m.mint);

/**
 * Re-reads Quote Assets whose mints a delivered transaction could have changed (the Indexer's side of #11): the mint
 * labels are computed again from the chain and joined to the token-list labels on record. A read from an older slot
 * never overwrites a newer one, so a refresh and a webhook delivery racing each other end with the latest state.
 */
export async function relabelQuoteMints(db: Db, connection: Connection, mints: string[]) {
  if (!mints.length) return 0;
  const rows = await db
    .select({ mint: quoteAssets.mint, symbol: quoteAssets.symbol, labels: quoteAssets.labels })
    .from(quoteAssets)
    .where(inArray(quoteAssets.mint, mints));
  if (!rows.length) return 0;
  const read = await readQuoteMints(connection, rows.map((r) => new PublicKey(r.mint)));
  let updated = 0;
  for (const row of rows) {
    const info = read.mints.get(row.mint);
    if (!info) continue;
    const kept = (row.labels ?? []).filter((l) => !MINT_LABEL_KINDS.has(l.kind));
    const labels = sortLabels([...mintLabels(info, tickerOf({ symbol: row.symbol, mint: info.mint })), ...kept]);
    const written = await db
      .update(quoteAssets)
      .set({ labels, labelsSlot: read.slot, labelsCheckedAt: new Date() })
      .where(sql`${quoteAssets.mint} = ${row.mint} and coalesce(${quoteAssets.labelsSlot}, 0) <= ${read.slot}`)
      .returning({ mint: quoteAssets.mint });
    updated += written.length;
  }
  return updated;
}
