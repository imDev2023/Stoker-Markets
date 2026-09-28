import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { Connection, PublicKey } from "@solana/web3.js";
import BN from "bn.js";
import { eq } from "drizzle-orm";
import { LAUNCH_SHAPE, launchlabPdas, loadLookupTable, prepareAirdrop } from "@launchpad/chain";
import { FirstBuyQuoteQuery, type AirdropStatus, type FirstBuyQuote, type PreparedAirdrop } from "@launchpad/contract";
import { launchDrafts, type Db } from "@launchpad/db";
import { airdropSource, claimForSending, needsScan, paymentStatus } from "../airdrop";
import { quoteMarket, type AppEnv, type Config } from "../env";
import { indexAccountHistory } from "../indexer";
import {
  buildLaunch, firstBuyToContract, launchQuoteAsset, loadDraft, quoteLaunchFirstBuy, refuseWith, resolveDraftModes, type LoadedDraft,
} from "../launch";

/** Launch modes: first-buy quotes, retrying a prepared launch, and paying its airdrop. */
export const launchModeRoutes = new Hono<AppEnv>();

/** What a first buy of a given amount would get on a new coin, before anything is prepared. */
launchModeRoutes.get("/launch-quote", async (c) => {
  const query = FirstBuyQuoteQuery.safeParse(c.req.query());
  if (!query.success) return c.json({ error: "invalid launch quote request", details: query.error.issues }, 400);
  const cfg = c.get("cfg");
  const quote = await launchQuoteAsset(c.get("db"), cfg, quoteMarket(c.env), query.data.quoteMint);
  const q = await quoteLaunchFirstBuy(new Connection(cfg.rpcUrl, "confirmed"), cfg, quote, new BN(query.data.firstBuy), query.data.rewardTax ?? null).catch(refuseWith(400));
  const res: FirstBuyQuote = { firstBuy: firstBuyToContract(q, quote.decimals, q.quoteTransferFeeBps, q.rewardTaxBps) };
  return c.json(res);
});

async function draftOr404(db: Db, mint: string): Promise<LoadedDraft> {
  const loaded = await loadDraft(db, mint);
  if (!loaded) throw new HTTPException(404, { message: "no launch was prepared for this coin" });
  return loaded;
}

/**
 * Prepares a launch again, for the same coin address, with what the Creator first asked for: a retry after a failure or
 * an expired transaction. The same address means a retry can never create a second coin; if the first attempt did land
 * after all, this indexes it and answers 409.
 */
launchModeRoutes.post("/launches/:mint/prepare", async (c) => {
  const cfg = c.get("cfg");
  const db = c.get("db");
  const loaded = await draftOr404(db, c.req.param("mint"));
  const connection = new Connection(cfg.rpcUrl, "confirmed");
  const pool = launchlabPdas(cfg.launchlab).pool(new PublicKey(loaded.draft.mint), new PublicKey(loaded.draft.quoteMint));
  if (await connection.getAccountInfo(pool, "confirmed")) {
    await indexAccountHistory(db, cfg, connection, pool, null);
    return c.json({ error: "This coin has already launched.", details: { mint: loaded.draft.mint } }, 409);
  }
  const modes = await resolveDraftModes(db, connection, cfg, loaded).catch(refuseWith(409));
  return c.json(await buildLaunch(connection, cfg, loaded, modes.quote, modes.firstBuy, modes.summary));
});

/** The coin's token program, once its mint exists: every coin account and transfer of it names this program. */
async function coinTokenProgram(connection: Connection, mint: string) {
  return (await connection.getAccountInfo(new PublicKey(mint), "confirmed"))?.owner ?? null;
}

/** Marks payments that landed without being reported, before anyone decides what is still unpaid. */
async function scanPayments(db: Db, cfg: Config, connection: Connection, loaded: LoadedDraft, tokenProgram: PublicKey | null) {
  if (!tokenProgram || !needsScan(loaded.recipients)) return loaded;
  const { draft } = loaded;
  const { newest } = await indexAccountHistory(db, cfg, connection, airdropSource(draft, tokenProgram), draft.airdropScannedUntil);
  if (newest !== draft.airdropScannedUntil) await db.update(launchDrafts).set({ airdropScannedUntil: newest }).where(eq(launchDrafts.mint, draft.mint));
  return (await loadDraft(db, draft.mint))!;
}

