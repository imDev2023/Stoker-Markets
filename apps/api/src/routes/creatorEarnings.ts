import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { PublicKey } from "@solana/web3.js";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { WSOL_MINT } from "@launchpad/chain";
import type { CoinEarnings, CreatorBuyback, CreatorEarnings, CreatorForwardList, GraduationFee, QuoteRef } from "@launchpad/contract";
import { creatorBuybacks, creatorForwards, curves, graduations, launches, launchMetadata, quoteAssets, rewardRounds, type Db } from "@launchpad/db";
import type { AppEnv } from "../env";
import { collectedSharesByLaunch, committedForwards, creatorShares, creatorSharesByLaunch, rulePots, withheldGraduationFees } from "../fees/creatorShares";
import { coinTiers } from "../fees/ladder";
import { toQuoteRef } from "../quotes/assets";
import { payoutRef, roundSummary } from "./rewards";

/**
 * Creator Earnings (ADR 0009): what a Creator has earned from the trades on their Launches, their share of what the
 * platform collected on them, per Quote Asset and per Launch, with each Launch's place on the Creator Ladder (ADR 0020),
 * what has been forwarded to their wallet, what a Graduation Fee kept (ADR 0015) and what is still to come; and the
 * public history of those Creator Forwards. There is nothing to claim: the platform pays it all.
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
  const [ownLaunches, shares, walletShares, committed, withheld, walletWithheld, byLaunch] = await Promise.all([
    db
      .select({
        mint: launches.mint,
        name: launches.name,
        symbol: launches.symbol,
        destination: launches.earningsDestination,
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
    // The coins that pay the wallet, on their own: the rest of what was earned goes to those coins' rules (ADR 0011).
    creatorShares(db, { collectedOnly: false, creator: address, walletOnly: true }),
    committedForwards(db, address),
    withheldGraduationFees(db, address),
    withheldGraduationFees(db, address, undefined, true),
    creatorSharesByLaunch(db, address),
  ]);
  const pots = new Map((await rulePots(db, ownLaunches.filter((l) => l.destination !== "wallet").map((l) => l.mint))).map((p) => [p.mint, p]));

  const tiers = await coinTiers(db, ownLaunches.map((l) => l.mint));
  // SOL first, then the other Quote Assets in a stable order.
  const quotes = new Map(ownLaunches.map((l) => [l.quote.mint, toQuoteRef(l.quote)]));
  const mints = [...quotes.keys()].sort((a, b) => (a === WSOL_MINT.toBase58() ? -1 : b === WSOL_MINT.toBase58() ? 1 : a.localeCompare(b)));
  const res: CreatorEarnings = {
    creator: address,
    assets: mints.map((mint) => {
      const total = (list: typeof shares) => {
        const share = list.find((s) => s.mint === mint);
        return share ? share.curve + share.pool : 0n;
      };
      const [earned, walletEarned] = [total(shares), total(walletShares)];
      const kept = withheld.get(`${address} ${mint}`) ?? 0n;
      const walletKept = walletWithheld.get(`${address} ${mint}`) ?? 0n;
      const forwarded = committed.get(`${address} ${mint}`) ?? 0n;
      // What the coins with a rule earned, less the Graduation Fees withheld on them: it never comes to the wallet.
      const toRule = earned - walletEarned - (kept - walletKept);
      const pending = walletEarned - walletKept - forwarded;
      return {
        quote: quotes.get(mint)!, earned: earned.toString(), withheld: kept.toString(), forwarded: forwarded.toString(),
        toRule: (toRule > 0n ? toRule : 0n).toString(), pending: (pending > 0n ? pending : 0n).toString(),
      };
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
      destination: l.destination,
      applied: l.destination === "wallet" ? null : (pots.get(l.mint)?.applied ?? 0n).toString(),
      tier: tiers.get(l.mint)!,
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
    // time is whole seconds and two forwards of one run tie or not by chance (seen on 2026-10-30; the same line as #158).
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

/** How many of a coin's rounds and buybacks its earnings page lists; the totals count them all. */
const EARNINGS_LIST = 10;

const buybackOf = (b: typeof creatorBuybacks.$inferSelect): CreatorBuyback => ({
  signature: b.signature,
  kind: b.kind,
  venue: b.venue,
  status: b.status as "sending" | "landed",
  spent: b.spent,
  coins: b.coins,
  burned: b.burned,
  liquidity:
    b.kind === "liquidity" && b.status === "landed" && b.lpAmount && b.feeKey && b.lockedLiquidity
      ? { coins: b.coinsAdded ?? "0", quote: b.quoteAdded ?? "0", lpAmount: b.lpAmount, feeKey: b.feeKey, lockedLiquidity: b.lockedLiquidity }
      : null,
  time: (b.blockTime ?? b.createdAt).toISOString(),
});

