import { Connection, PublicKey, Transaction, type Keypair, type TransactionInstruction } from "@solana/web3.js";
import { getTableColumns, sql } from "drizzle-orm";
import {
  createCurveRuleIx, listGlobalConfigs, readCurveRuleGroups, readQuoteMints, RULE_GROUP, updateCurveRuleIx, WSOL_MINT, type RuleConstraint,
} from "@launchpad/chain";
import { quoteAssets, type Db } from "@launchpad/db";
import type { Config } from "../env";
import { divide, formatDecimal, graduationTargetRaw, type Decimal, type QuoteMarket } from "./pricing";
import { quoteCategory, quoteIssuer } from "./categories";
import { listLabels, mintLabels, sortLabels, tickerOf } from "./labels";
import { bandOf, ruleUpdate } from "./rules";
import { refreshPlatformFees } from "../routes/operator";

export type RefreshDeps = { db: Db; cfg: Config; market: QuoteMarket; operations: Keypair };

/**
 * The Quote Registry refresh, run by the Cron Trigger: every LaunchLab GlobalConfig becomes a Quote Asset with its mint's
 * metadata, a price, and a Graduation Target at that price, and our curve rule for it is brought in line (ADR 0005).
 * Rule writes are signed by the operations wallet as the curve rule manager. Safe to run twice at once: both write the same rules.
 */
