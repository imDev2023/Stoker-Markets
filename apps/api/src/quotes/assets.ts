import { Connection, PublicKey } from "@solana/web3.js";
import { eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { readCurveRules, WSOL_MINT } from "@launchpad/chain";
import type { GraduationTarget, QuoteAsset, QuoteRef } from "@launchpad/contract";
import { quoteAssets, type Db } from "@launchpad/db";
import type { Config } from "../env";
import { graduationTargetRaw, type QuoteMarket } from "./pricing";
import { bandOf, launchBlocker } from "./rules";

type Row = typeof quoteAssets.$inferSelect;

const WSOL = WSOL_MINT.toBase58();
const ticker = (r: { symbol: string | null; mint: string }) => r.symbol ?? `${r.mint.slice(0, 4)}...${r.mint.slice(-4)}`;
const band = (r: Row) => (r.ruleMin && r.ruleMax ? { min: BigInt(r.ruleMin), max: BigInt(r.ruleMax) } : null);

export function toQuoteRef(r: Pick<Row, "mint" | "symbol" | "name" | "decimals" | "logo" | "category">): QuoteRef {
  return { mint: r.mint, symbol: r.symbol, name: r.name, decimals: r.decimals, logo: r.logo, category: r.category };
}

/** A registry row as the API shows it: launchable only if the latest price and our on-chain rule agree. */
export function toQuoteAsset(cfg: Config, r: Row): QuoteAsset {
  const target = r.graduationTarget ? BigInt(r.graduationTarget) : null;
  const reason = launchBlocker(ticker(r), target, band(r));
  return {
    ...toQuoteRef(r),
    globalConfig: r.globalConfig,
    tokenProgram: r.tokenProgram,
    price: r.priceSol && r.pricedAt ? { sol: r.priceSol, usd: r.priceUsd, at: r.pricedAt.toISOString() } : null,
    graduationTarget: target === null ? null : { raw: target.toString(), lamports: cfg.graduationTargetLamports.toString() },
    launchable: reason === null,
    reason,
  };
}

/** SOL first, then what can be launched against, each alphabetically by ticker. */
export function byPickerOrder(a: QuoteAsset, b: QuoteAsset) {
  const rank = (q: QuoteAsset) => (q.mint === WSOL ? 0 : q.launchable ? 1 : 2);
  return rank(a) - rank(b) || ticker(a).localeCompare(ticker(b), "en", { sensitivity: "base" });
}

export type LaunchQuote = {
  mint: PublicKey; globalConfig: PublicKey; tokenProgram: PublicKey; decimals: number; ticker: string; graduationTarget: GraduationTarget;
};

/**
 * Fixes a Launch's Graduation Target from the Quote Asset's live price, and checks that our curve rule on-chain accepts it,
 * so the Creator is never handed a transaction the chain will refuse.
 */
export async function priceLaunch(db: Db, cfg: Config, market: QuoteMarket, quoteMint: string): Promise<LaunchQuote> {
  const [row] = await db.select().from(quoteAssets).where(eq(quoteAssets.mint, quoteMint)).limit(1);
  if (!row) throw new HTTPException(400, { message: "That mint isn't a Quote Asset. Choose one from the Quote Asset list." });
  const lamports = BigInt(cfg.graduationTargetLamports.toString());
  let target: bigint | null = lamports;
  if (row.mint !== WSOL) {
    const usd = await market.usdPrices([row.mint, WSOL]).catch((e: unknown) => {
      console.error("price source failed", e);
      throw new HTTPException(503, { message: "Prices are unavailable right now, so no Graduation Target can be set. Try again in a minute." });
    });
    const quoteUsd = usd.get(row.mint);
    const solUsd = usd.get(WSOL);
    target = quoteUsd && solUsd ? graduationTargetRaw(lamports, row.decimals, quoteUsd, solUsd) : null;
  }
  const connection = new Connection(cfg.rpcUrl, "confirmed");
  const rule = (await readCurveRules(connection, cfg.launchlab, cfg.platformConfig, [new PublicKey(row.globalConfig)])).get(row.globalConfig);
  const blocker = launchBlocker(ticker(row), target, bandOf(rule ?? null));
  if (blocker) throw new HTTPException(422, { message: blocker });
  return {
    mint: new PublicKey(row.mint),
    globalConfig: new PublicKey(row.globalConfig),
    tokenProgram: new PublicKey(row.tokenProgram),
    decimals: row.decimals,
    ticker: ticker(row),
    // launchBlocker refuses a missing target, so there is one here.
    graduationTarget: { raw: target!.toString(), lamports: lamports.toString() },
  };
}

/**
 * The Quote Asset of a launch prepared earlier, with the Graduation Target it was prepared with, if our curve rule still
 * accepts that target. Null when the rule has moved on since (the price drifted): the launch can't land as it was built.
 */
export async function launchQuoteAsBuilt(db: Db, cfg: Config, quoteMint: string, target: GraduationTarget): Promise<LaunchQuote | { blocked: string }> {
  const [row] = await db.select().from(quoteAssets).where(eq(quoteAssets.mint, quoteMint)).limit(1);
  if (!row) throw new Error(`launch pairs with ${quoteMint}, which is no longer in the Quote Registry`);
  const connection = new Connection(cfg.rpcUrl, "confirmed");
  const rule = (await readCurveRules(connection, cfg.launchlab, cfg.platformConfig, [new PublicKey(row.globalConfig)])).get(row.globalConfig);
  const blocker = launchBlocker(ticker(row), BigInt(target.raw), bandOf(rule ?? null));
  if (blocker) return { blocked: blocker };
  return {
    mint: new PublicKey(row.mint),
    globalConfig: new PublicKey(row.globalConfig),
    tokenProgram: new PublicKey(row.tokenProgram),
    decimals: row.decimals,
    ticker: ticker(row),
    graduationTarget: target,
  };
}