/**
 * Where one coin's Creator Earnings go and what has become of them (ADR 0011): the rule fixed at launch, the coin's
 * pot, and the rule's rounds or buybacks with their transactions, so anyone can check a rule was applied.
 */
creatorEarningsRoutes.get("/launches/:mint/earnings", async (c) => {
  const mint = creatorParam(c.req.param("mint")).toBase58();
  const db = c.get("db");
  const cfg = c.get("cfg");
  const [row] = await db
    .select({ launch: launches, quote: quoteAssets, graduation: graduations })
    .from(launches)
    .innerJoin(quoteAssets, eq(quoteAssets.mint, launches.quoteMint))
    .leftJoin(graduations, eq(graduations.mint, launches.mint))
    .where(eq(launches.mint, mint))
    .limit(1);
  if (!row) return c.json({ error: "not found" }, 404);
  const { launch } = row;
  const destination = launch.earningsDestination;
  const quote = toQuoteRef(row.quote);
  const none = { paidToHolders: "0", rounds: 0, spent: "0", buybacks: 0, burned: "0", coinsAdded: "0", quoteAdded: "0" };
  if (destination === "wallet") {
    const collected = (await collectedSharesByLaunch(db, [mint])).get(mint) ?? 0n;
    const res: CoinEarnings = {
      mint, destination, quote, collected: collected.toString(), withheld: row.graduation?.feeWithheld ?? "0", applied: null, waiting: null, minLamports: null,
      waitsForGraduation: false, rounds: [], buybacks: [], totals: none,
    };
    return c.json(res);
  }
  const [pot] = await rulePots(db, [mint]);
  const [rounds, [paid], buybacks, [bought]] = await Promise.all([
    db.select().from(rewardRounds).where(and(eq(rewardRounds.mint, mint), eq(rewardRounds.source, "earnings"))).orderBy(desc(rewardRounds.startedAt)).limit(EARNINGS_LIST),
    db
      .select({ paid: sql<string>`coalesce(sum(${rewardRounds.paid}), 0)::text`, rounds: sql<number>`count(*)::int` })
      .from(rewardRounds)
      .where(and(eq(rewardRounds.mint, mint), eq(rewardRounds.source, "earnings"))),
    db
      .select()
      .from(creatorBuybacks)
      .where(and(eq(creatorBuybacks.mint, mint), inArray(creatorBuybacks.status, ["sending", "landed"])))
      // Newest first by the row's own clock, which is strictly ordered where the chain's block time is whole seconds.
      .orderBy(desc(creatorBuybacks.createdAt), desc(creatorBuybacks.signature))
      .limit(EARNINGS_LIST),
    db
      .select({
        spent: sql<string>`coalesce(sum(${creatorBuybacks.spent}), 0)::text`, buybacks: sql<number>`count(*)::int`,
        burned: sql<string>`coalesce(sum(${creatorBuybacks.burned}), 0)::text`, coinsAdded: sql<string>`coalesce(sum(${creatorBuybacks.coinsAdded}), 0)::text`,
        quoteAdded: sql<string>`coalesce(sum(${creatorBuybacks.quoteAdded}), 0)::text`,
      })
      .from(creatorBuybacks)
      .where(and(eq(creatorBuybacks.mint, mint), eq(creatorBuybacks.status, "landed"))),
  ]);
  const res: CoinEarnings = {
    mint,
    destination,
    quote,
    collected: pot!.collected.toString(),
    withheld: pot!.withheld.toString(),
    applied: pot!.applied.toString(),
    waiting: pot!.available.toString(),
    minLamports: (destination === "liquidity" && cfg.liquidityAddMinLamports > cfg.creatorForwardMinLamports ? cfg.liquidityAddMinLamports : cfg.creatorForwardMinLamports).toString(),
    waitsForGraduation: destination === "liquidity" && !row.graduation,
    rounds: rounds.map((r) => roundSummary(r, payoutRef(launch, r.payoutMint, r.payoutDecimals, row.quote.symbol))),
    buybacks: buybacks.map(buybackOf),
    totals: {
      paidToHolders: paid!.paid, rounds: paid!.rounds, spent: bought!.spent, buybacks: bought!.buybacks, burned: bought!.burned,
      coinsAdded: bought!.coinsAdded, quoteAdded: bought!.quoteAdded,
    },
  };
  return c.json(res);
});
