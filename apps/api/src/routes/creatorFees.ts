import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { Connection, PublicKey } from "@solana/web3.js";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { NothingToClaimError, prepareCreatorFeeClaim, readCreatorFeeVaults, WSOL_MINT } from "@launchpad/chain";
import {
  PrepareCreatorFeeClaimRequest, type CreatorFeeClaimList, type CreatorFees, type CreatorForwardList, type PreparedCreatorFeeClaim, type QuoteRef,
} from "@launchpad/contract";
import { creatorFeeClaims, creatorForwards, curves, graduations, launches, launchMetadata, quoteAssets, trades, type Db } from "@launchpad/db";
import type { AppEnv } from "../env";
import { committedForwards, creatorShares, creatorSharesByLaunch } from "../fees/creatorShares";
import { toQuoteRef } from "../quotes/assets";

/**
 * The Creator Fee: what a Creator can claim per Quote Asset (read from the chain), what their Launches earned, the claim
 * transaction (ADR 0003), and the public history of their claims. Next to it, the Creator Forward (ADR 0007): what the
 * platform owes and has paid the Creator from its own revenue.
 */
export const creatorFeeRoutes = new Hono<AppEnv>();

function creatorParam(value: string) {
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value)) throw new HTTPException(400, { message: "invalid creator address" });
  try {
    return new PublicKey(value);
  } catch {
    throw new HTTPException(400, { message: "invalid creator address" });
  }
}

/**
 * How to show amounts in each Quote Asset: from the Quote Registry, or, for a mint it doesn't list, just the mint and the
 * decimals the chain reports.
 */
async function quoteRefs(db: Db, decimals: Map<string, number>) {
  const mints = [...decimals.keys()];
  const rows = mints.length ? await db.select().from(quoteAssets).where(inArray(quoteAssets.mint, mints)) : [];
  const listed = new Map(rows.map((r) => [r.mint, toQuoteRef(r)]));
  return (mint: string): QuoteRef =>
    listed.get(mint) ?? { mint, symbol: null, name: null, decimals: decimals.get(mint)!, logo: null, category: "community", issuer: null };
}

creatorFeeRoutes.get("/creators/:address/fees", async (c) => {
  const creator = creatorParam(c.req.param("address"));
  const address = creator.toBase58();
  const db = c.get("db");
  const cfg = c.get("cfg");
  const [ownLaunches, claimed, shares, committed, byLaunch] = await Promise.all([
    db
      .select({
        mint: launches.mint,
        name: launches.name,
        symbol: launches.symbol,
        quoteMint: launches.quoteMint,
        hasMetadata: sql<boolean>`${launchMetadata.id} is not null`,
        status: curves.status,
        graduated: sql<boolean>`${graduations.mint} is not null`,
        // The chain pays the Creator Fee on curve trades only; after Graduation the Creator's share is all forwarded.
        earned: sql<string>`coalesce((select sum(${trades.creatorFee}) from ${trades} where ${trades.mint} = ${launches.mint} and ${trades.venue} = 'curve'), 0)::text`,
      })
      .from(launches)
      .leftJoin(launchMetadata, eq(launchMetadata.id, launches.mint))
      .leftJoin(curves, eq(curves.mint, launches.mint))
      .leftJoin(graduations, eq(graduations.mint, launches.mint))
      .where(eq(launches.creator, address))
      .orderBy(desc(launches.createdSlot)),
    db
      .select({ quoteMint: creatorFeeClaims.quoteMint, amount: sql<string>`sum(${creatorFeeClaims.amount})::text` })
      .from(creatorFeeClaims)
      .where(eq(creatorFeeClaims.creator, address))
      .groupBy(creatorFeeClaims.quoteMint),
    creatorShares(db, { collectedOnly: false, creator: address }),
    committedForwards(db, address),
    creatorSharesByLaunch(db, address),
  ]);
  const forward = (quoteMint: string) => {
    const share = shares.find((s) => s.mint === quoteMint);
    const earned = share ? share.curve + share.pool : 0n;
    const forwarded = committed.get(`${address} ${quoteMint}`) ?? 0n;
    return { earned: earned.toString(), forwarded: forwarded.toString(), pending: (earned > forwarded ? earned - forwarded : 0n).toString() };
  };

  // SOL first, then the other Quote Assets in a stable order.
  const mints = [...new Set([...ownLaunches.map((l) => l.quoteMint), ...claimed.map((r) => r.quoteMint)])].sort((a, b) =>
    a === WSOL_MINT.toBase58() ? -1 : b === WSOL_MINT.toBase58() ? 1 : a.localeCompare(b),
  );
  const vaults = await readCreatorFeeVaults(new Connection(cfg.rpcUrl, "confirmed"), cfg.launchlab, creator, mints.map((m) => new PublicKey(m)));
  const sum = (values: string[]) => values.reduce((a, b) => a + BigInt(b), 0n).toString();
  const quote = await quoteRefs(db, new Map(vaults.map((v) => [v.quoteMint.toBase58(), v.quoteDecimals])));

  const res: CreatorFees = {
    creator: address,
    assets: vaults.map((v) => {
      const quoteMint = v.quoteMint.toBase58();
      return {
        quote: quote(quoteMint),
        vault: v.vault.toBase58(),
        claimable: v.balance.toString(),
        earned: sum(ownLaunches.filter((l) => l.quoteMint === quoteMint).map((l) => l.earned)),
        claimed: sum(claimed.filter((r) => r.quoteMint === quoteMint).map((r) => r.amount)),
        forward: forward(quoteMint),
      };
    }),
    launches: ownLaunches.map((l) => ({
      mint: l.mint,
      name: l.name,
      symbol: l.symbol,
      image: l.hasMetadata ? `${cfg.publicApiUrl}/metadata/${l.mint}/image` : null,
      quote: quote(l.quoteMint),
      // A Launch nobody has traded yet is live; one Raydium has migrated is graduated whatever its last curve trade said.
      status: l.graduated ? "graduated" : (l.status ?? "live"),
      earned: l.earned,
      forward: { curve: byLaunch.curve.get(l.mint) ?? "0", pool: byLaunch.pool.get(l.mint) ?? "0" },
    })),
  };
  return c.json(res);
});

