import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { PublicKey } from "@solana/web3.js";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { WSOL_MINT } from "@launchpad/chain";
import type { CreatorEarnings, CreatorForwardList, GraduationFee, QuoteRef } from "@launchpad/contract";
import { creatorForwards, curves, graduations, launches, launchMetadata, quoteAssets, type Db } from "@launchpad/db";
import type { AppEnv } from "../env";
import { committedForwards, creatorShares, creatorSharesByLaunch, withheldGraduationFees } from "../fees/creatorShares";
import { toQuoteRef } from "../quotes/assets";

/**
 * Creator Earnings (ADR 0009): what a Creator has earned from the trades on their Launches, half of what the platform
 * collected on them, per Quote Asset and per Launch, with what has been forwarded to their wallet, what a Graduation
 * Fee kept (ADR 0015) and what is still to come; and the public history of those Creator Forwards. There is nothing to
 * claim: the platform pays it all.
 */
export const creatorEarningsRoutes = new Hono<AppEnv>();

function creatorParam(value: string) {
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value)) throw new HTTPException(400, { message: "invalid creator address" });
  try {
    return new PublicKey(value);
  } catch {
    throw new HTTPException(400, { message: "invalid creator address" });
  }
}

/**
 * How to show amounts in each Quote Asset: from the Quote Registry, which lists every GlobalConfig a Launch can be made
 * against, or, for a mint it no longer lists, just the mint and the decimals the row carries.
 */
async function quoteRefs(db: Db, decimals: Map<string, number>) {
  const mints = [...decimals.keys()];
  const rows = mints.length ? await db.select().from(quoteAssets).where(inArray(quoteAssets.mint, mints)) : [];
  const listed = new Map(rows.map((r) => [r.mint, toQuoteRef(r)]));
  return (mint: string): QuoteRef =>
    listed.get(mint) ?? { mint, symbol: null, name: null, decimals: decimals.get(mint)!, logo: null, category: "community", issuer: null };
}

/** A graduated coin's Graduation Fee as the API shows it (ADR 0015); null before Graduation and for a coin that was charged none. */
export function graduationFeeOf(g: typeof graduations.$inferSelect | null): GraduationFee | null {
  if (!g || g.feeLamports === "0") return null;
  return { lamports: g.feeLamports, withheld: g.feeWithheld, paidLamports: g.feePaidLamports, settledAt: g.feeSettledAt?.toISOString() ?? null };
}

creatorEarningsRoutes.get("/creators/:address/earnings", async (c) => {
  const address = creatorParam(c.req.param("address")).toBase58();
  const db = c.get("db");
  const cfg = c.get("cfg");
  const [ownLaunches, shares, committed, withheld, byLaunch] = await Promise.all([
    db
      .select({
        mint: launches.mint,
        name: launches.name,
        symbol: launches.symbol,
        quote: quoteAssets,
        hasMetadata: sql<boolean>`${launchMetadata.id} is not null`,
        status: curves.status,
        graduated: sql<boolean>`${graduations.mint} is not null`,
        graduation: graduations,
      })
      .from(launches)
      .innerJoin(quoteAssets, eq(quoteAssets.mint, launches.quoteMint))
      .leftJoin(launchMetadata, eq(launchMetadata.id, launches.mint))
      .leftJoin(curves, eq(curves.mint, launches.mint))
      .leftJoin(graduations, eq(graduations.mint, launches.mint))
      .where(eq(launches.creator, address))
      .orderBy(desc(launches.createdSlot)),
    creatorShares(db, { collectedOnly: false, creator: address }),
    committedForwards(db, address),
    withheldGraduationFees(db, address),
    creatorSharesByLaunch(db, address),
  ]);

  // SOL first, then the other Quote Assets in a stable order.
  const quotes = new Map(ownLaunches.map((l) => [l.quote.mint, toQuoteRef(l.quote)]));
  const mints = [...quotes.keys()].sort((a, b) => (a === WSOL_MINT.toBase58() ? -1 : b === WSOL_MINT.toBase58() ? 1 : a.localeCompare(b)));
  const res: CreatorEarnings = {
    creator: address,
    assets: mints.map((mint) => {
      const share = shares.find((s) => s.mint === mint);
      const earned = share ? share.curve + share.pool : 0n;
      const kept = withheld.get(`${address} ${mint}`) ?? 0n;
      const forwarded = committed.get(`${address} ${mint}`) ?? 0n;
      const pending = earned - kept - forwarded;
      return { quote: quotes.get(mint)!, earned: earned.toString(), withheld: kept.toString(), forwarded: forwarded.toString(), pending: (pending > 0n ? pending : 0n).toString() };
    }),
    launches: ownLaunches.map((l) => ({
      mint: l.mint,
      name: l.name,
      symbol: l.symbol,
      image: l.hasMetadata ? `${cfg.publicApiUrl}/metadata/${l.mint}/image` : null,
      quote: quotes.get(l.quote.mint)!,
      // A Launch nobody has traded yet is live; one Raydium has migrated is graduated whatever its last curve trade said.
      status: l.graduated ? "graduated" : (l.status ?? "live"),
      curve: byLaunch.curve.get(l.mint) ?? "0",
      pool: byLaunch.pool.get(l.mint) ?? "0",
      graduationFee: graduationFeeOf(l.graduation),
    })),
  };
  return c.json(res);
});

/** The Creator Forwards paid to a Creator, or on their way, newest first: the public history of what the platform sent. */
creatorEarningsRoutes.get("/creators/:address/forwards", async (c) => {
  const creator = creatorParam(c.req.param("address")).toBase58();
  const limit = Math.min(Math.max(Number(c.req.query("limit") ?? 50) || 50, 1), 100);
  const db = c.get("db");
  const rows = await db
    .select()
    .from(creatorForwards)
    .where(and(eq(creatorForwards.creator, creator), inArray(creatorForwards.status, ["sending", "paid"])))
    // Newest first by when the platform sent it: the row's own clock, which is strictly ordered, where the chain's block
    // time is whole seconds and two forwards of one run tie or not by chance (seen on 2026-10-30).
    .orderBy(desc(creatorForwards.createdAt), desc(creatorForwards.signature))
    .limit(limit);
  const quote = await quoteRefs(db, new Map(rows.map((r) => [r.assetMint, r.assetDecimals])));
  const res: CreatorForwardList = {
    forwards: rows.map((r) => ({
      signature: r.signature,
      quote: quote(r.assetMint),
      amount: r.amount,
      status: r.status as "sending" | "paid",
      time: (r.paidAt ?? r.createdAt).toISOString(),
    })),
  };
  return c.json(res);
});
