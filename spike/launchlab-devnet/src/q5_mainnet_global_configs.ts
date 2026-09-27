// Q5 (mainnet, read-only via Helius): every LaunchLab GlobalConfig, decoded, with quote-mint metadata (DAS getAssetBatch)
// and the quote mint's token program and Token-2022 extensions (getMultipleAccounts jsonParsed). Writes mainnet_global_configs.json.
import { Connection, PublicKey } from "@solana/web3.js";
import bs58 from "bs58";
import { writeFileSync } from "fs";
import { join } from "path";
import { HELIUS_MAINNET, MAINNET_LAUNCHPAD, launchIdlMain, disc, plain, ROOT } from "./common";
import { BorshCoder } from "@coral-xyz/anchor";

const conn = new Connection(HELIUS_MAINNET, "confirmed");
const coder = new BorshCoder(launchIdlMain);
const accs = await conn.getProgramAccounts(MAINNET_LAUNCHPAD, { filters: [{ memcmp: { offset: 0, bytes: bs58.encode(disc(launchIdlMain, "GlobalConfig")) } }] });
const configs = accs.map((a) => { const d: any = plain(coder.accounts.decode("GlobalConfig", a.account.data)); delete d.padding; delete d.padding_alignment; return { address: a.pubkey.toBase58(), ...d }; });
const mints = [...new Set(configs.map((c: any) => c.quote_mint as string))];

