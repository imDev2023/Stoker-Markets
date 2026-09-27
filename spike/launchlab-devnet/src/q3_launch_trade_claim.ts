// Q3: launch a token on our platform with initialize_v2, trade from a second wallet, and prove the creator fee and the
// platform fee accrue on the curve and can be claimed (claim_creator_fee, claim_platform_fee_from_vault, claim_platform_fee).
import { Keypair, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddressSync, NATIVE_MINT, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import BN from "bn.js";
import { key, send, saveState, loadState, logEvidence, tokenBal, WSOL } from "./common";
import * as L from "./launchlab";

const creator = key("creator"), trader = key("trader"), feeWallet = key("feewallet");
const st = loadState();
const platformConfig = new PublicKey(st.platformConfig);
const GLOBAL_SOL = new PublicKey("7ZR4zD7PYfY2XxoG1Gxcy2EgEeGYrpxrwzPuwdUBssEt"); // devnet SOL GlobalConfig, curve 0 index 0, min_quote_fund_raising 1 lamport
const FUND_RAISING = new BN(process.env.FUND_RAISING_LAMPORTS ?? String(0.2 * LAMPORTS_PER_SOL));
const sol = (x: bigint | number) => (Number(x) / LAMPORTS_PER_SOL).toFixed(9);

let k: L.PoolKeys;
if (!st.poolA) {
  const mint = Keypair.generate();
  const launch: L.Launch = {
    globalConfig: GLOBAL_SOL, platformConfig, quoteMint: WSOL,
    supply: new BN("1000000000000000"), totalBaseSell: new BN("793100000000000"), totalQuoteFundRaising: FUND_RAISING,
    ammFeeOn: "QuoteToken", name: "Spike Pairing A", symbol: "SPKA", uri: "https://example.invalid/spka.json",
  };
  const sig = await send("q3 initialize_v2 (SPL base, amm_fee_on=QuoteToken)", [L.initializeV2Ix(creator.publicKey, creator.publicKey, mint.publicKey, launch)], [creator, mint]);
  const pool = L.poolPda(mint.publicKey, WSOL);
  saveState({ poolA: { pool: pool.toBase58(), baseMint: mint.publicKey.toBase58(), fundRaising: FUND_RAISING.toString(), initSig: sig } });
  logEvidence("q3 PoolCreateEvent", { events: await L.events(sig) });
}
const a = loadState().poolA;
k = { pool: new PublicKey(a.pool), baseMint: new PublicKey(a.baseMint), quoteMint: WSOL, globalConfig: GLOBAL_SOL, platformConfig, creator: creator.publicKey, baseProgram: TOKEN_PROGRAM_ID };
console.log("pool", a.pool, "base mint", a.baseMint);

const pfVault = L.platformFeeVault(platformConfig, WSOL), cfVault = L.creatorFeeVault(creator.publicKey, WSOL);
const snapshot = async (label: string) => {
  const ps = await L.poolState(k.pool);
  const s = {
    label, pool_status: ps.status, real_quote: ps.real_quote, pool_platform_fee_field: ps.platform_fee, pool_protocol_fee_field: ps.quote_protocol_fee,
    platform_fee_vault: sol(await tokenBal(pfVault)), creator_fee_vault: sol(await tokenBal(cfVault)),
    creator_wsol: sol(await tokenBal(getAssociatedTokenAddressSync(NATIVE_MINT, creator.publicKey))),
    feewallet_wsol: sol(await tokenBal(getAssociatedTokenAddressSync(NATIVE_MINT, feeWallet.publicKey))),
  };
  console.log(JSON.stringify(s));
  logEvidence("q3 snapshot " + label, s);
  return s;
};

if (!loadState().q3TradesDone) {
  await snapshot("before trades");
  await send("q3 trader wraps 0.1 SOL", L.wrapSolIxs(trader.publicKey, 0.1 * LAMPORTS_PER_SOL), [trader]);
  const trades: [string, "buy" | "sell", () => Promise<BN>][] = [
    ["buy 0.03 SOL", "buy", async () => new BN(0.03 * LAMPORTS_PER_SOL)],
    ["sell half", "sell", async () => new BN((await tokenBal(getAssociatedTokenAddressSync(k.baseMint, trader.publicKey))).toString()).divn(2)],
    ["buy 0.02 SOL", "buy", async () => new BN(0.02 * LAMPORTS_PER_SOL)],
  ];
  for (const [label, side, amt] of trades) {
    const sig = await send(`q3 trader ${label}`, L.tradeIx(side, trader.publicKey, k, await amt()), [trader]);
    const ev = (await L.events(sig)).filter((e) => e.name === "TradeEvent").map((e) => ({ amount_in: e.amount_in, amount_out: e.amount_out, protocol_fee: e.protocol_fee, platform_fee: e.platform_fee, creator_fee: e.creator_fee, direction: Object.keys(e.trade_direction)[0] }));
    console.log("   TradeEvent", JSON.stringify(ev));
    logEvidence(`q3 TradeEvent ${label}`, { sig, ev });
  }
  saveState({ q3TradesDone: true });
}

const before = await snapshot("after trades, before claims");
await send("q3 claim_creator_fee (creator)", [L.claimCreatorFeeIx(creator.publicKey, WSOL)], [creator]);
await send("q3 claim_platform_fee_from_vault (fee wallet)", [L.claimPlatformFeeFromVaultIx(feeWallet.publicKey, platformConfig, WSOL)], [feeWallet]);
await send("q3 claim_platform_fee (pool-level, fee wallet)", [L.claimPlatformFeeIx(feeWallet.publicKey, k)], [feeWallet], { expectFail: true });
await send("q3 claim_creator_fee by NON-creator (trader) must fail", [L.claimCreatorFeeIx(trader.publicKey, WSOL)], [trader], { expectFail: true });
const after = await snapshot("after claims");
saveState({ q3Balances: { before, after } });
