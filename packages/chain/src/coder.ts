import { BorshCoder, type Idl } from "@coral-xyz/anchor";
import cpmmIdl from "../idl/cpmm.json" with { type: "json" };
import launchlabIdl from "../idl/launchlab.json" with { type: "json" };
import lockIdl from "../idl/lock.json" with { type: "json" };

/** Anchor coder for LaunchLab. The devnet and mainnet programs share this layout (the mainnet IDL only adds `collect_excess_lamports`). */
export const launchlabCoder = new BorshCoder(launchlabIdl as Idl);

/**
 * Anchor coder for Raydium's CPMM (raydium_cp_swap), where a Launch trades after Graduation. Devnet and mainnet share
 * this layout, including the pool creator fee that LaunchLab switches on when it migrates a curve.
 */
export const cpmmCoder = new BorshCoder(cpmmIdl as Idl);

/**
 * Anchor coder for Raydium's LP-lock program, which holds a graduated pool's LP behind its Fee Key NFT. Raydium publishes
 * only a legacy IDL for it, so `idl/lock.json` is that IDL converted to the current format (snake_case names, discriminators).
 */
export const lockCoder = new BorshCoder(lockIdl as Idl);
