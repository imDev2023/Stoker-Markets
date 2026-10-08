# StonkFun on-chain research

Snapshot taken 2026-09-26 between about 19:00 and 19:25 UTC (Solana slot about 450,763,586).
Sources: DexScreener public API, GeckoTerminal public API, Helius RPC (getTransactionsForAddress, getProgramAccounts, getTransaction, DAS), `solana program show/dump`, `anchor idl fetch`, OtterSec verify API, GitHub API.
stonkfun.xyz itself was not accessed.
Every claim below points at a file in `raw/` or `programs/`, or at a transaction signature whose full JSON is saved in `raw/tx/`.
Anything marked **(inferred)** is a reading of the data, not something stated on-chain.

## TL;DR

- StonkFun has **no custom on-chain program**.
All launches run through third-party programs, mainly **Raydium LaunchLab** (`LanMV9sAd7wArD4vJFi2qDdfnVhFxYSUg6eADduJ3uj`, IDL name `raydium_launchpad`), graduating to **Raydium CPMM** (`CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C`) with LP locked by **Raydium Liquidity Locking** (`LockrWmn6K5twhz3y9w1dQERbmgSaRkfnTeTKbpofwE`).
- StonkFun's on-chain footprint is configuration plus wallets: two LaunchLab `PlatformConfig` accounts named "StonkFun" (standard `4E876qZTE9FJMrBzgVtBrSrzz2TLivB5Y5QXPjB4gZL7`, reward `6BwHHDg3u1854jC8PDLXvR4spTcLNaoBxLJNGC4nTESt`), 568 `PlatformCurveRule` accounts per config, and one fee wallet `5CEbueQnq1Ym2uSSx2xXds3jQAqT1BDnkA59RZobSPAG`.
- Earlier launch paths (July to August 2026) used Raydium CLMM plus the Raydium locker (Fee Key NFTs split between platform and creator), and pump.fun with the StonkFun wallet as on-chain coin creator.
- $STONK (`6GmAFSYs4gk3FDao5FzzySQpPZaWsa4rUJHacpMpUNgx`) is a plain SPL token launched through that early CLMM path on 2026-07-23, paired against SPYx (xStocks S&P 500).
- LaunchLab fee model: 0.25% to Raydium plus **1.00% to StonkFun** on every bonding-curve trade, 0% creator fee on the curve. The same split as ours since ADR 0009 (#85, 2026-10-08); the difference is that our creator share is on a public Ledger.
After graduation StonkFun owns 100% of the locked CPMM LP fee rights and also collects the **1% CPMM creator fee**.
- StonkFun converts fees into $STONK through Jupiter and burns it; 13 burns totalling 35,537.7 STONK happened in one 37-minute window, and total supply is down 18.35% from 1B.
- Launch count on LaunchLab: **131,734 pools** (32,802 standard + 98,932 reward), **3,126 graduated**, first launch 2026-08-28 20:07:57 UTC, still launching at snapshot time.

## 1. Market data ($STONK)

Raw: `raw/dex_pair_lower.json`, `raw/dex_token_pairs.json`, `raw/dex_tokens_v1.json`, `raw/gecko_pool_*.json`, `raw/gecko_ohlcv_day_*.json`, `raw/gecko_token_STONK.json`.

The DexScreener URL path `zxtpi4btawx3mgdapoezkmd1hxx8cdecfrqxmwvsclx` resolves (the pairs endpoint accepts the lowercase string) to pair `zxTpi4BtaWX3mgdAPoezkMD1hxx8CdeCfrqXMWvSCLX`.

| Field | Value |
|---|---|
| Token mint | `6GmAFSYs4gk3FDao5FzzySQpPZaWsa4rUJHacpMpUNgx` |
| Name / symbol | STONK / STONK |
| DEX / pool type | Meteora DLMM (`LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo`), STONK/SOL |
| Price | $0.2881 (0.002377 SOL) |
| Liquidity | $3.18M |
| FDV = market cap | $288.2M (GeckoTerminal a few minutes later: $231.6M) |
| Volume 24h | $15.02M |
| Txns 24h | 14,528 buys / 15,536 sells |
| pairCreatedAt | 1786531900000 = 2026-08-12 10:51:40 UTC |
| Website | https://www.stonkfun.xyz/ |
| Socials | X https://x.com/LaunchOnSF, Telegram https://t.me/StonkFunXyz |

DexScreener lists 30 pairs for the token (`raw/dex_token_pairs.json`).
The oldest and deepest is the Raydium CLMM STONK/SPYx pool `7a8xxAJBELDo6P9dikSYctdw6ce8F4mWr3ahcAD8Ao49` ($4.47M liquidity, created 2026-07-23 19:07 UTC).
Other large pools: Orca Whirlpool STONK/SOL `AfrddTGYwCVEQB1gxCAhR8i48o6qtxYqksdVkeLudEhg` ($2.86M), Raydium CLMM STONK/USDC `G4G5SzkbLFMhoSgHiQNeyJFt75sSDsL1rD8LVyT5xZbU` ($1.51M), Meteora DLMM STONK/SOL `48M3tRdbVYmEbf5rCTFVAgqCCaZdChVmeg3VPBrmgT8m` ($1.21M).
There are also small Meteora DAMM v2 ("DYN2") pools against VCF, Circuit, tradebot and SOL.

Chart shape (GeckoTerminal daily OHLCV, USD):
The SPYx CLMM pool opened 2026-07-23 near $0.0009, fell to about $0.0004 within a day, and printed a wick low of $0.0000104 on 2026-08-01.
It then climbed through August ($0.006 on 08-05, $0.0135 on 08-10, $0.02 by 08-30).
A breakout came 2026-09-05 to 09-11 (about 10x, from $0.023 to a DLMM intraday high of $0.53 on 09-11).
Price then settled in a $0.17 to $0.35 range, closing $0.34 on 09-24 and trading about $0.28 at snapshot.
Summed daily volume: $167M on the SPYx CLMM pool (63 daily candles), $501M on the SOL DLMM pool (28 daily candles; GeckoTerminal omits some days).

Other StonkFun-branded tokens found through DexScreener search (`raw/dex_search_*.json`) and DAS metadata (`raw/das_candidates.json`):
DexFun/DEX `FFT4bgyrvzyB5TKAziLkAzBj8mboduzJeDdZ27TU4FHm`, pemp/PEMPFUN `HHpAFYxBDBg1GZ2mMmEZZHQ5uTuMd75AJpHhHwxh1u6u`, CAUSA `GD1NHJD9wfuNje6RhVrGnCGjajnT5XdmSSpmnSZUyfw9`, STONK MINER `DZ2RujvT1FTQvi2fbw5zwDcWAKXxZm2Ggp4ugB1aEwnt`, StonkHouse `HVVAKKU6QBq5WjaDhwXmxdBshH7w9d5nXcsuzV1KC6x7`, stonkerage.fun `5Tg69VASHq7HYet48q5wQYdj3dP6wTsWNey9Dak6JUEU` (all Token-2022 with update authority `WLHv2UAZm6z4KyaaELi5pjdbJh6RESMva1Rnn8pJVVh`, the LaunchLab authority PDA), and STONKS `DC6HP2A7SUy49WeazfeWgbwxVpzKdEPuB46mtb7XBzWx` (SPL, update authority is the StonkFun wallet).
Default metadata description for launches is "<NAME> was launched on StonkFun."

## 2. $STONK token and its launch

Raw: `raw/das_getAsset_STONK.json`, `raw/rpc_mint_account_STONK.json`, `raw/tx/STONK_launch_sequence_full.json`, `raw/tx/STONK_mint_create_*.json`.

| Property | Value |
|---|---|
| Token program | SPL Token `TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA` (no extensions) |
| Decimals | 9 |
| Minted | 1,000,000,000 |
| Current supply | 816,536,711.36 (183.46M burned) |
| Mint authority | none (revoked in the create tx) |
| Freeze authority | none |
| Metaplex metadata | PDA `6nravufQrcyTLoC4SFNNHKXafdoojeSPtnUVHX5zP6i3`, update authority `5CEbueQnq1Ym2uSSx2xXds3jQAqT1BDnkA59RZobSPAG`, DAS reports `mutable: false` |
| Metadata URI | `https://gateway.irys.xyz/7HzAyVbL19x2RsKPwFD2NdESBDS1ZhawFojcVLvsFr5N`, description "STONK was launched on StonkFun." |

Launch sequence, 2026-07-23 (all signed by the StonkFun wallet `5CEbue...` unless noted):

1. `32RqsTNLvmmr8s6ADP6fiEMYUBK3Q7UfnSsrom8wuEkQqry9rRVpiFuS7CAmy9nZA2GjUyhPLzcdPg6S94WSeDcq` (19:06:36): user `H6qoWz4hxRb9a65nMXv1ERZWHmbG3foFZoK6CEm7acRQ` pays 0.3416503 SOL to `5CEbue...` with a 32-hex Memo (order id).
2. `k72jxjX7CEgk21nZHZVEq3zcBoeQ7sFDQ4XjzTLTPQieUtUJgJJnbypUUvkBQk4iLjhiXTXxap8d8nyAHUAjdRD` (19:06:56): create mint, Metaplex `CreateMetadataAccountV3`, mint 1B to `5CEbue...`, revoke mint authority.
3. `53fuZDbCi3E1KUTnJWjTZgJaRaa47bfXCC5KeHjq7yzDKDeV6dH9mc9zcUxw9uJzMawD2x9xWB73eg5uKv9eTT4K`: Raydium CLMM `CreatePool` STONK/SPYx, pool `7a8xxAJBELDo6P9dikSYctdw6ce8F4mWr3ahcAD8Ao49`, AmmConfig `A1BBtTYJd4i3xU8D6Tc2FzU6ZN4oXZWXKZnCxwbHXr8x`.
4. `5ZuhX28eUuieioRXMwHHrwwd785Mm5Dsfj4oiQYnbFFdfyWLxVbVqvRf8T8iTPjB77zVLY4SyaUmB8YgQ4C2viWu` and `4pJDwgbYJLSKPhQFQAoWEjYYncvYSqykLJXfDmpowbYDc4xFMqk87jkE1gLh3L8MGk82rZ4H62kauqLKE6pF4cjc`: two `OpenPositionV2` single-sided positions of 500M STONK each.
5. `EsDgHD9YUWj1JwKC8cddKCcutCkBJ731kz9jBDTLnqJfenHz6bkHmCtdrQEncVQq1EuwreY5QSyYKTrymDrEmYt`: Raydium locker `LockClmmPosition`, Fee Key NFT `FSkzdjUBebjDVmqqStunRBkeE6Sn3dpxtgCyass15Hf4` to `5CEbue...` (platform).
6. `5X5v1ybgSYtVfJqAn6CJ9LkRkUwqmwNzQ2CS71spcLN9WKifoDykqWoNjs3T65tJceasqYDvwfbomFtQUAcbeE8P`: `LockClmmPosition`, Fee Key NFT `FMXRLJd86YhBXL2prsNMWhdR3L9PDtnsYhWbmbHvv7Ge` to the paying user `H6qoWz...` (creator).
7. `4FtcLoaKtgV3aWxR65irnDebEUoy7DUGP3BuhDeyyt3LHnJPBomA5v6BgHPck9UAfoGhGRJoZZJKjo83kA1TWeNm` (19:07:17): first buy, by `H6qoWz...` through Jupiter.

The locked position NFTs sit with the locker authority `kN1kEznaF5Xbd8LYuqtEFcxzWSBk5Fv6ygX6SqEGJVy`, so the liquidity cannot be withdrawn.
The same two-position, two-Fee-Key pattern repeats for every CLMM launch in `raw/gtfa_5CEbue_asc_full_100.json` (one Fee Key to the platform, one to the creator).
**(inferred)** CLMM-path LP fees were split 50/50 between StonkFun and the creator.

## 3. Launch paths and every program involved

### 3.1 Current path: Raydium LaunchLab (from 2026-08-28)

Example launch: CAUSA, tx `4KHdjaY1kFhgaabp3WWsg7aJGV4M5T95dSqwzGJ7FnsHDhbGyPMsAiQsENAJQqsQ5gjaZBjBBqxsaWKHZRPxR3pc` (2026-09-10 20:14 UTC), instruction `InitializeWithToken2022` then `BuyExactIn`.
Decoded `PoolCreateEvent`: Constant curve, supply 1,000,000,000 (6 decimals), `total_base_sell` 793,100,000, `total_quote_fund_raising` 40,772.38 STONK, `migrate_type` 1 (CPMM), no vesting, `amm_fee_on` QuoteToken.

Account roles in that transaction (IDL order):

| Role | Account |
|---|---|
| payer / creator | `4fFVTesEyaixf5tLWiAwSjPwuwpXehrxBcunrxXZTcWF` |
| global_config (quote = STONK) | `4Rb2joMnuDt9zRPuTYxUjQRGQ8oNBbKdXnCJSCojvBsW` |
| platform_config (StonkFun standard) | `4E876qZTE9FJMrBzgVtBrSrzz2TLivB5Y5QXPjB4gZL7` |
| authority PDA (vaults, metadata update authority) | `WLHv2UAZm6z4KyaaELi5pjdbJh6RESMva1Rnn8pJVVh` |
| pool_state | `FPv3ZJZ343SHPEijhii2aWKZNT52Gmobjuuyf5uiheXq` |
| base_mint / quote_mint | `GD1NHJD9wfuNje6RhVrGnCGjajnT5XdmSSpmnSZUyfw9` / `6GmAFSYs4gk3FDao5FzzySQpPZaWsa4rUJHacpMpUNgx` |
| event_authority | `2DPAtwB8L12vrMRExbLuyGnC7n2J5LNoZQSejeQGpwkr` |
| platform curve rule (remaining account) | `FXxyuToWauhJwa7Q22oAZKV1my1js9ojoJeq3EWw3hR5` |

Migration: tx `gTzQuQUJpvtxdgXpZEviaUy592BKZnPbok11njiZX1NcvPXBUMUpPkMY5zWF4ppR5X6LvxpKSVZgBzfH9Kh5XGG` (2026-09-10 20:42 UTC) is signed by Raydium's migrate wallet `RAYpQbFNq9i3mu6cKpTKKRwwHFDeK5AuZz8xvxUrCgw`.
It calls `MigrateToCpswap`, which CPIs Raydium CPMM `InitializeWithPermission` (pool `2cs3n6VpJ5gztHL9XPKseDi7V4YLJ9N3YV7AVVsLBuzS`, AmmConfig `CRRS5ieQmBrZjWhcj99JuGrT5tyuWDaGAXLXLFjbAtjQ`) and then Raydium locker `LockCpLiquidity`.
206,900,000 CAUSA plus 40,772.38 STONK went into the CPMM pool, and the LP Fee Key NFT `HxgUYSgA69VvKJA8rSGZLYQct9LwrK8cdHYZNmMGBLbR` went to `5CEbue...`.
The 0.15 SOL CPMM pool-creation fee (to `DNXgeM9EiiaAbaWvwjHj9fQQLAX5ZsfHyvmYUNRAdNC8`) was paid by Raydium's wallet, not by StonkFun or the creator.

Global configs are per quote mint and are created by Raydium's admin `RayUzntHM1dWZJyCnkQjHusUGhYyi6gpNf7t8srtty2`, for example STONK `4Rb2jo...` (tx `5TBBR66pr1F1FvNJuQ8LHMsXDbEJfHAgyWog7BfGG9hhwradsNBdCFrQAWhoXH6V7sgnYW27xAXXuBEWtfxjfEw2`, 2026-08-28) and SPYx `B7ctMMdGvy46Am56myTtzfkNzt9kWZVTNGM2BWrJ9adg` (tx `5bc2nBkMJ5EEmhWZjd5M1p4YGU8WV28jeaeJW2xQXJbZpTBPB6Cv7kLuS3mQmd8eztoJZMzQcN1eUkiAH7gKCrG4`, 2026-08-24).
StonkFun pools use 503 distinct quote mints (`raw/stonkfun_quote_mints_top20.json`); the top ones are SOL, STONK, ZEC, NVDAx, SPCXx, xSOL, SPYx, Anthropic and OpenAI PreStocks, WBTC and PUMP.

### 3.2 Earlier path: Raydium CLMM plus locker (July to August 2026)

Described in section 2.
Programs: Raydium CLMM `CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK` (`CreatePool`, later also `CreateCustomizablePool`, `OpenPositionV2`) and Raydium locker `LockrWmn...` (`LockClmmPosition`, `CollectClmmFeesAndRewards`).
The StonkFun wallet signs every step; users pay SOL plus a Memo order id first, and some later payments also invoke Lighthouse `L2TExMFKdjpN9kozasaurPirfHy9P8sbXoAN1qA3S95` (wallet-side transaction guard).

### 3.3 Earlier path: pump.fun

Example: tx `2hNwywrSMPhggpzj44NiLbxkvTqRY2Hnus2TWRzUAT9Z5Ac3j1aKzGtR1KhW7kNqM5DHjAxoHkhPJytycewgdW75` (2026-07-25), pump.fun `CreateV2` plus `Buy`, signed by `5CEbue...` as coin creator, mint `579ESdKpmvP1MLUE2Bf28H13nz1QimokoEufjpDUX87H` ("test", description "test was launched on StonkFun.").
Later the wallet runs pump.fun `CollectCoinCreatorFee`, PumpSwap `CollectCreatorFee` and pump.fun `DistributeCreatorFees` (`raw/wallet_pages/5CEbue_asc_2026-07-2*.json.gz`).
**(inferred)** On this path StonkFun is the on-chain creator and receives pump.fun creator fees, then shares them off-protocol or via pump.fun fee sharing.

### 3.4 Program table ("copy every contract")

Binaries are in `programs/*.so` with SHA-256 in `programs/so_sha256.txt`; `solana program show` output is in `programs/program_show.txt`; OtterSec responses are in `programs/verify/`.

| Program | ID | Role for StonkFun | Upgradeable / authority | Last deploy | On-chain IDL | OtterSec verified | Public source / license |
|---|---|---|---|---|---|---|---|
| Raydium LaunchLab (`raydium_launchpad` v0.2.0) | `LanMV9sAd7wArD4vJFi2qDdfnVhFxYSUg6eADduJ3uj` | Bonding curve, current launch path | Yes, `FytDrVzDybM1TwFQPGb8qaxZR7dBCzNeqT3vtQsceZQK` (a plain system account, not a multisig program) | slot 446221802, 2026-09-11 | Yes, `programs/LanMV9_launchlab_idl.json` | No record | No program source published. IDL at github.com/raydium-io/raydium-idl (commit e7e0c96, no license), CPI crate at github.com/raydium-io/raydium-cpi `programs/launch-cpi` (commit 115df27, no license), client in raydium-sdk-V2 `src/raydium/launchpad/` (commit cc33ec2, GPL-3.0) |
| Raydium CPMM | `CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C` | Graduation AMM | Yes, `FytDrV...` | slot 445763504, 2026-09-10 | No (IDL copied from raydium-idl: `programs/CPMMoo_raydium_cpmm_idl_from_raydium-idl.json`) | No (last registered commit cfdb70a of raydium-cp-swap; stale hash) | github.com/raydium-io/raydium-cp-swap, Apache-2.0, HEAD 59fb845 |
| Raydium CLMM | `CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK` | Early launch AMM, $STONK/SPYx pool | Yes, `FytDrV...` | slot 439846317, 2026-08-17 | No (IDL from raydium-idl in `programs/`) | No (stale record for commit 119ed36) | github.com/raydium-io/raydium-clmm, Apache-2.0, HEAD ed7c84a |
| Raydium Liquidity Locking | `LockrWmn6K5twhz3y9w1dQERbmgSaRkfnTeTKbpofwE` | Locks CLMM positions and CPMM LP, mints Fee Key NFTs | Yes, `FytDrV...` | slot 362025476, 2025-08-23 | Yes, `programs/Lockrw_raydium_lock_idl.json` | No record | No program source published; CPI crate in raydium-cpi `programs/locking-cpi` |
| Meteora DLMM | `LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo` | Main $STONK/SOL pair (third-party LPs) | Yes, `JADaUV8kvDpDbJr55wxXJHVaBS3VCj8thZZHjfeuCVLd` | slot 423977638, 2026-06-03 | Yes, `programs/LBUZKh_meteora_dlmm_idl.json` | No record | Program source not public; SDK at github.com/MeteoraAg/dlmm-sdk |
| Meteora DAMM v2 | `cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG` | Minor $STONK pairs | Yes, `JADaUV...` | slot 445230614, 2026-09-08 | Yes, `programs/cpamdp_meteora_damm_v2_idl.json` | No record | github.com/MeteoraAg/damm-v2, "Meteora Noncommercial Licence", HEAD a85c926 |
| Orca Whirlpool | `whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc` | $STONK/SOL and USDC pairs | Yes, `GwH3Hiv5mACLX3ufTw1pFsrhSPon5tdw252DBs4Rx4PV` | slot 440170207, 2026-08-19 | Yes, `programs/whirLb_orca_whirlpool_idl.json` | No (stale record) | github.com/orca-so/whirlpools, Apache-2.0 until 2025-02-26, custom "Orca License" since, HEAD 408c945 |
| Metaplex Token Metadata | `metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s` | Metadata for SPL launches and Fee Key NFTs | No (authority none) | slot 380725176, 2025-11-17 | n/a | No (registry points at an unrelated repo) | github.com/metaplex-foundation/mpl-token-metadata, Metaplex NFT Open Source License, HEAD 353d01b |
| pump.fun | `6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P` | Early launch path | Yes, `7gZufwwAo17y5kg8FMyJy2phgpvv9RSdzWtdXiWHjFr8` | slot 449734335, 2026-09-23 | Yes, `programs/6EF8rr_pumpfun_idl.json` | No record | Not public; IDLs at github.com/pump-fun/pump-public-docs |
| PumpSwap AMM | `pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA` | Graduated pump.fun path tokens | Yes, `7gZufw...` | slot 446462733, 2026-09-12 | Yes, `programs/pAMMBa_pump_amm_idl.json` | No record | Not public |
| SPL Token / Token-2022 / ATA / System / ComputeBudget / Memo | `TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA`, `TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb`, `ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL`, `11111111111111111111111111111111`, `ComputeBudget111111111111111111111111111111`, `MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr` | Standard | Native or Solana-maintained | n/a | n/a | n/a | github.com/solana-program (Apache-2.0); not dumped |
| Jupiter v6 | `JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4` | Fee conversion to $STONK | not inspected | n/a | n/a | n/a | not dumped |
| Lighthouse | `L2TExMFKdjpN9kozasaurPirfHy9P8sbXoAN1qA3S95` | Wallet-inserted assertions on user payments | No (authority none) | slot 294179293 | n/a | n/a | not dumped |

There is no StonkFun-specific program to dump.
The only StonkFun-controlled on-chain state is the configuration accounts below.
Note that all four Raydium programs share one upgrade authority, a single-signer system account; Raydium can change LaunchLab, CPMM, CLMM and the locker at will.

## 4. StonkFun footprint

### 4.1 Platform configs

Raw: `raw/accounts/PlatformConfig_*.decoded.json` (decoded with the on-chain IDL), creation txs in `raw/tx/platformconfig_early_*.json`.

| Field | Standard `4E876q...` | Reward `6BwHHD...` |
|---|---|---|
| Created | `rNeXpKcdr3fP2xB4Z25nFrBoKrK9MkTJgm2g48WF7ddHvKUjEGHCVhfH6R3545t1kEigKdr3sz9E9t8aEG8Wmtp` 2026-08-28 17:19 UTC | `4ggu6wDgRNrJd7gGcwAoKTEuWFaqJLdYDHmtWptXssjn6kF7DKd8fN4qgfNAbqB1LNrAnA8thooFy9Ex6hyPeYP8` 2026-08-28 17:10 UTC |
| platform_admin (signer of create and update) | `9jpAvNdrtqjSxNj7ZZo6W8bFaRgR8o7y3HtY13pSr3bw` | `D36mv9ZJLaJJPAMXFYbWKbdpcUDDJmjLR51ackTtFw4b` |
| name / web / img | StonkFun / https://www.stonkfun.xyz / stonkfun-logo.png | same |
| fee_rate (platform fee per curve trade, 1e6 denominator) | 10000 = 1.00% | 10000 = 1.00% |
| creator_fee_rate | 0 | 0 |
| platform_fee_wallet / platform_nft_wallet / platform_vesting_wallet / platform_cp_creator | `5CEbue...` for all four | same |
| Migration LP split platform_scale / creator_scale / burn_scale | 1,000,000 / 0 / 0 (100% platform) | same |
| cpswap_config | `CRRS5ieQmBrZjWhcj99JuGrT5tyuWDaGAXLXLFjbAtjQ` | same |
| transfer_fee_extension_auth | `5KXDF6QnqhBj72hDtJNkkpFaQVUfbFXNybMsp3DiK6tD` | same |
| restrict_global_config / restrict_curve_param | 0 / 1 | 0 / 1 |
| curve_rule_manager | `2pMi1Sr8vnAR2GPKMHJsmgFY8Hc4cUVbmG5ARxLsRrvp` | same |

At creation both configs pointed fee, NFT and creator roles at `AvVCE7Ue49iZjYzkkHz6ZhVyvY6NLHw67vB8eQaffVPz` and the transfer-fee authority at `9NY7bJqgbJmK17JUpmz9M43jap69VFKD5vnawqn7HCPC`; later `UpdatePlatformConfig` calls moved them to the current values.

### 4.2 Curve rules

Raw: `raw/accounts/PlatformCurveRule_*.decoded.json`, full sets in `raw/gpa_curve_rules_*.json` (568 per platform config, created by `2pMi1Sr8...` from 2026-09-03 12:07 UTC, e.g. `5fTHrdDujDriKaWoNDxrQkEwZdudUBXpuwDuZ7osLkcy3hiZFZPcCZPHHffwDBF9smjWndAmoaeFXw37XBzS6FGr`).
Field and operator codes come from `LaunchpadCurveRuleField` in raydium-sdk-V2 `src/raydium/launchpad/type.ts` (commit cc33ec2).

- Standard, SPYx rule `QYZp1YzqEHU67ngXphF9LAkxkxWGvpWEv3rXh4yDbWA` and STONK rule `FXxyuToWauhJwa7Q22oAZKV1my1js9ojoJeq3EWw3hR5`: CurveType = Constant, MigrateType = CPMM, MigrateCpmmFeeOn = quote only, Supply = 1e15 raw (1B at 6 decimals), TotalSellA = 793.1M (79.31%), no vesting (locked, cliff, unlock all 0), BaseTokenProgram = Token-2022, TransferFeeEnabled = 0.
- Reward, SPYx rule `7MNLMFMmFVhN9Z3sj51QZso28oD2Ta3zDPwNAmfrs2vk`: the same, plus TransferFeeEnabled = 1, two allowed groups with TransferFeeBasisPoints 100 (1%) or 300 (3%), TransferFeeMaximumFee = 1e15 (uncapped in practice).
- TotalFundRaisingB (the graduation target) is not constrained, so the frontend picks it per launch.

A launch that does not pass the rule fails with LaunchLab error 6018 (missing remaining account) or 6025 (`CurveParamNotMatchPlatformRule`), per `programs/LanMV9_launchlab_idl.json`.

### 4.3 Wallets

Raw: `raw/accounts/wallets_multiple.json`, `raw/wallet_pages/*.json.gz`.

| Wallet | Balance | What it does |
|---|---|---|
| `5CEbueQnq1Ym2uSSx2xXds3jQAqT1BDnkA59RZobSPAG` | 223.2 SOL | Main platform wallet: fee wallet, NFT wallet, CPMM creator, $STONK metadata authority, CLMM and pump.fun launcher, fee claimer, buyback and burn |
| `9jpAvNdrtqjSxNj7ZZo6W8bFaRgR8o7y3HtY13pSr3bw` | 0.02 SOL | Standard platform admin |
| `D36mv9ZJLaJJPAMXFYbWKbdpcUDDJmjLR51ackTtFw4b` | 0.04 SOL | Reward platform admin |
| `2pMi1Sr8vnAR2GPKMHJsmgFY8Hc4cUVbmG5ARxLsRrvp` | 0.64 SOL | Curve rule manager |
| `5KXDF6QnqhBj72hDtJNkkpFaQVUfbFXNybMsp3DiK6tD` | 148.2 SOL | Token-2022 transfer-fee config and withdraw-withheld authority for reward tokens |
| `AvVCE7Ue49iZjYzkkHz6ZhVyvY6NLHw67vB8eQaffVPz` | 0.58 SOL | Original fee wallet; made the first reward launch (`2mdN5s7e3pn85Q8te2ZkEJ81obp6z7Z91o94Cn7MPh6fRB2XQ7NcRH4bCiGqHR7A8xDb8j7nEP887Z4Uek5a4NyU`) |
| `458aGtmE9UzRhA94hz743NyRv8p7zxNbjcgxV1m8Ukre` | 30.5 SOL | Receives most outbound token transfers from `5CEbue...` (333 transfers, many mints) and swaps them on Jupiter; **(inferred)** secondary treasury or payout wallet |
| `HU3bsSLMoJRzREe2qakCgrFpXky6NH2xpa3AfQfh1MaG` | 222.0 SOL | Receives payouts from `5CEbue...`, also collects CLMM Fee Key fees and burns Token-2022 tokens; role unclear |
| `9NERQjLetzquGwdKt3X4gZ8fE8fPfSkj2xo2esmUjWsz` | 112.4 SOL | Receives dust SOL transfers (11 to 3,471 lamports) from `5CEbue...`; purpose unknown |

### 4.4 Launch counts

Method: `getProgramAccounts` on LaunchLab with `dataSize` 429 and `memcmp` of the platform config at `PoolState` offset 173 (`raw/gpa_stonkfun_pools.json.gz`, `raw/gpa_stonkfun_reward_pools.json.gz`), decoded into `raw/stonkfun_launchlab_pools.csv.gz` and `raw/stonkfun_launchlab_pools_reward.csv.gz` by `scripts/pools.py`.

| | Standard | Reward | Total |
|---|---|---|---|
| Pools (launches) | 32,802 | 98,932 | 131,734 |
| Graduated (`status` 2) | 256 | 2,870 | 3,126 |
| Distinct creators | 18,187 | 29,052 | not deduplicated |
| Distinct quote mints | 371 | 486 | 503 |
| First launch | 2026-08-28 20:07:57 UTC, tx `5LigSnvmj2NgwcqrRQah1FsWhUxUagm2inypo1WVQ95Kq115dkX8n2gpvBpH4xPy4vWsFKAMF2sdUbp8sfuvyrgy` (S500 vs SPYx) | 2026-09-03 13:05:43 UTC, tx `2mdN5s7e...` | |
| Latest launch seen | 2026-09-26 18:43 UTC (sample) | 2026-09-26 16:39 UTC (sample) | still active |

StonkFun's own public stats, as passed on by the coordinator, are 139,510 tokens and 3,985 graduated.
**(inferred)** The gap of about 7,776 launches and 859 graduations is the CLMM and pump.fun paths, which this enumeration does not cover.
Every LaunchLab pool has supply 1B and `total_base_sell` 793.1M, and `migrate_type` CPMM.

### 4.5 Sample of 50 LaunchLab tokens

Raw: `raw/stonkfun_token_sample_50.json` (random sample: per mode, 5 graduated SOL, 5 graduated STONK, 3 graduated SPYx, 12 recently active).
Launch time is the first signature on the pool account.

| # | Mode | Mint | Name | Symbol | Quote | Launched (UTC) | Graduated |
|---|---|---|---|---|---|---|---|
| 1 | standard | `5WpdKV43mFmVQgy6KhgqmU1N4xtLE4rAFtnsTf8rApwd` | Zop | ZOP | SOL | 2026-09-24 18:38 | yes |
| 2 | standard | `7xz6t8qyPASohr2EoFLv1TvZdZougw7ZA7emmt3YnxXx` | TRILOGY | TRILOGY | SOL | 2026-09-19 22:28 | yes |
| 3 | standard | `3HWc7MHYVFAn7RJKvBVhyFBziEyE7qVqjhRTWGDw6ZGy` | Monai | MONAI | SOL | 2026-09-24 23:13 | yes |
| 4 | standard | `CmQnBhUCvoZbnyvpqzcCiRWYtibbtjAYXT9dTM3FnhfX` | Hedge | HEDGE | SOL | 2026-09-22 21:52 | yes |
| 5 | standard | `GkBZGFgNy9Q6jHjBuYeTqsvugfEMhniACF9ieV8H3TtC` | BLEE | BLEE | SOL | 2026-09-23 06:46 | yes |
| 6 | standard | `GD1NHJD9wfuNje6RhVrGnCGjajnT5XdmSSpmnSZUyfw9` | CAUSA | CAUSA | STONK | 2026-09-10 20:14 | yes |
| 7 | standard | `GmvACXVTuPemJ61tsAT7utpvUyi9kDXvaEBehEdkHGwT` | HOWL | HOWL | STONK | 2026-09-23 19:13 | yes |
| 8 | standard | `3k6W4LhsoUBTbpEppmFAx5jbGZMFU88djSummF3aLb3W` | Stonk IRA | IRA | STONK | 2026-09-20 00:22 | yes |
| 9 | standard | `E767cZXeubGKNo6foSaBWdUHLxKBiUjMPGSx5SUuoG7r` | Memestonk | MEMESTONK | STONK | 2026-09-24 20:27 | yes |
| 10 | standard | `GDJVW4an8weaddykqPa1mZn8KS3AZZH7FFMd8U93A8mF` | Stonk Index | STONKINDEX | STONK | 2026-09-16 22:29 | yes |
| 11 | standard | `49bQM45JU5ifZ2rsNAFpiio922sDJ2ZH8XYxP4gikoqN` | Bogleheads | BOGLE | SPYx | 2026-09-24 15:13 | yes |
| 12 | standard | `CbwbWMTqzFw3h8DQM5AhkJTEUvZ9ZXqwsLLtLwJ1E7f7` | S500 | S500 | SPYx | 2026-08-28 20:07 | yes |
| 13 | standard | `91S5FpXn5qmxQzDZNbApB6z2Jhvk8XaPH7zyHrwsSTNK` | Sock & Pussy 500 | SNP500 | SPYx | 2026-09-15 15:32 | yes |
| 14 | standard | `BcGxEeipXN2okR43YZtwMQFBwVg5avGwHdzEoQc5TZDh` | Hostile | HOSTILE | SOL | 2026-09-26 08:06 | no |
| 15 | standard | `Amsa2oya29N2sb4tf9w2PpfHk1W6wXhVoqT8V2AzUq1L` | Microsoft Cat | MSCAT | MSFTx | 2026-09-26 07:38 | no |
| 16 | standard | `7XNYswif7dHnrFGPrEB6SjQywRN6XphbeAPWgSdXUYo8` | CAR | CAR | CARS | 2026-09-26 18:06 | no |
| 17 | standard | `EBpnwUYzPUnDK63av6RE2F18DeTT5VbjUFZQLAH9z8qM` | ZiPay | ZPAY | USDC | 2026-09-26 09:21 | no |
| 18 | standard | `5hFn4azWVQsriry7Y8FUN7BBHPnDS9qJQZkSniVWLAns` | Next Stop: The Hague | HAGUE | SOL | 2026-09-24 06:29 | no |
| 19 | standard | `5QiUxq3VkgGVrtoKTsta9ENuwuA2pyo5pY9fCeF7qXAj` | fomoapple | fomoapple | SOL | 2026-09-26 10:20 | no |
| 20 | standard | `CC5T6XHd8hdKxjSDSecZjnxf9tbPRocZzx2FwqeokvVe` | MASTERDOGE | MASTERDOGE | $WIF | 2026-09-26 15:00 | no |
| 21 | standard | `5aUscQoyac6WUVFRDt1aH1iivsBeUX9SpNwjpnnGVF4h` | sierra | sierra | SOL | 2026-09-26 18:43 | no |
| 22 | standard | `2n9H8197tga4TTeNP7wR4rDGL9gYW32XUFLzKBKXZXiw` | fomoapple | fomoapple | SOL | 2026-09-26 10:20 | no |
| 23 | standard | `9anS41RsjSKwJyNjzfnDKqiT83F5bY93nsoSnMYzaeZC` | 2027 | 2027 | USDT | 2026-09-08 20:55 | no |
| 24 | standard | `4E9TuEwvTr3K5pc3BiABAN5fCowm5Zndaohuskk2E3K3` | Rene.co | RENE | SOL | 2026-09-26 11:12 | no |
| 25 | standard | `CmAqrFtEebwwdghaEJaNkUTTxnxACsWy2ktu91VUGBEY` | Stook Street | STOOK | SPYx | 2026-09-24 14:17 | no |
| 26 | reward | `CQXTExSN5WhXUuKFfsgEkyBHV1SXvsUbALA25X4GCrDP` | Analos | ANALOS | SOL | 2026-09-14 05:57 | yes |
| 27 | reward | `EDng8XVvPXqPJ1e6bSE1XKFEYHnttcowtsu1izSgXRmL` | Smolano | SLO | SOL | 2026-09-23 17:41 | yes |
| 28 | reward | `4vfP3oJGrjMfK2osPFuiErMMCV68wrAo9uRsy8cD4dcB` | STUNTMAN | STUNTMAN | SOL | 2026-09-08 19:46 | yes |
| 29 | reward | `6rnU1jZtNRhHVSJeyDtn1vuehTD5dkwzZTEShHuh939f` | Xtremely Rich Pussycat | XRP | SOL | 2026-09-11 17:35 | yes |
| 30 | reward | `927iWr8JTH7XVz6uHxvrqxTvYpoHzUEuNuteSMogu6Kw` | We Love Dogs | WELOVEDOGS | SOL | 2026-09-19 16:48 | yes |
| 31 | reward | `AQH5CMWHLGvHVQ857tWtsvSmhsfks78FLpYbEtjuzkav` | pair anything with stock | paws | STONK | 2026-09-22 04:34 | yes |
| 32 | reward | `DiiYZppTimNAxA648g7fPQz8K9F7hMLtrZ5Lr7rAjpw3` | INSIDE | INSIDE | STONK | 2026-09-24 20:22 | yes |
| 33 | reward | `475NMrZTMXYYc36reBT8n1KyDqGCXq27tdz6bgLjtwv5` | BABY STONK | BABYSTONK | STONK | 2026-09-09 08:01 | yes |
| 34 | reward | `GNuKpXCeNwzfBWXJ4i24n63kRSdoG3mgMYLaEpGppD33` | STIV | STIV | STONK | 2026-09-16 13:37 | yes |
| 35 | reward | `CfM3DnMEK7hdH9LyX6ZUhM4RuWMnN22o1nmkkPW5s717` | CHONKS | CHONKS | STONK | 2026-09-24 17:02 | yes |
| 36 | reward | `8xMFSn9otQUVyrEJbCKytBS7anahLKCLp6uuHFt4h9u2` | STANKS | STANKS | SPYx | 2026-09-14 21:43 | yes |
| 37 | reward | `8N1JqzCd3jv6nQww8TyxdXv4dgApMSWgiPc9iuhJ9ti4` | The Wolf | WOLF | SPYx | 2026-09-10 21:22 | yes |
| 38 | reward | `9g1E3hisXJ3LfEZZza3pG7y6QjT8QWzxG7vd7E4mcBks` | Crypto + Stocks | Crocs | SPYx | 2026-09-07 01:30 | yes |
| 39 | reward | `FTSTEEPJxthqyRbVR5kJX2oarouH6CMPx8pvixSA4K4U` | Boldcoin | ZBOLD | ZEC | 2026-09-13 12:55 | no |
| 40 | reward | `23EcN91CypixBaoh5ySCXTostCN9mNfcPwG3yYvKq8UY` | Anonymous Frog | INFROGNITO | ZEC | 2026-09-12 23:11 | no |
| 41 | reward | `8GJfuy8WdtnmHdYGsVXR94VfDMYxx5PqiU8WptHXHjaQ` | super cat | SC | SI | 2026-09-26 16:39 | no |
| 42 | reward | `BQPxgQQEq6kpiAfQBHdfi6cyChhHrQM1BdBAiR8CSTNK` | Zero | ZERO | ZEC | 2026-09-23 23:17 | no |
| 43 | reward | `CrG3CquU7H9BjLzbaLqNcSg5mcKjydCxJ667PEJjSTNK` | The Black Cat | ANSEM | ANSEM | 2026-09-13 01:30 | no |
| 44 | reward | `FSHQfs9Ge6L3y4RcPMbDSgALWdapn36L65u8a4UFc7FZ` | Korean Popular Music | KPOP | EWY | 2026-09-26 15:25 | no |
| 45 | reward | `2zuWrQSg72oHfBBB2RvegUQoon334JwTu41WRFvD8dCp` | Fire Rune | FIRE | GP | 2026-09-21 12:16 | no |
| 46 | reward | `EygiEwgRT5oZ691FYosmQxPmKbHHq2BynF29GcRVpump` | NUKE | NUKE | URA | 2026-09-21 15:06 | no |
| 47 | reward | `3oqXtSYAZWTRVzE87ShWxnfENZKEqdcGuTQc3rEJETuX` | Dot | DOT | SPCXx | 2026-09-26 13:36 | no |
| 48 | reward | `5GCysUNvGzy1nXN2PUXeMrWP2q8ncB3pKJUFJPCgqWqt` | equititty | equititty | SPYx | 2026-09-24 16:55 | no |
| 49 | reward | `38DQdx4emByWPnLozArytJT5YqiZ3WkN1P2ag3KAuJHU` | Starlink Cat 5 | CAT5 | SPCXx | 2026-09-19 01:43 | no |
| 50 | reward | `8NUnisYM2zbDcAs3KNooReDSWbTx7ybgZsXfoPSNznaJ` | Twisted bow | TBOW | GP | 2026-09-18 02:17 | no |

## 5. Fee model

### 5.1 LaunchLab bonding curve (verified from events)

Decoded `TradeEvent`s (script `scripts/events.py`):

- Sell `2xCKQa7CXACRV42ngog8RXohFJXtUg1CYar9DwdZmxR8fHefZ2MSBGCnhS9GEwbP6xscTT77yDTBFehafEJwQ5jZ` (pool `2WgYu7gzxRj3pKFV5MfTMh8hMPE6wGKw2MQGWetxSHb4`): gross quote out 9,182,427, `protocol_fee` 22,957 (0.25%), `platform_fee` 91,824 (1.00%), `creator_fee` 0, user received 9,067,646.
- Buy (CAUSA creation) `4KHdjaY1...`: `amount_in` 369.517 STONK, `protocol_fee` 0.9238 (0.25%), `platform_fee` 3.6952 (1.00%), `creator_fee` 0.

| Fee | Rate | Source | Recipient |
|---|---|---|---|
| Raydium protocol fee | 0.25% of quote | GlobalConfig `trade_fee_rate` 2500 | Raydium, `protocol_fee_owner` `rayvTLcCMDs7P5tgpuoNA6ZYeLERegeCphdqLSgdKms` |
| StonkFun platform fee | 1.00% of quote | PlatformConfig `fee_rate` 10000 | platform fee vault, claimed by `5CEbue...` with `ClaimPlatformFeeFromVault` (e.g. `4CZb72Epy5epEBd79kwgCjtDxuPRFtDefwPFBXvs6TZHncJd196ZnYzK4KjZaYuhrg4uef5subsgpQLC5jJ9ag8v`) |
| Creator fee on curve | 0% | PlatformConfig `creator_fee_rate` 0 | none |
| Migration fee | 0 | GlobalConfig `migrate_fee` 0 | none |

### 5.2 Graduation

- Trigger: `real_quote` reaches the pool's `total_quote_fund_raising`; 793.1M tokens (79.31%) are sold on the curve and 206.9M (20.69%) plus the raised quote seed the CPMM pool (CAUSA migration above).
- SOL-quoted launches: 85 SOL for 11,857 of 11,880 pools.
- STONK-, xStock- and other-quoted launches: a different target per launch (for example 40,772.38 STONK for CAUSA, about 11 to 12 SPYx typically).
**(inferred)** The frontend converts a fixed USD target into the quote token at launch time.
- Migration is performed by Raydium (`RAYpQb...` signs), and Raydium pays the 0.15 SOL CPMM creation fee.

### 5.3 After graduation (Raydium CPMM, config `CRRS5ie...`, index 11)

Decoded `raw/accounts/CpmmAmmConfig_CRRS5ieQmBrZjWhcj99JuGrT5tyuWDaGAXLXLFjbAtjQ.decoded.json`.

- LP trade fee 0.25% (`trade_fee_rate` 2500); of that, 12% protocol and 4% fund go to Raydium (`ProCXqRcXJjoUd1RNoo28bSizAA6EEqt9wURZYPDc5u`, `FUNDduJTA7XcckKHKfAoEnnhuSud2JUCUZv6opWEjrBU`), and the remaining 84% accrues to the LP.
- All LP is locked and its Fee Key NFT goes to `5CEbue...` (platform_scale 100%), so StonkFun gets roughly 0.21% of post-graduation volume.
- CPMM creator fee 1.00% (`creator_fee_rate` 10000), on the quote token (`amm_creator_fee_on` QuoteToken for all 131,734 pools); the CPMM "creator" is `platform_cp_creator` = `5CEbue...`, which calls `CollectCreatorFee` (e.g. `5NVnDWhdU2UC7iKemxGCFfH5DmyGYC7tQosrPNGaNxqNLqjJuTJw2XWEUfjXkv8Aj1je1r4x5upN2oW6UtNwWQLv`; 517 such txs in the 37-minute window).
- On-chain, the token creator receives nothing from graduated pools.
**(inferred)** Any creator revenue share is paid off-protocol by StonkFun, which fits the outbound transfers in 4.3.

### 5.4 Reward mode

Reward tokens are Token-2022 with a 1% or 3% transfer fee (sample mint in `raw/accounts/reward_token_mint_*.json`: `transferFeeBasisPoints` 100, `maximumFee` 1e15, both `transferFeeConfigAuthority` and `withdrawWithheldAuthority` = `5KXDF6...`).
`5KXDF6...` loops `WithdrawWithheldTokensFromMint`, sells the harvested tokens on LaunchLab (`SellExactIn`) or CPMM (`SwapBaseInput`), and sends the quote token out in pairs of transfers (`raw/wallet_pages/5KXDF6Qn_desc40.json.gz`).
**(inferred)** These are holder or creator reward payouts.
Because `5KXDF6...` keeps the transfer-fee config authority, StonkFun could change the transfer fee on these tokens after launch.

### 5.5 Where the platform's money goes

In the window 2026-09-26 18:37:39 to 19:14:57 UTC (1,500 transactions of `5CEbue...`, `raw/wallet_pages/5CEbue_desc_p*.json.gz`):

- 517 `CollectCreatorFee` (CPMM), 170 `ClaimPlatformFeeFromVault` (LaunchLab), 30 `CollectClmmFeesAndRewards` (locker, CLMM path).
- 295 Jupiter swaps, almost all converting collected quote tokens (ZEC, xStocks, PUMP, SOL and others) into $STONK (e.g. `4at5bvPc39CaLU48LKzwnLWRm3p3eqYs5LbTWq1YXK8XLftPDqZjmE2n4jSwke3Fsunh9vbr1Y2MkPn57adNDrF1`).
- 13 `burnChecked` of $STONK totalling 35,537.72 STONK (e.g. `4RCj8L9bRHkqaP24yv1sJ7FUHGVL52PiqJ8tNbUjgeK6v9Dh2ND6pZNRukDTU7CYS6Jomr9PVf7srbStk4JYCi4J`, 3,498.84 STONK).
- 397 outbound token transfers to 26 wallets across 112 mints, 22 of them in $STONK (e.g. `G8ZE7yHrzebdfabLPaSj5RsSd1CgtdAGsDcTg7835637fxigNbNeqPN7NYkDUgefZBGgBEs3kWfrp6KfKpFDCkZ`, 502.80 STONK to `fkbqcSipdSFgd6BgVwRmYyQdTkfwvBzfhbo7gwuBov9`).
- **(inferred)** The model is "collect fees in any token, market-buy $STONK, burn most of it, pay some out."

## 6. What this means for a copycat build

- The whole StonkFun product can be rebuilt with no smart-contract work: create a LaunchLab `PlatformConfig` (and optional curve rules), set `fee_rate`, `creator_fee_rate`, LP split and `platform_cp_creator`, and run a backend that claims fees.
- Any-token quote pairs depend on Raydium creating a GlobalConfig for that quote mint; StonkFun's 503 quote mints all use Raydium-created configs.
- Risks: LaunchLab has no published source and no verified build, and all Raydium programs are upgradeable by one system-account key.

## Files

- `README.md`: this report.
- `raw/`: DexScreener and GeckoTerminal JSON, DAS responses, decoded accounts (`raw/accounts/`), transactions (`raw/tx/`), wallet history pages (`raw/wallet_pages/*.json.gz`), getProgramAccounts dumps (`*.json.gz`), pool CSVs (`*.csv.gz`), token sample and quote-mint summary.
- `programs/`: program binaries (`*.so`), `so_sha256.txt`, `program_show.txt`, IDLs (`*_idl.json`), OtterSec responses (`verify/`).
- `scripts/`: helpers used to produce the data (`rpc.sh`, `tx.sh`, `acct.sh` read `HELIUS_API_KEY` from the project `.env`; `decode.py`, `events.py`, `pools.py`, `deltas.py`).