/** Which wallets the airdrop pays, and which of them have been paid. Public, like the payments themselves. */
launchModeRoutes.get("/launches/:mint/airdrop", async (c) => {
  const cfg = c.get("cfg");
  const db = c.get("db");
  let loaded = await draftOr404(db, c.req.param("mint"));
  if (loaded.recipients.length === 0) return c.json({ error: "this coin has no airdrop" }, 404);
  const connection = new Connection(cfg.rpcUrl, "confirmed");
  const blockHeight = needsScan(loaded.recipients) ? await connection.getBlockHeight("confirmed") : null;
  loaded = await scanPayments(db, cfg, connection, loaded, await coinTokenProgram(connection, loaded.draft.mint));
  const sum = (rs: typeof loaded.recipients) => rs.reduce((s, r) => s + BigInt(r.amount), 0n).toString();
  const res: AirdropStatus = {
    mint: loaded.draft.mint,
    creator: loaded.draft.creator,
    amount: sum(loaded.recipients),
    paid: sum(loaded.recipients.filter((r) => r.paidSignature)),
    recipients: loaded.recipients.map((r) => ({
      wallet: r.wallet, amount: r.amount, status: paymentStatus(r, blockHeight), signature: r.paidSignature,
    })),
  };
  return c.json(res);
});

// Solana produces a block about every 400 ms.
const SECONDS_PER_BLOCK = 0.4;

/**
 * The transactions that pay every unpaid wallet of the airdrop, for the Creator to sign. A wallet whose earlier
 * transaction can still land is never handed a second one: the request is refused until that transaction has expired.
 */
launchModeRoutes.post("/launches/:mint/airdrop/prepare", async (c) => {
  const cfg = c.get("cfg");
  const db = c.get("db");
  let loaded = await draftOr404(db, c.req.param("mint"));
  if (loaded.recipients.length === 0) return c.json({ error: "this coin has no airdrop" }, 404);
  const connection = new Connection(cfg.rpcUrl, "confirmed");
  const tokenProgram = await coinTokenProgram(connection, loaded.draft.mint);
  if (!tokenProgram) return c.json({ error: "The coin hasn't launched yet. Launch it first, then send the airdrop." }, 409);

  // Read the height before scanning: a transaction that expired by then landed, if at all, in a block the scan sees.
  const blockHeight = await connection.getBlockHeight("confirmed");
  loaded = await scanPayments(db, cfg, connection, loaded, tokenProgram);
  const unpaid = loaded.recipients.filter((r) => !r.paidSignature);
  if (unpaid.length === 0) return c.json({ error: "Every wallet in this airdrop has been paid." }, 409);
  const inFlight = Math.max(...unpaid.map((r) => r.sendableUntil ?? -1));
  if (inFlight >= blockHeight) {
    const retryAfterSeconds = Math.ceil((inFlight - blockHeight + 1) * SECONDS_PER_BLOCK) + 1;
    return c.json({
      error: `Airdrop transactions handed out a moment ago can still land. Try again in about ${retryAfterSeconds} seconds.`,
      details: { retryAfterSeconds },
    }, 409);
  }

  const creator = new PublicKey(loaded.draft.creator);
  const needed = unpaid.reduce((s, r) => s + BigInt(r.amount), 0n);
  const source = airdropSource(loaded.draft, tokenProgram);
  const held = BigInt((await connection.getTokenAccountBalance(source, "confirmed").catch(() => null))?.value.amount ?? 0);
  if (held < needed)
    return c.json({ error: "Your wallet no longer holds enough of the coin to pay the rest of the airdrop." }, 409);

  const prepared = await prepareAirdrop(connection, {
    creator,
    mint: new PublicKey(loaded.draft.mint),
    decimals: LAUNCH_SHAPE.decimals,
    tokenProgram,
    recipients: unpaid.map((r) => ({ wallet: new PublicKey(r.wallet), amount: new BN(r.amount) })),
    lookupTable: await loadLookupTable(connection, cfg.lookupTable),
  });
  const wallets = unpaid.map((r) => r.wallet);
  const claimed = await claimForSending(db, loaded.draft.mint, wallets, blockHeight, prepared.lastValidBlockHeight);
  if (claimed.length !== wallets.length)
    return c.json({ error: "Another request is already sending this airdrop. Try again in a minute." }, 409);
  const res: PreparedAirdrop = {
    transactions: prepared.transactions.map((t) => t.transaction),
    lastValidBlockHeight: prepared.lastValidBlockHeight,
    recipients: wallets.length,
  };
  return c.json(res);
});
