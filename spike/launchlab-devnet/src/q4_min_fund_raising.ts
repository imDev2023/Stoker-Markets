// Q4 probe: the smallest total_quote_fund_raising the devnet SOL GlobalConfig accepts, and whether such a pool migrates.
// Launches with 0 (expected to fail), 1 lamport, and 0.001 SOL; completes the 1-lamport pool; on localnet also migrates it.
import { Keypair, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import BN from "bn.js";
import { CLUSTER, key, send, makeLookupTable, loadState, saveState, WSOL } from "./common";
import * as L from "./launchlab";
import * as C from "./cpmm";

const creator = key("creator"), trader = key("trader"), admin = key("admin"), feeWallet = key("feewallet");
const st = loadState();
const platformConfig = new PublicKey(st.platformConfig), cpswapConfig = new PublicKey(st.cpswapConfig);
const GLOBAL_SOL = new PublicKey("7ZR4zD7PYfY2XxoG1Gxcy2EgEeGYrpxrwzPuwdUBssEt");
const launch = (fund: BN): L.Launch => ({ globalConfig: GLOBAL_SOL, platformConfig, quoteMint: WSOL, supply: new BN("1000000000000000"), totalBaseSell: new BN("793100000000000"), totalQuoteFundRaising: fund, ammFeeOn: "QuoteToken", name: "Spike Min", symbol: "SPKM", uri: "https://example.invalid/spkm.json" });
const results: any = {};
// Launch with 0 (rejected) and 1 lamport (accepted, but see below), then walk a ladder of targets until one trades to completion and migrates.
const zero = Keypair.generate();
results.zero = await send("q4 probe: launch with total_quote_fund_raising = 0", [L.initializeV2Ix(creator.publicKey, creator.publicKey, zero.publicKey, launch(new BN(0)))], [creator, zero], { expectFail: true });
await send("q4 probe: trader wraps 0.01 SOL", L.wrapSolIxs(trader.publicKey, 0.01 * LAMPORTS_PER_SOL), [trader]);
results.ladder = [];
for (const target of [1, 1_000, 100_000, 1_000_000]) {
  const mint = Keypair.generate();
  const row: any = { target_lamports: target, mint: mint.publicKey.toBase58() };
  row.launch = await send(`q4 probe: launch with total_quote_fund_raising = ${target} lamports`, [L.initializeV2Ix(creator.publicKey, creator.publicKey, mint.publicKey, launch(new BN(target)))], [creator, mint], { expectFail: true });
  const k: L.PoolKeys = { pool: L.poolPda(mint.publicKey, WSOL), baseMint: mint.publicKey, quoteMint: WSOL, globalConfig: GLOBAL_SOL, platformConfig, creator: creator.publicKey, baseProgram: TOKEN_PROGRAM_ID };
  if (row.launch) row.buy = await send(`q4 probe: buy the ${target}-lamport pool to completion`, L.tradeIx("buy", trader.publicKey, k, new BN(Math.max(target * 2, 10_000))), [trader], { expectFail: true });
  const ps = row.launch ? await L.poolState(k.pool) : null;
  row.status = ps?.status; row.real_quote = ps?.real_quote;
  if (CLUSTER === "localnet" && ps?.status === 1) {
    const nft = Keypair.generate();
    const params = { pool: k.pool, baseMint: mint.publicKey, quoteMint: WSOL, platformConfig, globalConfig: GLOBAL_SOL, cpswapConfig, createPoolFee: new PublicKey("3oE58BKVt8KuYkGxx8zBojugnymWmBiyafWgMrnb6eYy"), nftWallet: feeWallet.publicKey, creator: creator.publicKey, permission: C.cpPermission(L.AUTH), cpCreator: PublicKey.default };
    const lut = await makeLookupTable(admin, [C.migrateToCpswapIx(admin.publicKey, nft, params)]);
    row.migrate = await send(`q4 probe: migrate the ${target}-lamport pool`, [C.migrateToCpswapIx(admin.publicKey, nft, params)], [admin, nft], { cu: 1_000_000, lut, expectFail: true });
    row.status_after = (await L.poolState(k.pool))?.status;
  }
  console.log(JSON.stringify(row));
  results.ladder.push(row);
  if (row.status_after === 2 || (CLUSTER === "devnet" && row.status === 1)) break;
}
saveState({ minFundRaising: results });
