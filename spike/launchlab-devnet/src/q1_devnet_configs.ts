// Q1: list LaunchLab GlobalConfigs and PlatformConfigs on devnet.
import { PublicKey } from "@solana/web3.js";
import bs58 from "bs58";
import { writeFileSync } from "fs";
import { join } from "path";
import { devnet, DEV, launchCoder, launchIdlDev, disc, plain, ROOT } from "./common";

async function all(account: string) {
  const accs = await devnet.getProgramAccounts(DEV.LAUNCHPAD, {
    filters: [{ memcmp: { offset: 0, bytes: bs58.encode(disc(launchIdlDev, account)) } }],
  });
  return accs.map((a) => ({ address: a.pubkey.toBase58(), ...plain(launchCoder.accounts.decode(account, a.account.data)) }));
}

const globals = await all("GlobalConfig");
const mints = [...new Set(globals.map((g: any) => g.quote_mint))];
const mintInfo: Record<string, any> = {};
for (const m of mints) {
  const info = await devnet.getParsedAccountInfo(new PublicKey(m));
  const d: any = info.value?.data;
  mintInfo[m] = { owner: info.value?.owner.toBase58(), decimals: d?.parsed?.info?.decimals, mintAuthority: d?.parsed?.info?.mintAuthority, extensions: d?.parsed?.info?.extensions?.map((e: any) => e.extension) };
}
for (const g of globals as any[]) g.quote_mint_info = mintInfo[g.quote_mint];
const platforms = await all("PlatformConfig");
for (const p of platforms as any[]) for (const f of ["name", "web", "img"]) p[f] = undefined;
const pools = await devnet.getProgramAccounts(DEV.LAUNCHPAD, { dataSlice: { offset: 0, length: 0 }, filters: [{ memcmp: { offset: 0, bytes: bs58.encode(disc(launchIdlDev, "PoolState")) } }] });

writeFileSync(join(ROOT, "out/devnet_global_configs.json"), JSON.stringify({ globals, platformCount: platforms.length, poolCount: pools.length }, null, 2));
console.log("GlobalConfigs:", globals.length, "PlatformConfigs:", platforms.length, "Pools:", pools.length);
for (const g of globals as any[])
  console.log(g.address, "quote", g.quote_mint, JSON.stringify(g.quote_mint_info), "curve", g.curve_type, "idx", g.index, "trade", g.trade_fee_rate, "migFee", g.migrate_fee, "minFund", g.min_quote_fund_raising, "minSupply", g.min_base_supply, "minSell", g.min_base_sell_rate, "minMig", g.min_base_migrate_rate, "maxLock", g.max_lock_rate, "maxShare", g.max_share_fee_rate, "cpswapWallet", g.migrate_to_cpswap_wallet, "ammWallet", g.migrate_to_amm_wallet, "protoOwner", g.protocol_fee_owner, "migFeeOwner", g.migrate_fee_owner);