export async function refreshQuoteRegistry({ db, cfg, market, operations }: RefreshDeps) {
  const connection = new Connection(cfg.rpcUrl, "confirmed");
  // The Platform Fee and Creator Fee as the chain has them, for every page that shows them.
  await refreshPlatformFees(db, cfg, connection);
  const configs = await listGlobalConfigs(connection, cfg.launchlab);
  const { slot: mintsSlot, mints } = await readQuoteMints(connection, configs.map((c) => c.quoteMint));
  const quotes = configs.flatMap((config) => {
    const mint = mints.get(config.quoteMint.toBase58());
    return mint ? [{ config, mint, isSol: config.quoteMint.equals(WSOL_MINT) }] : [];
  });

  const usd = await market.usdPrices(quotes.map((q) => q.mint.mint.toBase58()));
  const solUsd = usd.get(WSOL_MINT.toBase58()) ?? null;
  const lamports = BigInt(cfg.graduationTargetLamports.toString());
  const pricedAt = new Date();
  const priced = quotes.map((q) => {
    const quoteUsd = q.isSol ? solUsd : usd.get(q.mint.mint.toBase58()) ?? null;
    // SOL is worth exactly one SOL whatever the market says; everything else is priced through USD.
    const priceSol: Decimal | null = q.isSol ? { digits: 1n, scale: 0 } : quoteUsd && solUsd ? divide(quoteUsd, solUsd) : null;
    const target = q.isSol ? lamports : quoteUsd && solUsd ? graduationTargetRaw(lamports, q.mint.decimals, quoteUsd, solUsd) : null;
    return { ...q, quoteUsd, priceSol, target };
  });

  const globalConfigs = priced.map((q) => q.config.address);
  const before = await readCurveRuleGroups(connection, cfg.launchlab, cfg.platformConfig, globalConfigs);
  // Each rule has two groups, one per kind of Launch, kept in step: a standard coin's, and a Reward Launch's taxed coin's.
  const writes = priced.flatMap((q) => {
    const rule = before.get(q.config.address.toBase58()) ?? null;
    const groups: { id: number; next: RuleConstraint[] }[] = [];
    for (const [id, kind] of [[RULE_GROUP.standard, "standard"], [RULE_GROUP.reward, "reward"]] as const) {
      const next = ruleUpdate(rule ? (rule.get(id) ?? []) : null, q.target, q.isSol, kind);
      if (next) groups.push({ id, next });
    }
    if (!groups.length) return [];
    return [{
      missing: rule === null,
      ixs: [
        ...(rule === null ? [createCurveRuleIx(cfg.launchlab, operations.publicKey, cfg.platformConfig, q.config.address)] : []),
        ...groups.map((g) => updateCurveRuleIx(cfg.launchlab, operations.publicKey, cfg.platformConfig, q.config.address, g.id, g.next)),
      ],
    }];
  });
  // A Quote Asset without a rule account is unrestricted, so closing those gaps goes first; the rest wait for the next
  // run when there are more than one run writes (QUOTE_RULE_WRITES_MAX), as on a first run over mainnet's hundreds.
  writes.sort((a, b) => Number(b.missing) - Number(a.missing));
  const sent = await sendInstructionGroups(connection, operations, writes.slice(0, cfg.quoteRuleWritesMax).map((w) => w.ixs));
  const afterGroups = writes.length ? await readCurveRuleGroups(connection, cfg.launchlab, cfg.platformConfig, globalConfigs) : before;
  const after = new Map([...afterGroups].map(([g, rule]) => [g, rule ? (rule.get(RULE_GROUP.standard) ?? []) : null]));

  const known = new Map((await db.select({ mint: quoteAssets.mint, logo: quoteAssets.logo }).from(quoteAssets)).map((r) => [r.mint, r.logo]));
  const logos = await market.logos(priced.map((q) => q.mint.mint.toBase58()).filter((m) => !known.get(m)));
  // Quote Risk Labels (#11): what each mint's authorities and extensions say, and what the token list says.
  const listings = await market.listings(priced.map((q) => q.mint.mint.toBase58()));

  const rows = priced.map((q) => {
    const mint = q.mint.mint.toBase58();
    const band = bandOf(after.get(q.config.address.toBase58()) ?? null);
    const ticker = tickerOf(q.mint);
    return {
      mint,
      globalConfig: q.config.address.toBase58(),
      tokenProgram: q.mint.tokenProgram.toBase58(),
      decimals: q.mint.decimals,
      symbol: q.mint.symbol,
      name: q.mint.name,
      logo: logos.get(mint) ?? known.get(mint) ?? null,
      category: quoteCategory(q.mint, listings.get(mint)),
      issuer: quoteIssuer(q.mint),
      priceUsd: q.quoteUsd ? formatDecimal(q.quoteUsd) : null,
      priceSol: q.priceSol ? formatDecimal(q.priceSol) : null,
      pricedAt: q.priceSol ? pricedAt : null,
      graduationTarget: q.target?.toString() ?? null,
      ruleMin: band?.min.toString() ?? null,
      ruleMax: band?.max.toString() ?? null,
      maxShareFeeRate: q.config.maxShareFeeRate.toNumber(),
      liquidityUsd: listings.get(mint)?.liquidityUsd ?? null,
      labels: sortLabels([...mintLabels(q.mint, ticker), ...listLabels(listings.get(mint), ticker, market.listName)]),
      labelsSlot: mintsSlot,
      labelsCheckedAt: pricedAt,
      refreshedAt: pricedAt,
    };
  });
  if (rows.length) {
    const labelColumns = new Set(["labels", "labelsSlot", "labelsCheckedAt"]);
    const columns = Object.entries(getTableColumns(quoteAssets)).filter(([key]) => key !== "mint" && !labelColumns.has(key));
    // The Indexer may have re-read a mint at a later slot than this refresh did; the newer read wins.
    const newer = sql`coalesce(${quoteAssets.labelsSlot}, 0) <= excluded.labels_slot`;
    await db.insert(quoteAssets).values(rows).onConflictDoUpdate({
      target: quoteAssets.mint,
      set: {
        ...Object.fromEntries(columns.map(([key, column]) => [key, sql.raw(`excluded.${column.name}`)])),
        labels: sql`case when ${newer} then excluded.labels else ${quoteAssets.labels} end`,
        labelsSlot: sql`case when ${newer} then excluded.labels_slot else ${quoteAssets.labelsSlot} end`,
        labelsCheckedAt: sql`case when ${newer} then excluded.labels_checked_at else ${quoteAssets.labelsCheckedAt} end`,
      },
    });
  }
  // The quote mints are not added to the Helius webhook: watching a mint delivers every transaction that names it,
  // which for SOL or USDC is much of the chain. This refresh re-reads every mint's labels instead (runbook, section 7).
  // What landed and what didn't, so the summary says what the chain now has rather than what the run meant to write.
  return {
    quoteAssets: rows.length,
    priced: rows.filter((r) => r.priceSol).length,
    // GlobalConfigs that had no rule account when the run began (unrestricted until this run's write landed).
    rulesMissing: writes.filter((w) => w.missing).length,
    ruleWrites: sent.landed,
    ruleWriteFailures: sent.failed,
  };
}

