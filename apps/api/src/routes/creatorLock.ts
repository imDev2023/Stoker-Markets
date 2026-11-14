import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { Connection, PublicKey } from "@solana/web3.js";
import BN from "bn.js";
import { eq } from "drizzle-orm";
import { prepareCreatorLockClaim, readCreatorLock, rewardTaxFee, unlockedAmount, unlockEndsAt, withheldFee, type CreatorLockState } from "@launchpad/chain";
import { CreatorLockClaimRequest, type CreatorLockStatus, type PreparedCreatorLockClaim } from "@launchpad/contract";
import { launches, type Db } from "@launchpad/db";
import type { AppEnv } from "../env";
import { creatorLockTerms } from "./launches";

/**
 * A coin's Creator Lock (ADR 0023, #186): what the chain holds for the Creator and what has unlocked, and the claim of
 * it, which the Creator's own wallet signs and pays for (ADR 0003). Read from the chain on each request: LaunchLab keeps
 * the schedule and every claim, so nothing here is stored.
 */
export const creatorLockRoutes = new Hono<AppEnv>();

async function lockedLaunch(db: Db, mint: string) {
  const [launch] = await db
    .select({
      mint: launches.mint, pool: launches.pool, creator: launches.creator, supply: launches.supply, rewardTaxBps: launches.rewardTaxBps,
      lockedAmount: launches.lockedAmount, lockCliffSeconds: launches.lockCliffSeconds, lockUnlockSeconds: launches.lockUnlockSeconds,
    })
    .from(launches)
    .where(eq(launches.mint, mint))
    .limit(1);
  if (!launch) throw new HTTPException(404, { message: "launch not found" });
  const terms = creatorLockTerms(launch);
  if (!terms) throw new HTTPException(404, { message: "This coin has no Creator Lock." });
  return { ...launch, terms };
}

/** Reads the lock and `wallet`'s share of it, with the chain's time to count what has unlocked at. */
async function readLock(connection: Connection, program: PublicKey, pool: string, wallet: PublicKey) {
  const [lock, now] = await Promise.all([
    readCreatorLock(connection, program, new PublicKey(pool), wallet),
    connection.getSlot("confirmed").then((slot) => connection.getBlockTime(slot)),
  ]).catch((e: unknown) => {
    console.error("reading a Creator Lock failed", e);
    throw new HTTPException(503, { message: "Couldn't read this coin's lock from the chain. Try again in a moment." });
  });
  if (!lock) throw new Error(`the curve at ${pool} holds no lock, though its launch locked coins`);
  return { lock, now: now ?? Math.floor(Date.now() / 1000) };
}

/** What a share has unlocked by `now`, and what a claim would pay: nothing before Graduation, when a claim can't land. */
function shareFigures(lock: CreatorLockState, now: number) {
  if (!lock.share) return null;
  const unlocked = unlockedAmount(lock.share.amount, lock, now);
  const claimable = lock.status === "graduated" && unlocked.gt(lock.share.claimed) ? unlocked.sub(lock.share.claimed) : new BN(0);
  return { amount: lock.share.amount, unlocked, claimed: lock.share.claimed, claimable };
}

const iso = (seconds: number | null) => (seconds === null ? null : new Date(seconds * 1000).toISOString());

creatorLockRoutes.get("/launches/:mint/lock", async (c) => {
  const cfg = c.get("cfg");
  const launch = await lockedLaunch(c.get("db"), c.req.param("mint"));
  const { lock, now } = await readLock(new Connection(cfg.rpcUrl, "confirmed"), cfg.launchlab, launch.pool, new PublicKey(launch.creator));
  const share = shareFigures(lock, now);
  const body: CreatorLockStatus = {
    mint: launch.mint,
    creator: launch.creator,
    terms: launch.terms,
    curve: lock.status,
    unlockStartsAt: iso(lock.unlockStartsAt),
    unlockEndsAt: iso(unlockEndsAt(lock)),
    asOf: new Date(now * 1000).toISOString(),
    creatorShare: share && {
      amount: share.amount.toString(), unlocked: share.unlocked.toString(), claimed: share.claimed.toString(), claimable: share.claimable.toString(),
    },
    stillLocked: lock.lockedAmount.sub(share?.claimed ?? new BN(0)).toString(),
    rewardTaxBps: launch.rewardTaxBps,
  };
  return c.json(body);
});

/**
 * The claim of what has unlocked, for the wallet that holds a share of the lock (the Creator's, in a launch our API
 * built) to sign. Refused, with the reason, while a claim could not land: before Graduation, while the cliff runs, and
 * when nothing new has unlocked since the last claim.
 */
creatorLockRoutes.post("/launches/:mint/lock/claim", async (c) => {
  const cfg = c.get("cfg");
  const request = CreatorLockClaimRequest.safeParse(await c.req.json().catch(() => null));
  if (!request.success) return c.json({ error: "invalid claim request", details: request.error.issues }, 400);
  const launch = await lockedLaunch(c.get("db"), c.req.param("mint"));
  const wallet = new PublicKey(request.data.wallet);
  const connection = new Connection(cfg.rpcUrl, "confirmed");
  const { lock, now } = await readLock(connection, cfg.launchlab, launch.pool, wallet);
  const share = shareFigures(lock, now);
  if (!share) return c.json({ error: "This wallet has no share of the coin's Creator Lock." }, 403);
  if (lock.status !== "graduated") return c.json({ error: "Locked coins can be claimed once the coin has graduated." }, 409);
  if (lock.unlockStartsAt !== null && now < lock.unlockStartsAt)
    return c.json({ error: `Nothing unlocks until ${iso(lock.unlockStartsAt)}.`, details: { unlockStartsAt: iso(lock.unlockStartsAt) } }, 409);
  if (share.claimable.isZero()) return c.json({ error: "Nothing new has unlocked since the last claim. Try again later." }, 409);
  const prepared = await prepareCreatorLockClaim(connection, { program: cfg.launchlab, pool: new PublicKey(launch.pool), wallet });
  const body: PreparedCreatorLockClaim = {
    ...prepared,
    amount: share.claimable.toString(),
    // A Reward Launch's coin withholds its Reward Tax on a claim as on any transfer: the holders get that share.
    received: share.claimable.sub(withheldFee(share.claimable, rewardTaxFee(launch.rewardTaxBps))).toString(),
  };
  return c.json(body);
});