async function das(ids: string[]) {
  const r = await fetch(HELIUS_MAINNET, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getAssetBatch", params: { ids } }) });
  return ((await r.json()) as any).result as any[];
}
const meta: Record<string, any> = {};
for (let i = 0; i < mints.length; i += 500) for (const a of await das(mints.slice(i, i + 500))) if (a) meta[a.id] = a;
const parsed: Record<string, any> = {};
for (let i = 0; i < mints.length; i += 100) {
  const infos = await conn.getMultipleParsedAccounts(mints.slice(i, i + 100).map((m) => new PublicKey(m)));
  infos.value.forEach((v, j) => (parsed[mints[i + j]] = v));
}

const STABLES = new Set(["USDC", "USDT", "USD1", "PYUSD", "USDG", "USDS", "FDUSD", "USDE", "USDY", "EURC", "USDH", "UXD", "USDSTAR", "CASH", "USDU", "AUSD", "USX", "USDB", "USDO", "BUIDL", "SUSD", "USDV"]);
const WSOL = "So11111111111111111111111111111111111111112";
function classify(m: string, sym: string, name: string, info: any): { category: string; issuer?: string } {
  const s = (sym ?? "").trim(), n = (name ?? "").trim();
  if (m === WSOL) return { category: "sol" };
  if (STABLES.has(s.toUpperCase()) || /\bUSD\b|stablecoin|dollar/i.test(n) && /^[A-Z0-9]*USD[A-Z0-9]*$/i.test(s)) return { category: "stablecoin" };
  if (/xstock/i.test(n) || (/x$/.test(s) && /xStock|Backed/i.test(n))) return { category: "tokenized_stock", issuer: "Backed xStocks" };
  if (/prestock/i.test(n) || /pre-?ipo/i.test(n)) return { category: "tokenized_stock", issuer: "PreStocks (pre-IPO)" };
  if (/ondo|global markets/i.test(n) || /on$/.test(s) && /Ondo/i.test(n)) return { category: "tokenized_stock", issuer: "Ondo Global Markets" };
  if (/backpack securities/i.test(n)) return { category: "tokenized_stock", issuer: "Backpack Securities" };
  if (/sunrise/i.test(n)) return { category: "tokenized_stock", issuer: "Sunrise" };
  if (/reinsurance|treasur|bond|yield/i.test(n)) return { category: "rwa_other" };
  if (/^(gold|silver)$/i.test(n) || /silver|gold/i.test(n) && info?.mintAuthority) return { category: "commodity_or_rwa_unverified" };
  if (/\b(stock|equity|shares?|etf|tokenized)\b/i.test(n)) return { category: "tokenized_stock_or_etf_unverified" };
  return { category: "other" };
}

const byMint: Record<string, any> = {};
for (const m of mints) {
  const a = meta[m], p: any = parsed[m];
  const info = p?.data?.parsed?.info;
  const tm = (info?.extensions ?? []).find((e: any) => e.extension === "tokenMetadata")?.state;
  const sym = a?.content?.metadata?.symbol || a?.token_info?.symbol || tm?.symbol, name = a?.content?.metadata?.name || tm?.name;
  const exts = (info?.extensions ?? []).map((e: any) => e.extension);
  const ext = Object.fromEntries((info?.extensions ?? []).map((e: any) => [e.extension, e.state]));
  byMint[m] = {
    symbol: sym, name, ...classify(m, sym, name, info),
    token_program: p?.owner?.toBase58() === "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb" ? "token-2022" : p?.owner?.toBase58() === "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA" ? "spl-token" : p?.owner?.toBase58(),
    decimals: info?.decimals, mint_authority: info?.mintAuthority, freeze_authority: info?.freezeAuthority, extensions: exts,
    risk_flags: [
      ext.transferHook?.programId ? `transferHook:${ext.transferHook.programId}` : null,
      ext.permanentDelegate?.delegate ? `permanentDelegate:${ext.permanentDelegate.delegate}` : null,
      ext.pausableConfig ? `pausable(paused=${ext.pausableConfig.paused},authority=${ext.pausableConfig.authority})` : null,
      ext.defaultAccountState ? `defaultAccountState:${ext.defaultAccountState.accountState}` : null,
      ext.transferFeeConfig ? `transferFee:${ext.transferFeeConfig.newerTransferFee?.transferFeeBasisPoints}bps` : null,
      ext.nonTransferable ? "nonTransferable" : null,
      ext.confidentialTransferMint ? "confidentialTransfer" : null,
      ext.scaledUiAmountConfig ? `scaledUiAmount(multiplier=${ext.scaledUiAmountConfig.multiplier})` : null,
      ext.interestBearingConfig ? "interestBearing" : null,
      info?.freezeAuthority ? `freezeAuthority:${info.freezeAuthority}` : null,
    ].filter(Boolean),
    extension_state: ext,
  };
}
const rows = configs.map((c: any) => ({
  address: c.address, quote_mint: c.quote_mint, quote_symbol: byMint[c.quote_mint].symbol, quote_name: byMint[c.quote_mint].name, category: byMint[c.quote_mint].category,
  curve_type: ["constant_product", "fixed_price", "linear_price"][c.curve_type] ?? c.curve_type, index: c.index,
  trade_fee_rate: c.trade_fee_rate, trade_fee_pct: Number(c.trade_fee_rate) / 1e4, migrate_fee: c.migrate_fee, max_share_fee_rate: c.max_share_fee_rate,
  min_quote_fund_raising: c.min_quote_fund_raising, min_base_supply: c.min_base_supply, min_base_sell_rate: c.min_base_sell_rate, min_base_migrate_rate: c.min_base_migrate_rate, max_lock_rate: c.max_lock_rate,
  protocol_fee_owner: c.protocol_fee_owner, migrate_fee_owner: c.migrate_fee_owner, migrate_to_amm_wallet: c.migrate_to_amm_wallet, migrate_to_cpswap_wallet: c.migrate_to_cpswap_wallet, epoch: c.epoch,
}));
const count = (f: (r: any) => string) => rows.reduce((acc: any, r) => ((acc[f(r)] = (acc[f(r)] ?? 0) + 1), acc), {});
const stockMints = Object.entries(byMint).filter(([, v]: any) => v.category.startsWith("tokenized_stock"));
const summary = {
  snapshot: new Date().toISOString(), program: MAINNET_LAUNCHPAD.toBase58(), global_configs: rows.length, distinct_quote_mints: mints.length,
  configs_by_category: count((r) => r.category), configs_by_curve: count((r) => r.curve_type), configs_by_trade_fee_pct: count((r) => String(r.trade_fee_pct)),
  migrate_fee_nonzero: rows.filter((r) => r.migrate_fee !== "0").length, migrate_to_cpswap_wallets: count((r) => r.migrate_to_cpswap_wallet),
  quote_token_program: count((r) => byMint[r.quote_mint].token_program),
  tokenized_stock_mints: stockMints.length,
  tokenized_stock_by_issuer: stockMints.reduce((acc: any, [, v]: any) => ((acc[v.issuer ?? v.category] = (acc[v.issuer ?? v.category] ?? 0) + 1), acc), {}),
  tokenized_stock_token_program: stockMints.reduce((acc: any, [, v]: any) => ((acc[v.token_program] = (acc[v.token_program] ?? 0) + 1), acc), {}),
  tokenized_stock_extension_sets: stockMints.reduce((acc: any, [, v]: any) => { const k = v.extensions.slice().sort().join(",") || "(none)"; acc[k] = (acc[k] ?? 0) + 1; return acc; }, {}),
  quote_mints_with_risky_extensions: Object.entries(byMint).filter(([, v]: any) => v.risk_flags.some((f: string) => /transferHook|permanentDelegate|pausable|defaultAccountState|transferFee|nonTransferable/.test(f))).length,
};
writeFileSync(join(ROOT, "mainnet_global_configs.json"), JSON.stringify({ summary, global_configs: rows, quote_mints: byMint }, null, 2));
console.log(JSON.stringify(summary, null, 1));
