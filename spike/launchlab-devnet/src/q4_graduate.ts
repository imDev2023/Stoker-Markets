// Q4: buy pool A to completion, get it migrated to CPMM (Raydium's crank on devnet; ourselves on the localnet fork,
// where the GlobalConfig copy names our admin as migrate wallet), then trade on CPMM and prove the creator fee keeps
// accruing and is claimable, and that the platform's Fee Key NFT can collect the locked-LP fee.
import { Keypair, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddressSync, NATIVE_MINT, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import BN from "bn.js";
import { CLUSTER, conn, key, send, makeLookupTable, saveState, loadState, logEvidence, tokenBal, WSOL, DEV } from "./common";
import * as L from "./launchlab";
import * as C from "./cpmm";

const admin = key("admin"), creator = key("creator"), trader = key("trader"), feeWallet = key("feewallet");
const st = loadState();
const platformConfig = new PublicKey(st.platformConfig), cpswapConfig = new PublicKey(st.cpswapConfig);
const GLOBAL_SOL = new PublicKey("7ZR4zD7PYfY2XxoG1Gxcy2EgEeGYrpxrwzPuwdUBssEt");
const a = st.poolA;
const k: L.PoolKeys = { pool: new PublicKey(a.pool), baseMint: new PublicKey(a.baseMint), quoteMint: WSOL, globalConfig: GLOBAL_SOL, platformConfig, creator: creator.publicKey, baseProgram: TOKEN_PROGRAM_ID };
const cpPool = C.cpPoolPda(cpswapConfig, k.baseMint, WSOL);
const sol = (x: bigint | string) => (Number(x) / LAMPORTS_PER_SOL).toFixed(9);
const bal = async (mint: PublicKey, owner: PublicKey) => (await tokenBal(getAssociatedTokenAddressSync(mint, owner))).toString();

// 1. Buy to completion.
let ps = await L.poolState(k.pool);
if (ps.status === 0) {
  const remaining = BigInt(ps.total_quote_fund_raising) - BigInt(ps.real_quote);
  const amountIn = (remaining * 10000n) / 9825n + 100_000n; // gross up for 0.25% + 1% + 0.5% fees, plus a margin
  console.log("fund raising", sol(ps.total_quote_fund_raising), "raised", sol(ps.real_quote), "buying with", sol(amountIn));
  await send("q4 trader wraps SOL for the final buy", L.wrapSolIxs(trader.publicKey, Number(amountIn)), [trader]);
  const wsolBefore = await bal(NATIVE_MINT, trader.publicKey);
  const sig = await send("q4 trader buys to completion", L.tradeIx("buy", trader.publicKey, k, new BN(amountIn.toString())), [trader]);
  const ev = (await L.events(sig)).find((e) => e.name === "TradeEvent");
  console.log("   TradeEvent", JSON.stringify({ amount_in: ev.amount_in, amount_out: ev.amount_out, pool_status: ev.pool_status, creator_fee: ev.creator_fee, platform_fee: ev.platform_fee }), "wsol spent", sol(BigInt(wsolBefore) - BigInt(await bal(NATIVE_MINT, trader.publicKey))));
  ps = await L.poolState(k.pool);
  logEvidence("q4 final buy", { sig, ev, statusAfter: ps.status, realQuote: ps.real_quote });
}
console.log("pool status", ps.status, "(0 funding, 1 waiting for migration, 2 migrated)");

// 2. Migration.
if (ps.status === 1 && CLUSTER === "localnet") {
  const nftMint = Keypair.generate();
  const params = {
    pool: k.pool, baseMint: k.baseMint, quoteMint: WSOL, platformConfig, globalConfig: GLOBAL_SOL, cpswapConfig,
    createPoolFee: new PublicKey("3oE58BKVt8KuYkGxx8zBojugnymWmBiyafWgMrnb6eYy"), nftWallet: feeWallet.publicKey, creator: creator.publicKey,
    permission: new PublicKey("7BCZCNvf2TnXavEAtrf7JRAZyLGJ3mJsqQhyLkuqC1Tb"), cpCreator: PublicKey.default,
  };
  console.log("permission PDA check: permission(launchlab authority) =", C.cpPermission(L.AUTH).toBase58());
  const lut = await makeLookupTable(admin, [C.migrateToCpswapIx(admin.publicKey, nftMint, params)]);
  await send("q4 migrate_to_cpswap signed by a non-migrate wallet (trader) must fail", [C.migrateToCpswapIx(trader.publicKey, nftMint, params)], [trader, nftMint], { expectFail: true, cu: 1_000_000, lut });
  const sig = await send("q4 migrate_to_cpswap signed by the GlobalConfig migrate wallet", [C.migrateToCpswapIx(admin.publicKey, nftMint, params)], [admin, nftMint], { cu: 1_000_000, lut });
  saveState({ migration: { sig, signer: admin.publicKey.toBase58(), feeNftMint: nftMint.publicKey.toBase58(), cpPool: cpPool.toBase58() } });
} else if (ps.status === 1) {
  console.log("waiting for Raydium's devnet crank to migrate (polling every 15 s, up to 20 min)");
  const t0 = Date.now();
  while (ps.status !== 2 && Date.now() - t0 < 20 * 60_000) { await new Promise((r) => setTimeout(r, 15_000)); ps = await L.poolState(k.pool); }
  if (ps.status !== 2) throw new Error("not migrated within 20 minutes");
}
if (!loadState().migration) {
  const sigs = await conn.getSignaturesForAddress(cpPool, { limit: 50 });
  const first = sigs[sigs.length - 1];
  const tx = await conn.getTransaction(first.signature, { maxSupportedTransactionVersion: 0 });
  const signers = tx!.transaction.message.staticAccountKeys.slice(0, tx!.transaction.message.header.numRequiredSignatures).map((x) => x.toBase58());
  saveState({ migration: { sig: first.signature, signer: signers[0], feeNftMint: signers[1], cpPool: cpPool.toBase58(), waitedMs: null } });
}
const mig = loadState().migration;
console.log("migrated by", mig.signer, "tx", mig.sig, "fee NFT mint", mig.feeNftMint);

// 3. Post-migration state.
let pool = await C.cpPoolInfo(cpPool);
console.log("CPMM pool", cpPool.toBase58(), JSON.stringify({ poolCreator: pool.poolCreator, configId: pool.configId, mintA: pool.mintA, mintB: pool.mintB, enableCreatorFee: pool.enableCreatorFee, feeOn: pool.feeOn, creatorFeesMintA: pool.creatorFeesMintA, creatorFeesMintB: pool.creatorFeesMintB }));
const nftMint = new PublicKey(mig.feeNftMint);
console.log("locked LP state", JSON.stringify(await C.lockedState(nftMint)), "fee NFT balance of fee wallet", await bal(nftMint, feeWallet.publicKey));
const mintAIsSol = pool.mintA === WSOL.toBase58();
logEvidence("q4 cpmm pool after migration", { cpPool, pool, locked: await C.lockedState(nftMint) });

// 4. Trade on CPMM (the migrated pool only accepts swaps from its open_time).
for (;;) {
  const now = (await conn.getBlockTime(await conn.getSlot("confirmed"))) ?? 0;
  if (now > Number(pool.openTime)) break;
  console.log(`CPMM pool opens in ${Number(pool.openTime) - now + 1} s, waiting`);
  await new Promise((r) => setTimeout(r, 2000));
}
await send("q4 trader wraps 0.05 SOL for CPMM swaps", L.wrapSolIxs(trader.publicKey, 0.05 * LAMPORTS_PER_SOL), [trader]);
await send("q4 CPMM swap: trader buys with 0.04 WSOL", C.swapIxs(trader.publicKey, pool, cpPool, WSOL, new BN(0.04 * LAMPORTS_PER_SOL)), [trader]);
const baseHeld = BigInt(await bal(k.baseMint, trader.publicKey));
await send("q4 CPMM swap: trader sells a quarter of its tokens", C.swapIxs(trader.publicKey, pool, cpPool, k.baseMint, new BN((baseHeld / 4n).toString())), [trader]);
pool = await C.cpPoolInfo(cpPool);
const accrued = { creatorFeesMintA: pool.creatorFeesMintA, creatorFeesMintB: pool.creatorFeesMintB, quoteIs: mintAIsSol ? "A" : "B" };
console.log("creator fee accrued in CPMM pool", JSON.stringify(accrued));

// 5. Creator claims CPMM creator fee.
const cBefore = { wsol: await bal(WSOL, creator.publicKey), base: await bal(k.baseMint, creator.publicKey) };
await send("q4 CPMM collect_creator_fee by a NON-creator (trader) must fail", C.collectCreatorFeeIxs(trader.publicKey, pool, cpPool), [trader], { expectFail: true });
await send("q4 CPMM collect_creator_fee (token creator)", C.collectCreatorFeeIxs(creator.publicKey, pool, cpPool), [creator]);
const cAfter = { wsol: await bal(WSOL, creator.publicKey), base: await bal(k.baseMint, creator.publicKey) };
console.log("creator balances before", JSON.stringify(cBefore), "after", JSON.stringify(cAfter));

// 6. Platform collects the locked-LP fee with its Fee Key NFT.
const lockedBefore = await C.lockedState(nftMint);
const fBefore = { wsol: await bal(WSOL, feeWallet.publicKey), base: await bal(k.baseMint, feeWallet.publicKey) };
await send("q4 locker collect_cp_fees by a wallet WITHOUT the Fee Key NFT (trader) must fail", C.collectLockedLpFeeIxs(trader.publicKey, pool, cpPool, nftMint, new BN("18446744073709551615")), [trader], { expectFail: true });
await send("q4 locker collect_cp_fees (fee wallet holds the Fee Key NFT)", C.collectLockedLpFeeIxs(feeWallet.publicKey, pool, cpPool, nftMint, new BN("18446744073709551615")), [feeWallet]);
const fAfter = { wsol: await bal(WSOL, feeWallet.publicKey), base: await bal(k.baseMint, feeWallet.publicKey) };
console.log("fee wallet before", JSON.stringify(fBefore), "after", JSON.stringify(fAfter));
console.log("locked LP before", JSON.stringify(lockedBefore), "after", JSON.stringify(await C.lockedState(nftMint)));
saveState({ q4: { cpPool: cpPool.toBase58(), accrued, creatorBefore: cBefore, creatorAfter: cAfter, feeWalletBefore: fBefore, feeWalletAfter: fAfter, lockedBefore, lockedAfter: await C.lockedState(nftMint) } });