const TX_MAX_BYTES = 1232;
/** Transactions in flight at once: under a Worker's six concurrent connections, and gentle on a rate-limited RPC. */
const PARALLEL_SENDS = 4;
/** Any well-formed hash does to measure a transaction: its size doesn't depend on the blockhash. */
const SIZING_BLOCKHASH = PublicKey.default.toBase58();

type SendOutcome = { landed: number; failed: number };

/**
 * Packs instruction groups into as few transactions as fit (one asset's two group updates are 772 bytes, so in practice
 * one asset a transaction and one base fee a band move) and sends them a few at a time, each batch with a fresh
 * blockhash and confirmed (or expired) before the next: on the first mainnet run, ten sends at once with one blockhash
 * for the whole run were stretched by the RPC's throttling past the blockhash's validity, so most were rejected
 * ("Blockhash not found") or cancelled by the Worker's connection cap, while the run reported every write as made.
 * Failures are logged and counted, not thrown: the caller re-reads the chain, so a failed write shows up as a rule left
 * as it was. Polls signature statuses because Workers can't hold the websocket `confirmTransaction` uses.
 */
async function sendInstructionGroups(connection: Connection, payer: Keypair, groups: TransactionInstruction[][]): Promise<SendOutcome> {
  const outcome: SendOutcome = { landed: 0, failed: 0 };
  if (!groups.length) return outcome;
  // web3.js serializes into a packet-sized buffer and throws past it, so a message too large to measure doesn't fit either.
  const sizeOf = (ixs: TransactionInstruction[]) => {
    try {
      return new Transaction({ feePayer: payer.publicKey, blockhash: SIZING_BLOCKHASH, lastValidBlockHeight: 0 }).add(...ixs).serializeMessage().length + 1 + 64;
    } catch {
      return Infinity;
    }
  };
  const packed: { ixs: TransactionInstruction[]; groups: number }[] = [];
  for (const group of groups) {
    const last = packed.at(-1);
    if (last && sizeOf([...last.ixs, ...group]) <= TX_MAX_BYTES) {
      last.ixs.push(...group);
      last.groups += 1;
    } else packed.push({ ixs: [...group], groups: 1 });
  }
  for (let i = 0; i < packed.length; i += PARALLEL_SENDS) {
    const batch = packed.slice(i, i + PARALLEL_SENDS);
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
    const sent = await Promise.allSettled(
      batch.map((p) => {
        const tx = new Transaction({ feePayer: payer.publicKey, blockhash, lastValidBlockHeight }).add(...p.ixs);
        tx.sign(payer);
        return connection.sendRawTransaction(tx.serialize());
      }),
    );
    const pending: { signature: string; groups: number }[] = [];
    sent.forEach((s, j) => {
      const groupsIn = batch[j]!.groups;
      if (s.status === "fulfilled") pending.push({ signature: s.value, groups: groupsIn });
      else {
        outcome.failed += groupsIn;
        console.error("curve rule write rejected", s.reason);
      }
    });
    while (pending.length) {
      const { value } = await connection.getSignatureStatuses(pending.map((p) => p.signature));
      for (let k = value.length - 1; k >= 0; k--) {
        const status = value[k];
        const p = pending[k]!;
        if (status?.err) {
          console.error("curve rule write failed", p.signature, status.err);
          outcome.failed += p.groups;
          pending.splice(k, 1);
        } else if (status?.confirmationStatus === "confirmed" || status?.confirmationStatus === "finalized") {
          outcome.landed += p.groups;
          pending.splice(k, 1);
        }
      }
      if (!pending.length) break;
      if ((await connection.getBlockHeight("confirmed")) > lastValidBlockHeight) {
        for (const p of pending) console.error("curve rule write expired", p.signature);
        outcome.failed += pending.reduce((n, p) => n + p.groups, 0);
        break;
      }
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  return outcome;
}