creatorFeeRoutes.get("/creators/:address/claims", async (c) => {
  const creator = creatorParam(c.req.param("address")).toBase58();
  const limit = Math.min(Math.max(Number(c.req.query("limit") ?? 50) || 50, 1), 100);
  const db = c.get("db");
  const rows = await db
    .select()
    .from(creatorFeeClaims)
    .where(eq(creatorFeeClaims.creator, creator))
    .orderBy(desc(creatorFeeClaims.slot), desc(creatorFeeClaims.signature), desc(creatorFeeClaims.eventIndex))
    .limit(limit);
  const quote = await quoteRefs(db, new Map(rows.map((r) => [r.quoteMint, r.quoteDecimals])));
  const res: CreatorFeeClaimList = {
    claims: rows.map((r) => ({
      signature: r.signature,
      quote: quote(r.quoteMint),
      amount: r.amount,
      time: r.blockTime.toISOString(),
    })),
  };
  return c.json(res);
});

/** The Creator Forwards paid to a Creator, or on their way, newest first: the public history of what the platform sent. */
creatorFeeRoutes.get("/creators/:address/forwards", async (c) => {
  const creator = creatorParam(c.req.param("address")).toBase58();
  const limit = Math.min(Math.max(Number(c.req.query("limit") ?? 50) || 50, 1), 100);
  const db = c.get("db");
  const rows = await db
    .select()
    .from(creatorForwards)
    .where(and(eq(creatorForwards.creator, creator), inArray(creatorForwards.status, ["sending", "paid"])))
    .orderBy(desc(sql`coalesce(${creatorForwards.paidAt}, ${creatorForwards.createdAt})`), desc(creatorForwards.signature))
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

/** The claim transaction for the Creator's wallet to sign. Only the Creator's own vault can be claimed, by the Creator. */
creatorFeeRoutes.post("/creator-fees/prepare", async (c) => {
  const body = PrepareCreatorFeeClaimRequest.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: "invalid claim request", details: body.error.issues }, 400);
  const cfg = c.get("cfg");
  try {
    const p = await prepareCreatorFeeClaim(new Connection(cfg.rpcUrl, "confirmed"), {
      program: cfg.launchlab,
      creator: new PublicKey(body.data.creator),
      quoteMint: new PublicKey(body.data.quoteMint),
    });
    const quote = await quoteRefs(c.get("db"), new Map([[body.data.quoteMint, p.quoteDecimals]]));
    const res: PreparedCreatorFeeClaim = {
      transaction: p.transaction,
      lastValidBlockHeight: p.lastValidBlockHeight,
      quote: quote(body.data.quoteMint),
      amount: p.amount.toString(),
      unwrapped: p.unwrapped,
    };
    return c.json(res);
  } catch (e) {
    if (e instanceof NothingToClaimError) return c.json({ error: e.message }, 409);
    throw e;
  }
});
