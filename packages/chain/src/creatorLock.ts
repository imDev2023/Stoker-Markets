import { ComputeBudgetProgram, type Connection, type PublicKey } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import BN from "bn.js";
import { launchlabCoder } from "./coder";
import { claimVestedTokenIx } from "./instructions";
import { launchlabPdas } from "./pda";
import type { CurveStatus } from "./trade";
import { unsignedTransaction, type UnsignedTransaction } from "./wallet";

/**
 * A curve's locked coins as the chain has them (ADR 0023, #186), with one wallet's share of them. Proven on the local
 * chain: the coins stay in the curve's own vault, which LaunchLab's authority owns, through Graduation and after it,
 * and leave only by a claim. The mint's supply does not change, so they count in it while they are locked.
 */
export type CreatorLockState = {
  status: CurveStatus;
  /** The coins the launch locked, and how many of them have been given to a wallet; a Creator Lock gives all at launch. */
  lockedAmount: BN;
  allocatedAmount: BN;
  cliffSeconds: number;
  unlockSeconds: number;
  /**
   * When the cliff ends and the coins start to unlock, in Unix seconds: the block time of the buy that sold the curve
   * out, plus the cliff. The program sets it at that buy and the migration leaves it alone, so the cliff runs from the
   * sell-out, seconds before Graduation where Raydium's crank is prompt. Null while the curve still sells: a coin that
   * never sells out never unlocks. A claim also needs the migration to have happened (6015 until then).
   */
  unlockStartsAt: number | null;
  /** The wallet's own share and what it has claimed of it; null for a wallet that was given none. */
  share: { amount: BN; claimed: BN } | null;
};

type PoolVesting = {
  status: number; base_mint: PublicKey; token_program_flag: number;
  vesting_schedule: { total_locked_amount: BN; cliff_period: BN; unlock_period: BN; start_time: BN; allocated_share_amount: BN };
};
type VestingRecord = { claimed_amount: BN; token_share_amount: BN };

const STATUS: readonly CurveStatus[] = ["live", "graduating", "graduated"];

/**
 * How many coins of a share have unlocked at `now` (Unix seconds), as the program counts them: none until the cliff
 * ends, then in proportion to the unlock time gone by, rounded down, and all of them once it has passed or when there
 * is no unlock time. What a claim pays is this less what was claimed before.
 */
export function unlockedAmount(share: BN, lock: Pick<CreatorLockState, "unlockStartsAt" | "unlockSeconds">, now: number): BN {
  if (lock.unlockStartsAt === null || now < lock.unlockStartsAt) return new BN(0);
  const elapsed = now - lock.unlockStartsAt;
  if (lock.unlockSeconds === 0 || elapsed >= lock.unlockSeconds) return share;
  return share.mul(new BN(elapsed)).div(new BN(lock.unlockSeconds));
}

/** When the last coin of a lock has unlocked, in Unix seconds; null while the curve still sells. */
export const unlockEndsAt = (lock: Pick<CreatorLockState, "unlockStartsAt" | "unlockSeconds">) =>
  lock.unlockStartsAt === null ? null : lock.unlockStartsAt + lock.unlockSeconds;

/**
 * Reads a curve's locked coins and `wallet`'s share of them. Null when there is no curve at `pool` or its launch locked
 * nothing.
 */
export async function readCreatorLock(connection: Connection, program: PublicKey, pool: PublicKey, wallet: PublicKey): Promise<CreatorLockState | null> {
  const [poolAccount, recordAccount] = await connection.getMultipleAccountsInfo([pool, launchlabPdas(program).vestingRecord(pool, wallet)], "confirmed");
  if (!poolAccount) return null;
  const s = launchlabCoder.accounts.decode("PoolState", poolAccount.data) as PoolVesting;
  const v = s.vesting_schedule;
  if (v.total_locked_amount.isZero()) return null;
  const record = recordAccount ? (launchlabCoder.accounts.decode("VestingRecord", recordAccount.data) as VestingRecord) : null;
  return {
    status: STATUS[s.status] ?? "graduated",
    lockedAmount: v.total_locked_amount,
    allocatedAmount: v.allocated_share_amount,
    cliffSeconds: v.cliff_period.toNumber(),
    unlockSeconds: v.unlock_period.toNumber(),
    unlockStartsAt: v.start_time.isZero() ? null : v.start_time.toNumber(),
    share: record ? { amount: record.token_share_amount, claimed: record.claimed_amount } : null,
  };
}

const CLAIM_COMPUTE_UNITS = 100_000;

/**
 * Builds the claim of a wallet's unlocked coins, for the wallet to sign and pay for (ADR 0003): nothing here goes
 * through the operations key. The caller decides whether anything is claimable (`readCreatorLock` and `unlockedAmount`);
 * a claim with nothing new fails on-chain with 6009, one before the cliff ends with 6012.
 */
export async function prepareCreatorLockClaim(connection: Connection, r: { program: PublicKey; pool: PublicKey; wallet: PublicKey }): Promise<UnsignedTransaction> {
  const account = await connection.getAccountInfo(r.pool, "confirmed");
  if (!account) throw new Error(`no curve at ${r.pool.toBase58()}`);
  const s = launchlabCoder.accounts.decode("PoolState", account.data) as PoolVesting;
  return unsignedTransaction(connection, r.wallet, [
    ComputeBudgetProgram.setComputeUnitLimit({ units: CLAIM_COMPUTE_UNITS }),
    claimVestedTokenIx({
      program: r.program, beneficiary: r.wallet, pool: r.pool, baseMint: s.base_mint,
      baseTokenProgram: s.token_program_flag & 1 ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID,
    }),
  ]);
}
