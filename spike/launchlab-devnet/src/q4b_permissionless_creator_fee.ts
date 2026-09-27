// Q4b: after graduation, can our backend push the CPMM creator fee to the token creator without the creator's signature?
// Uses the SDK's collectCreatorFeePermissionless builder with the fee wallet as payer.
import { LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddressSync, createAssociatedTokenAccountIdempotentInstruction } from "@solana/spl-token";
import { collectCreatorFeePermissionlessInInstruction } from "@raydium-io/raydium-sdk-v2";
import BN from "bn.js";
import { DEV, key, send, loadState, saveState, tokenBal, WSOL } from "./common";
import * as L from "./launchlab";
import * as C from "./cpmm";

const creator = key("creator"), trader = key("trader"), feeWallet = key("feewallet");
const cpPool = new PublicKey(loadState().migration.cpPool);
let pool = await C.cpPoolInfo(cpPool);
await send("q4b trader wraps 0.02 SOL", L.wrapSolIxs(trader.publicKey, 0.02 * LAMPORTS_PER_SOL), [trader]);
await send("q4b CPMM swap: trader buys with 0.02 WSOL", C.swapIxs(trader.publicKey, pool, cpPool, WSOL, new BN(0.02 * LAMPORTS_PER_SOL)), [trader]);
pool = await C.cpPoolInfo(cpPool);
const mintA = new PublicKey(pool.mintA), mintB = new PublicKey(pool.mintB), pA = new PublicKey(pool.mintProgramA), pB = new PublicKey(pool.mintProgramB);
const ataA = getAssociatedTokenAddressSync(mintA, creator.publicKey, false, pA), ataB = getAssociatedTokenAddressSync(mintB, creator.publicKey, false, pB);
const before = { accruedA: pool.creatorFeesMintA, creatorWsol: (await tokenBal(ataA)).toString() };
const ix = collectCreatorFeePermissionlessInInstruction(DEV.CPMM, feeWallet.publicKey, creator.publicKey, C.CP_AUTH, cpPool, new PublicKey(pool.configId),
  new PublicKey(pool.vaultA), new PublicKey(pool.vaultB), mintA, mintB, ataA, ataB, pA, pB);
const sig = await send("q4b CPMM collect_creator_fee_permissionless (fee wallet pays, creator receives)", [
  createAssociatedTokenAccountIdempotentInstruction(feeWallet.publicKey, ataB, creator.publicKey, mintB, pB), ix,
], [feeWallet], { expectFail: true });
const after = { accruedA: (await C.cpPoolInfo(cpPool)).creatorFeesMintA, creatorWsol: (await tokenBal(ataA)).toString() };
console.log("before", JSON.stringify(before), "after", JSON.stringify(after));
saveState({ q4b: { sig, before, after } });
