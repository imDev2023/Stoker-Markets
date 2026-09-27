// Q3b: what initialize_with_token_2022 offers. Launch a Token-2022 base mint with a 1% transfer fee on our platform,
// trade it, and record the resulting mint extensions and authorities.
import { Keypair, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddressSync, TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import BN from "bn.js";
import { conn, key, send, saveState, loadState, logEvidence, tokenBal, WSOL } from "./common";
import * as L from "./launchlab";

const creator = key("creator"), trader = key("trader");
const st = loadState();
const platformConfig = new PublicKey(st.platformConfig);
const GLOBAL_SOL = new PublicKey("7ZR4zD7PYfY2XxoG1Gxcy2EgEeGYrpxrwzPuwdUBssEt");
if (!st.poolT22) {
  const mint = Keypair.generate();
  const launch: L.Launch = {
    globalConfig: GLOBAL_SOL, platformConfig, quoteMint: WSOL,
    supply: new BN("1000000000000000"), totalBaseSell: new BN("793100000000000"), totalQuoteFundRaising: new BN(5 * LAMPORTS_PER_SOL),
    ammFeeOn: "QuoteToken", name: "Spike T22", symbol: "SPKT", uri: "https://example.invalid/spkt.json",
  };
  const sig = await send("q3b initialize_with_token_2022 (1% transfer fee)", [L.initializeToken2022Ix(creator.publicKey, creator.publicKey, mint.publicKey, launch, { bps: 100, max: new BN("1000000000000000") })], [creator, mint], { cu: 600_000 });
  saveState({ poolT22: { pool: L.poolPda(mint.publicKey, WSOL).toBase58(), baseMint: mint.publicKey.toBase58(), initSig: sig } });
}
const t = loadState().poolT22;
const k: L.PoolKeys = { pool: new PublicKey(t.pool), baseMint: new PublicKey(t.baseMint), quoteMint: WSOL, globalConfig: GLOBAL_SOL, platformConfig, creator: creator.publicKey, baseProgram: TOKEN_2022_PROGRAM_ID };
await send("q3b trader wraps 0.02 SOL", L.wrapSolIxs(trader.publicKey, 0.02 * LAMPORTS_PER_SOL), [trader]);
const buy = await send("q3b trader buy 0.01 SOL of the Token-2022 coin", L.tradeIx("buy", trader.publicKey, k, new BN(0.01 * LAMPORTS_PER_SOL)), [trader]);
const got = await tokenBal(getAssociatedTokenAddressSync(k.baseMint, trader.publicKey, false, TOKEN_2022_PROGRAM_ID));
const ev = (await L.events(buy)).find((e) => e.name === "TradeEvent");
console.log("curve amount_out", ev?.amount_out, "trader received", got.toString(), "(difference = 1% transfer fee withheld)");
const sell = await send("q3b trader sells half back", L.tradeIx("sell", trader.publicKey, k, new BN((got / 2n).toString())), [trader]);
const mintInfo: any = (await conn.getParsedAccountInfo(k.baseMint)).value?.data;
const exts = mintInfo.parsed.info.extensions;
console.log(JSON.stringify({ mintAuthority: mintInfo.parsed.info.mintAuthority, freezeAuthority: mintInfo.parsed.info.freezeAuthority, extensions: exts }, null, 1));
logEvidence("q3b token2022 mint", { mint: k.baseMint, amount_out: ev?.amount_out, received: got.toString(), extensions: exts, mintAuthority: mintInfo.parsed.info.mintAuthority });
saveState({ poolT22: { ...t, extensions: exts, curveAmountOut: ev?.amount_out, traderReceived: got.toString(), buySig: buy, sellSig: sell } });
