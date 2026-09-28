import { Connection, Transaction, type Keypair, type PublicKey, type TransactionInstruction } from "@solana/web3.js";
import { getTableColumns, sql } from "drizzle-orm";
import {
  createCurveRuleIx, listGlobalConfigs, readCurveRules, readQuoteMints, updateCurveRuleIx, WSOL_MINT, type RuleConstraint,
} from "@launchpad/chain";
import { quoteAssets, type Db } from "@launchpad/db";
import type { Config } from "../env";
import { divide, formatDecimal, graduationTargetRaw, type Decimal, type QuoteMarket } from "./pricing";
import { bandOf, ruleUpdate } from "./rules";

export type RefreshDeps = { db: Db; cfg: Config; market: QuoteMarket; operations: Keypair };

/** Rule writes per run, most urgent first; a first run on mainnet (571 Quote Assets) completes over a few runs. */
const MAX_RULE_WRITES = 120;

/**
 * The Quote Registry refresh, run by the Cron Trigger: every LaunchLab GlobalConfig becomes a Quote Asset with its mint's
 * metadata, a price, and a Graduation Target at that price, and our curve rule for it is brought in line (ADR 0005).
 * Rule writes are signed by the operations wallet as the curve rule manager. Safe to run twice at once: both write the same rules.
 */
export async function refreshQuoteRegistry({ db, cfg, market, operations }: RefreshDeps) {
  const connection = new Connection(cfg.rpcUrl, "confirmed");
  const configs = await listGlobalConfigs(connection, cfg.launchlab);
  const mints = await readQuoteMints(connection, configs.map((c) => c.quoteMint));
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
  const before = await readCurveRules(connection, cfg.launchlab, cfg.platformConfig, globalConfigs);
  const writes = priced.flatMap((q) => {
    const current = before.get(q.config.address.toBase58()) ?? null;
    const next = ruleUpdate(current, q.target, q.isSol);
    return next ? [{ missing: current === null, ixs: ruleIxs(cfg, operations, q.config.address, current === null, next) }] : [];
  });
  // A Quote Asset without a rule account is unrestricted, so closing those gaps goes first.
  writes.sort((a, b) => Number(b.missing) - Number(a.missing));
  await sendInstructionGroups(connection, operations, writes.slice(0, MAX_RULE_WRITES).map((w) => w.ixs));
  const after = writes.length ? await readCurveRules(connection, cfg.launchlab, cfg.platformConfig, globalConfigs) : before;

  const known = new Map((await db.select({ mint: quoteAssets.mint, logo: quoteAssets.logo }).from(quoteAssets)).map((r) => [r.mint, r.logo]));
  const logos = await market.logos(priced.map((q) => q.mint.mint.toBase58()).filter((m) => !known.get(m)));

  const rows = priced.map((q) => {
    const mint = q.mint.mint.toBase58();
    const band = bandOf(after.get(q.config.address.toBase58()) ?? null);
    return {
      mint,
      globalConfig: q.config.address.toBase58(),
      tokenProgram: q.mint.tokenProgram.toBase58(),
      decimals: q.mint.decimals,
      symbol: q.mint.symbol,
      name: q.mint.name,
      logo: logos.get(mint) ?? known.get(mint) ?? null,
      priceUsd: q.quoteUsd ? formatDecimal(q.quoteUsd) : null,
      priceSol: q.priceSol ? formatDecimal(q.priceSol) : null,
      pricedAt: q.priceSol ? pricedAt : null,
      graduationTarget: q.target?.toString() ?? null,
      ruleMin: band?.min.toString() ?? null,
      ruleMax: band?.max.toString() ?? null,
      refreshedAt: pricedAt,
    };
  });
  if (rows.length) {
    const columns = Object.entries(getTableColumns(quoteAssets)).filter(([key]) => key !== "mint");
    await db.insert(quoteAssets).values(rows).onConflictDoUpdate({
      target: quoteAssets.mint,
      set: Object.fromEntries(columns.map(([key, column]) => [key, sql.raw(`excluded.${column.name}`)])),
    });
  }
  return { quoteAssets: rows.length, priced: rows.filter((r) => r.priceSol).length, ruleWrites: Math.min(writes.length, MAX_RULE_WRITES) };
}

function ruleIxs(cfg: Config, operations: Keypair, globalConfig: PublicKey, create: boolean, constraints: RuleConstraint[]) {
  const args = [cfg.launchlab, operations.publicKey, cfg.platformConfig, globalConfig] as const;
  return [...(create ? [createCurveRuleIx(...args)] : []), updateCurveRuleIx(...args, 0, constraints)];
}

const TX_MAX_BYTES = 1232;
const PARALLEL_SENDS = 10;

/**
 * Packs instruction groups into as few transactions as fit, sends them and waits for each to confirm or expire.
 * Failures are logged, not thrown: the caller re-reads the chain, so a failed write shows up as a rule left as it was.
 * Polls signature statuses because Workers can't hold the websocket `confirmTransaction` uses.
 */
async function sendInstructionGroups(connection: Connection, payer: Keypair, groups: TransactionInstruction[][]) {
  if (!groups.length) return;
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
  const make = (ixs: TransactionInstruction[]) => new Transaction({ feePayer: payer.publicKey, blockhash, lastValidBlockHeight }).add(...ixs);
  const fits = (tx: Transaction) => tx.serializeMessage().length + 1 + 64 <= TX_MAX_BYTES;
  const txs: Transaction[] = [];
  for (const group of groups) {
    const last = txs.at(-1);
    const merged = last && make([...last.instructions, ...group]);
    if (merged && fits(merged)) txs[txs.length - 1] = merged;
    else txs.push(make(group));
  }
  const signatures: string[] = [];
  for (let i = 0; i < txs.length; i += PARALLEL_SENDS) {
    const sent = await Promise.allSettled(
      txs.slice(i, i + PARALLEL_SENDS).map((tx) => {
        tx.sign(payer);
        return connection.sendRawTransaction(tx.serialize());
      }),
    );
    for (const s of sent) {
      if (s.status === "fulfilled") signatures.push(s.value);
      else console.error("curve rule write rejected", s.reason);
    }
  }
  while (signatures.length) {
    const { value } = await connection.getSignatureStatuses(signatures);
    for (let i = value.length - 1; i >= 0; i--) {
      const status = value[i];
      if (status?.err) console.error("curve rule write failed", signatures[i], status.err);
      if (status?.err || status?.confirmationStatus === "confirmed" || status?.confirmationStatus === "finalized") signatures.splice(i, 1);
    }
    if (!signatures.length || (await connection.getBlockHeight("confirmed")) > lastValidBlockHeight) break;
    await new Promise((r) => setTimeout(r, 500));
  }
}
