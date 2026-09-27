// Q3c: a curve trade that omits the three trailing accounts (system program, platform fee vault, creator fee vault).
// Shows where the platform and creator fees go in that case, which decides which claim instructions a fee backend must run.
import { LAMPORTS_PER_SOL, PublicKey, TransactionInstruction } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import BN from "bn.js";
import { key, send, loadState, saveState, tokenBal, WSOL } from "./common";
import * as L from "./launchlab";

const creator = key("creator"), trader = key("trader"), feeWallet = key("feewallet");
const st = loadState();
const platformConfig = new PublicKey(st.platformConfig);
const k: L.PoolKeys = { pool: new PublicKey(st.poolT22.pool), baseMint: new PublicKey(st.poolT22.baseMint), quoteMint: WSOL, globalConfig: new PublicKey("7ZR4zD7PYfY2XxoG1Gxcy2EgEeGYrpxrwzPuwdUBssEt"), platformConfig, creator: creator.publicKey, baseProgram: TOKEN_2022_PROGRAM_ID };
const snap = async () => {
  const ps = await L.poolState(k.pool);
  return { pool_platform_fee_field: ps.platform_fee, pool_protocol_fee_field: ps.quote_protocol_fee, platform_fee_vault: (await tokenBal(L.platformFeeVault(platformConfig, WSOL))).toString(), creator_fee_vault: (await tokenBal(L.creatorFeeVault(creator.publicKey, WSOL))).toString() };
};
await send("q3c trader wraps 0.02 SOL", L.wrapSolIxs(trader.publicKey, 0.02 * LAMPORTS_PER_SOL), [trader]);
const before = await snap();
const [ata, buy] = L.tradeIx("buy", trader.publicKey, k, new BN(0.01 * LAMPORTS_PER_SOL));
const stripped = new TransactionInstruction({ programId: buy.programId, data: buy.data, keys: buy.keys.slice(0, buy.keys.length - 3) });
const sig = await send("q3c buy WITHOUT fee-vault remaining accounts", [ata, stripped], [trader], { expectFail: true });
const ev = sig ? (await L.events(sig)).find((e) => e.name === "TradeEvent") : null;
const after = await snap();
console.log("TradeEvent fees", JSON.stringify(ev && { protocol_fee: ev.protocol_fee, platform_fee: ev.platform_fee, creator_fee: ev.creator_fee }));
console.log("before", JSON.stringify(before), "after", JSON.stringify(after));
let poolClaim: string | null = null;
if (sig && BigInt(after.pool_platform_fee_field) > 0n) poolClaim = await send("q3c claim_platform_fee (pool-level) now has something to collect", [L.claimPlatformFeeIx(feeWallet.publicKey, k)], [feeWallet], { expectFail: true });
saveState({ q3c: { sig, fees: ev && { protocol_fee: ev.protocol_fee, platform_fee: ev.platform_fee, creator_fee: ev.creator_fee }, before, after, poolClaim, afterPoolClaim: await snap() } });
console.log("after pool-level claim", JSON.stringify(await snap()));
