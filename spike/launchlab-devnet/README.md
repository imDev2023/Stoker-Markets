# PAND-432: Raydium LaunchLab technical spike

Run on 2026-09-26.
Built only from Raydium's public IDLs (`idl/`) and `@raydium-io/raydium-sdk-v2` 0.2.73-alpha (GPL-3.0, spike only, not distributed).
stonkfun.xyz was not touched.

## Status at a glance

| # | Question | Answer | Where the evidence comes from |
|---|---|---|---|
| 1 | LaunchLab, CPMM and lock deployed on devnet, and which GlobalConfigs exist | Confirmed | Real devnet, read-only |
| 2 | Our own PlatformConfig with creator fee 0.5% and platform fee 1% | Confirmed on real devnet (2026-09-27) and on a devnet fork | Real devnet, plus a local fork |
| 3 | Launch, trade, creator and platform fee accrual and claims | Confirmed on real devnet (2026-09-27) and on a devnet fork | Real devnet, plus a local fork |
| 4 | Graduate, migrate, post-migration creator fee and Fee Key NFT | Confirmed on real devnet (2026-09-27): Raydium's crank migrated our pool 9 s after it completed | Real devnet, plus a local fork |
| 5 | Every mainnet GlobalConfig, quote mints classified, Token-2022 extensions | Confirmed | Mainnet via Helius, read-only |

### Why questions 2 to 4 first ran on a fork

Devnet SOL could not be obtained on 2026-09-26.
The public faucet (`api.devnet.solana.com`) answered 429 "airdrop limit today" for every amount down to 0.2 SOL.
The Helius devnet faucet answered "limit of 1 SOL per project per day", already used today.
The Alchemy key is over its monthly capacity.
faucet.solana.com works but demands a Cloudflare human-verification captcha, which I did not attempt.
No mainnet key was used or requested.

Instead, `./localnet.sh` starts `solana-test-validator` cloning the exact devnet binaries of LaunchLab, CPMM, the LP locker and Metaplex, plus the devnet CPMM config, the CPMM create-pool-fee account and the CPMM permission PDA.
The devnet SOL GlobalConfig is copied with one change: its `migrate_to_cpswap_wallet` is set to our admin key (`src/patch_global_config.ts`), because only that wallet can run `migrate_to_cpswap` and there is no Raydium crank on a local fork.
Everything else is the unmodified devnet state and code.
Fork signatures below are real, confirmed transactions on that validator, but they have no public explorer page.

## Real devnet run (2026-09-27)

The owner's own devnet wallet funded the admin wallet with 1 SOL (tx [6613hi...](https://explorer.solana.com/tx/6613hiVT3gv7FMCZXKZhyvciXUBBDT5nt5Q55NNkNEJAKF6GbNPj52YEjakBGFRnVYySW3UG9C2a1gw8KTkaTun2?cluster=devnet)), and `CLUSTER=devnet ./run.sh` then passed every step with the same results as the fork.
Raydium's devnet crank (`DRayP1Yav394wpS47WQJ5Qm6d95WTQFtGGh54cVQFmhF`) migrated our pool with no action from us: the completing buy landed at slot 504846388 and the migration ([tx](https://explorer.solana.com/tx/2dvPMLcWMmsyqzrY3Q7eCW7Z29WTyPvPAxfyBPpu4DqXAsV7sDcEghg1AqJCg1aQWXPvD51zHZqwLi6VHipMAJwW?cluster=devnet)) at slot 504846429, 9 seconds later.
This settles the last open question: Raydium's crank migrates pools from a brand-new platform, so Graduation needs no Raydium contact.
The CPMM pool `GTWSDphjNcDTMRgimMyK8x8UU1TLLDmYvVremJiTHy3d` uses config `5MxLgy...`, and the Fee Key NFT `C3dTtQxEasUBibMB2aN88B1GwyrmdTxq2erwyC52Hzr4` went to our fee wallet.
The full log is `out/devnet_run.log`; state and evidence are in `out/devnet/`.

- OK: fund wallets from admin: [tx](https://explorer.solana.com/tx/2YoKAmjzruvy6XKfmS4XdHm9EvDxLteqtz7BMm2Y7a74Vsrbx8sR3n9vYL5owZWmRjSbqSzY2NXkBSUegqyU1DPf?cluster=devnet)
- OK: q2 create_platform_config: [tx](https://explorer.solana.com/tx/5zJesv9ssXtoFvwHG5abnLpTFVFt3G2oodmMVHr27P6XmaUUx9DqaE1jXyX9381pRGPMsXQCUHLYSwcwU5iajoHi?cluster=devnet)
- OK: q3 initialize_v2 (SPL base, amm_fee_on=QuoteToken): [tx](https://explorer.solana.com/tx/5A3qf8MsuAafud73fkzoKFDfa24kFkg1Bdw5mcjgNgVJzinjt8wDKj2xvtTQrvdLcMsqA3gSnH3neCjsjJvLwZ7g?cluster=devnet)
- OK: q3 trader wraps 0.1 SOL: [tx](https://explorer.solana.com/tx/2UQ5mucTQt7BQin9VmMamAzRAwr8RQxD2WkM3x8nys887NhneMJg7nNMmMYq6cEy6mqbhP3ofsH7QWb7XJFkv3ty?cluster=devnet)
- OK: q3 trader buy 0.03 SOL: [tx](https://explorer.solana.com/tx/5WoPdngMBUDX48U8Y661zUe47ppNWxNhS4SpXQXPeMdyPaDKHcmBs4DGWgpnDNdxzBAwLWjccpQe1biBtHx77Egi?cluster=devnet)
- OK: q3 trader sell half: [tx](https://explorer.solana.com/tx/4JxDJoariNanL9c1osEcd5csRGw648XAH3XoVrhFZGwLxKXcnmJA3XpTHeZ8Kt1uKdyRACfyfgDgCCZKkc32Y5cd?cluster=devnet)
- OK: q3 trader buy 0.02 SOL: [tx](https://explorer.solana.com/tx/61RtdEcWNi94nkpwUXq1gusm7cyqCW7ggJLetKJ6CQEaeSHdtKvrnGdnjz6kvRPTB3KPYbMRRuQ17GKZ9rTWrnSD?cluster=devnet)
- OK: q3 claim_creator_fee (creator): [tx](https://explorer.solana.com/tx/2o9BXxDCFD5sdTXTQyrHfXETwJjvNu8FhXmbYmhvi4gfF3cmGVnkPe1fU2eQwnuF7CpRqrqnofn3kY6ipZ11VLa7?cluster=devnet)
- OK: q3 claim_platform_fee_from_vault (fee wallet): [tx](https://explorer.solana.com/tx/3B843i5Wtdn1RBBezDQgVRodrxG5c9dNFJ6pqotW1dSLPFkkQg4xDoTyisynVfLrm3KfByGmqXoD95WEosuN9DND?cluster=devnet)
- Expected failure: q3 claim_platform_fee (pool-level, fee wallet) (error 6009)
- Expected failure: q3 claim_creator_fee by NON-creator (trader) must fail (error 3012)
- OK: q3b initialize_with_token_2022 (1% transfer fee): [tx](https://explorer.solana.com/tx/3P7vq2zy6WvBnEXezKizBpWBFnbLP9zDLL5zAsVrMnVtpR6CvrDAKVi3i5irXYnxKFoeSyzbKhjFmM6Yw3kT11mG?cluster=devnet)
- OK: q3b trader wraps 0.02 SOL: [tx](https://explorer.solana.com/tx/dLky67U5rRhi7S5XEwTm6KuRkyhLsq8KmRMmUFhMwEsB5HskLmgYH1AK5zM6ZTWgm4X94iKEyb3KXc7d254dGwW?cluster=devnet)
- OK: q3b trader buy 0.01 SOL of the Token-2022 coin: [tx](https://explorer.solana.com/tx/3dANkhAt7ieokhkaoeCTtPHrAJf1HNFBF6tM8RjVrR5npbrvTWRv41EMMQ6g8MMPNSKk5uQbKtyocbHn37GW39XX?cluster=devnet)
- OK: q3b trader sells half back: [tx](https://explorer.solana.com/tx/AZNTBRiZp9L4Q1frxqPykn3peam1RtsLkFipBrP2EqgWAmvzC1afr8rnoDVBkb326CUnwT5KmbPEp4Y7x3YAmaC?cluster=devnet)
- OK: q3c trader wraps 0.02 SOL: [tx](https://explorer.solana.com/tx/5EKJZxabonno5RGZTa63gRbEaxMK8xkHRG7sQr3tQRsTRg2a5Fhy7wuJVqqrFqNfUKEiuPyFRkQSZ9crce2gQQFr?cluster=devnet)
- Expected failure: q3c buy WITHOUT fee-vault remaining accounts (error 6018)
- OK: q4 trader wraps SOL for the final buy: [tx](https://explorer.solana.com/tx/3RPbehpQhw3GHQVwovfmfJUZvAvyx1NCf715PdsWTLA3GzQSed4EWhUvDxANotMmSjCKoDq4gD6m7daRvwCXfzdg?cluster=devnet)
- OK: q4 trader buys to completion: [tx](https://explorer.solana.com/tx/eMZHyWwbbFvuJxixTVovp9Cd6PStYjuUxC4RLMmjAawjyWiuYPTfoY3YgyYQAz39uXovwwuHsdU5Gg2zvYgEAUJ?cluster=devnet)
- OK: q4 trader wraps 0.05 SOL for CPMM swaps: [tx](https://explorer.solana.com/tx/2BGSwCF18y2Lg12byLmittDr6WbuXgV8tqyW15g9SibVXxdLcXFGaVqg3JGLover37axC7DGx8ZgcXAxtTZM18kB?cluster=devnet)
- OK: q4 CPMM swap: trader buys with 0.04 WSOL: [tx](https://explorer.solana.com/tx/5QxYYdPDc2H7PNLBeACP8KTiw23tKKEpWZ4Ro6dmNWLddcwVDWoL1qehPkpo75QXbByZY9xw66pMinL8SCGX8huC?cluster=devnet)
- OK: q4 CPMM swap: trader sells a quarter of its tokens: [tx](https://explorer.solana.com/tx/P66cRw3PD44g53FmiSoFBqUBaiiWiffxRHxM4K3gdhP7FrFGjfk75puvdvPE75SWb2qGTyhDxjboWBKgBhg5kE2?cluster=devnet)
- Expected failure: q4 CPMM collect_creator_fee by a NON-creator (trader) must fail (error 2012)
- OK: q4 CPMM collect_creator_fee (token creator): [tx](https://explorer.solana.com/tx/6JPkY5v6uDHAs3K1m7GTr54Bc4hYPftMfVPSV9fMYtZ6z4GTczxsC47Hk7xJWp66CUMYBPnfm3sj9s6R5y2J5N5?cluster=devnet)
- Expected failure: q4 locker collect_cp_fees by a wallet WITHOUT the Fee Key NFT (trader) must fail (error 3012)
- OK: q4 locker collect_cp_fees (fee wallet holds the Fee Key NFT): [tx](https://explorer.solana.com/tx/5KSVsdkDu1UT5WaggiF14EdeoYKwPJhkCZ52ZCRF5qGHKyAM6bTHa1czC25ijCZrqnqs6SAKTwVMv9yoKVVWVxH4?cluster=devnet)
- OK: q4b trader wraps 0.02 SOL: [tx](https://explorer.solana.com/tx/4HwMwEeZbDgffQbJbvgnEFnSN96fiKX6K1aCK5Lg8M65BXDrqt7R9kni7nRKHWPKazFwHFRWC4i9KrbWLTrdTwoU?cluster=devnet)
- OK: q4b CPMM swap: trader buys with 0.02 WSOL: [tx](https://explorer.solana.com/tx/5TpbhDCczho7wc8GVWr7gK7UpkRDSbszCKmkU1WsMUT3k8zzjUKxw11JvoAWqow7KLkGvjPHUy1J8CxzFTDuFNxk?cluster=devnet)
- OK: q4b CPMM collect_creator_fee_permissionless (fee wallet pays, creator receives): [tx](https://explorer.solana.com/tx/29FRGgzmvh4vYYaP4gA5zCcnkpB9AX3xNdHrqGMy3YvQrRTXzPxaTxUs9NEq59WoRN8wr9si8eBcXLaKwqYkcQQC?cluster=devnet)
- Expected failure: q4 probe (error 6002)
- OK: q4 probe: trader wraps 0.01 SOL: [tx](https://explorer.solana.com/tx/3n7b9LUkGyay9UwgqDQwHbpJco9E7dnkx3fdeNXd3bGHWqT55AdrF7AmbCtwjgPVScveKPjcE8YfjvysMeDFfy82?cluster=devnet)
- OK: q4 probe: launch with total_quote_fund_raising = 1 lamports: [tx](https://explorer.solana.com/tx/4dNCaVJCZJZ6TFhzfghDug75VKQnkNESnrFZBp7ZTp56ikgrU8m1FrYkmMD573sbgfY8QsH3xRzHixbJtSR48N9u?cluster=devnet)
- Expected failure: q4 probe (error 2506)
- OK: q4 probe: launch with total_quote_fund_raising = 1000 lamports: [tx](https://explorer.solana.com/tx/5qmAsiwLyAGrBLCbHTNgVSXbfvXqKQHYH5Pd4YFeu8v4XrcGWsWavMNVZhYjzTszju2TpxyhmTGJnQJBT5vGPbjw?cluster=devnet)
- OK: q4 probe: buy the 1000-lamport pool to completion: [tx](https://explorer.solana.com/tx/64Vog9iHwLrVsjm43cZodcAk6zNThvCq9yzpBcUgdc2KPVGc1D6Gs3ce4fHTf28sQ732PLuTRuekGiGEwTX6aXqr?cluster=devnet)

## 1. Is LaunchLab deployed on devnet, and which GlobalConfigs exist?

**Confirmed.**
The devnet ids are in the SDK at `node_modules/@raydium-io/raydium-sdk-v2/src/common/programId.ts` (`DEV_LAUNCHPAD_PROGRAM` and the `DEVNET_PROGRAM_ID` map).

| Program | Devnet id | Last deploy slot | Upgrade authority |
|---|---|---|---|
| LaunchLab | [`DRay6fNdQ5J82H7xV6uq2aV3mNrUZ1J4PgSKsWgptcm6`](https://explorer.solana.com/address/DRay6fNdQ5J82H7xV6uq2aV3mNrUZ1J4PgSKsWgptcm6?cluster=devnet) | 496182200 | `DRayw6sn9fCvbhx5ZLtAVGAgAk6qAAX7UT7urzkXTeM5` |
| CPMM | [`DRaycpLY18LhpbydsBWbVJtxpNv9oXPgjRSfpF2bWpYb`](https://explorer.solana.com/address/DRaycpLY18LhpbydsBWbVJtxpNv9oXPgjRSfpF2bWpYb?cluster=devnet) | 498629438 | same |
| LP lock | [`DRay25Usp3YJAi7beckgpGUC7mGJ2cR1AVPxhYfwVCUX`](https://explorer.solana.com/address/DRay25Usp3YJAi7beckgpGUC7mGJ2cR1AVPxhYfwVCUX?cluster=devnet) | 403082609 | same |

The devnet LaunchLab publishes its Anchor IDL on-chain (`idl/launchlab_devnet_onchain.json`, fetched by `src/fetch_devnet_idl.ts`).
It is identical to the mainnet IDL except that it lacks `collect_excess_lamports` and hard-codes the devnet CPMM and lock ids, so one client works on both clusters.
CPMM and the lock program have no on-chain IDL on devnet.

Devnet holds 5 GlobalConfigs, 868 PlatformConfigs and 7,109 pools (`src/q1_devnet_configs.ts`, `out/devnet_global_configs.json`).
All are constant-product, 0.25% trade fee, zero migrate fee, and migrate through the crank wallet `DRayP1Yav394wpS47WQJ5Qm6d95WTQFtGGh54cVQFmhF`.

| GlobalConfig | Quote mint | Index | min_quote_fund_raising | min_base_sell_rate | min_base_migrate_rate | max_lock_rate | max_share_fee_rate |
|---|---|---|---|---|---|---|---|
| [`7ZR4zD7PYfY2XxoG1Gxcy2EgEeGYrpxrwzPuwdUBssEt`](https://explorer.solana.com/address/7ZR4zD7PYfY2XxoG1Gxcy2EgEeGYrpxrwzPuwdUBssEt?cluster=devnet) (used here) | WSOL | 0 | 1 lamport | 1 | 1 | 999999 | 10000 |
| `DQe2B8w3RYKsUkWBRipt1iNCuy6YwmN6krgdQspQBfrd` | WSOL | 1 | 30 SOL | 200000 | 200000 | 300000 | 10000 |
| `4wHbNkobu7iARU9MbCEqDSAq6JuQreGupG2Jsf2R3DFP` | devnet USDC `USDCoctVLVnvTXBEuP9s8hntucdJokbo17RwHuNXemT` (Raydium mint authority) | 0 | 1 | 1 | 1 | 999999 | 10000 |
| `2t3jEnQ1KGndXbNmyLsEuhYip7XjF7V1p1fhsTYVkhpw` | `DRay3aNHKdjZ4P4DoRnyxdKh6jBrf4HpjfDkQF7MFPpR` (Raydium test mint) | 0 | 1 | 1 | 150000 | 999999 | 0 |
| `6EiPNvGkwbtDon4HMxzaXFHmko6mYXwMZEjpHzup8rD6` | `8Du8VJoE6rVghNxJLa9dcR7m8JwQu9ByKxGJkDD5beAB` (9 decimals, third-party test mint) | 0 | 1 | 1 | 1 | 999999 | 10000 |

Rates use a 1e6 denominator.
There is no devnet GlobalConfig for any tokenized stock, so stock pairing can only be tested on mainnet or with a Raydium-created devnet config.

Devnet CPMM configs (`src/list_cpmm_configs.ts`): index 0 `5MxLgy9oPdTC3YgkiePHqr3EoCRD9uLVYRQS2ANAs7wy` is 0.25% LP fee plus 0.25% creator fee with a 0.15 SOL create fee, and it is what the crank's own migrations use.
Others go up to a 1.25% creator fee (index 8 `7K5fZrc5LPZjDSvQZ1LmWJJoas86PX55YWBDuFqsP4qN`) and 1.495% (index 6).

## 2. Our own PlatformConfig

**Confirmed on the devnet fork; not yet on real devnet (funding).**
`src/q2_platform.ts` encodes `create_platform_config` with the Anchor coder straight from the devnet IDL.
Fork tx: `3tTXcvVUWuSN8nEXhedgG5ghf9xnJ5Xdayg4NuCe8cY44DTDZkGLdLYfbfT6jCRkLuKcPuLfFoKn4gFhNbFDXbA4`.
PlatformConfig PDA `["platform_config", admin]` = `GuEwao9TZQDDCR8r6a1VTVDdmztLBPVUWhXf8TPNxgwS` (the same address on real devnet, since it only depends on the admin key).
Account size 944 bytes, rent 0.00746112 SOL, paid by the admin.

`PlatformParams`, Borsh-encoded after the 8-byte instruction discriminator, in this order:

| Field | Type | Value used |
|---|---|---|
| `migrate_nft_info.platform_scale` | u64 | 1,000,000 (100% of the locked LP fee rights to our Fee Key NFT) |
| `migrate_nft_info.creator_scale` | u64 | 0 |
| `migrate_nft_info.burn_scale` | u64 | 0 (the three scales must sum to 1,000,000) |
| `fee_rate` | u64 | 10,000 = 1.00% platform fee per curve trade |
| `name` | string (u32 length + UTF-8) | "PAND432 Spike" |
| `web` | string | https://example.invalid/pand-432 |
| `img` | string | https://example.invalid/pand-432.png |
| `creator_fee_rate` | u64 | 5,000 = 0.50% creator fee per curve trade |
| `platform_vesting_scale` | u64 | 0 |

Accounts, in order: `platform_admin` (signer, payer), `platform_fee_wallet`, `platform_nft_wallet`, `platform_config` (PDA), `cpswap_config`, `system_program`, `transfer_fee_extension_authority`, `platform_vesting_wallet`.
We passed the fee wallet `CS3Bm...` for all four wallet roles and CPMM config `5MxLgy...` (0.25% post-graduation creator fee).
The decoded account confirms every value; `platform_cp_creator`, `restrict_global_config`, `restrict_curve_param` and `curve_rule_manager` are not in `PlatformParams` and default to empty, and are set later with `update_platform_config`.
Leaving `platform_cp_creator` empty is what makes the token creator (not the platform) the CPMM pool creator after graduation.

## 3. Launch, trade, and prove creator and platform fees

**Confirmed on the devnet fork; not yet on real devnet (funding).**
Script `src/q3_launch_trade_claim.ts`.

Launch: `initialize_v2` with `amm_fee_on = QuoteToken`, SPL base mint, 6 decimals, supply 1B, `total_base_sell` 793.1M, `total_quote_fund_raising` 0.2 SOL, constant curve, migrate type CPMM, no vesting, against GlobalConfig `7ZR4zD...`.
Fork tx `5ZUHTx5B2CWVLsWaoFWgKZpEwxzmb5FedgVm3RN5SRCWhkqP8NeLeKRY8UEtdjEsHHVMC2gixYFA2xPkbJApJGo7`, pool `J5UxPr3CKcXqzDbFF5MeqZb8GTLaAphRG6zcGDFc3Mpw`, mint `9uVkX3WdpBNtfDyEo6MM2PmLdy8gQjxfFiv4D35QrMe4`.
`amm_fee_on` has two values: `QuoteToken` takes the post-migration CPMM creator fee in the quote token only, `BothToken` in both tokens.
Either keeps a creator fee after migration; `QuoteToken` pays creators in SOL (or the paired asset) and is what StonkFun uses.

Trades from the trader wallet, fees read from the decoded `TradeEvent`:

| Trade | Fork tx | Quote amount | Protocol 0.25% | Platform 1.00% | Creator 0.50% |
|---|---|---|---|---|---|
| Buy 0.03 SOL | `4WUacd7fx6ZjbdskUcUGzGU2x3Yfp1xC2Y3s9xV9zgwEy2dKryDZwqXaxFYkAwgv1xjGxxTQCnJbFMxEZz4Q8HPW` | 30,000,000 in | 75,000 | 300,000 | 150,000 |
| Sell half | `4aiLZWRJi97dNAiEz25mffvQZxAhwenUPy56fMcjYAYhgTvf1eQvpqUR8ZvQ3VnSi6YkiwBySRTuseerRTsneq9X` | 16,980,456 out | 43,208 | 172,829 | 86,414 |
| Buy 0.02 SOL | `5aLzarmEacqMk7xLnxPuCvZCSVuwSmLMW14u5UA7QWW7q8Kq9CS6WBzEhpbLNSmewpw4vhBq43idgUEzZPm4Z1X7` | 20,000,000 in | 50,000 | 200,000 | 100,000 |

Amounts are lamports.
Platform and creator fees are not kept in the pool: each trade moves them into two program-owned WSOL vaults, the platform vault PDA `[platform_config, quote_mint]` and the creator vault PDA `[creator, quote_mint]`.
The pool's own `platform_fee` field stayed 0.

Balances (SOL, as WSOL):

| | Platform fee vault | Creator fee vault | Creator WSOL | Fee wallet WSOL |
|---|---|---|---|---|
| After trades | 0.000672829 | 0.000336414 | 0 | 0 |
| After claims | 0 | 0 | 0.000336414 | 0.000672829 |

- `claim_creator_fee` signed by the creator paid the creator: `RKYuPkyNaLaAzTAHkrtJmjqJz1uhFY8YKgRi3sgENWYBTZw4fyKVrw5A3HzKowAzjjC71ghywgvuRhygheL82gX`.
- `claim_platform_fee_from_vault` signed by our fee wallet paid the fee wallet: `4Hnh5Pvsx5VHEWdYovMf2M4NaNuB4XrPu85KePN165GsNX1HXcVDRMc9SHv261bbiawUeTMoYmC5yuTmFXVZDecE`.
- The pool-level `claim_platform_fee` failed with `NoAssetsToCollect` (6009), because fees go to the vault; it only serves pools from older program versions.
- `claim_creator_fee` signed by the trader failed (3012, its creator vault does not exist), so only the creator can claim.
- A trade that omits the three trailing accounts (system program, platform fee vault, creator fee vault) is rejected with `NotEnoughRemainingAccounts` (6018) (`src/q3c_trade_without_fee_vaults.ts`), so every trade path must pass them.

`initialize_with_token_2022` (`src/q3b_token2022.ts`, fork tx `4yt3zK8f3uP3RL8dEiauF42Ptcp8tvkAwm2Xv67SKxmQr9PETnF1Bz11wQgUPgPBG1pKqx1TfeNNpJaTjmrggoQj`) creates a Token-2022 base mint with metadata in the mint itself (no Metaplex account) and an optional `TransferFeeConfig` of up to 5% (we used 1%).
Mint and freeze authority are none; the metadata update authority and `transferFeeConfigAuthority` belong to the LaunchLab authority `5xqNaZXX5eUi4p5HU4oz9i5QnwRNT2y6oN7yyn4qENeq` until migration, when the IDL says they pass to the platform's `transfer_fee_extension_auth`.
`withdrawWithheldAuthority` is our fee wallet from the start, so the platform can harvest the transfer tax during the curve phase.
A 0.01 SOL buy returned 5,940,825,604,881 raw tokens from the curve and the trader received 5,881,417,348,832, the 1% withheld (`3BXrsARhD6ncCcw4U3w3jPKXED7y8hA6hsqfftWHv4KuEAh8T9G2cDVZrSwXwJaGk2odsQqECjy7j8D5Vx3hZZJj`), and selling back worked (`2UoMv4c3wKiZRh1TtL1NhwLfn2u7qPT3chSDRe5Ayoo9t8s5Kbvs1LusVezwVtQvEqgH7zujAibRN6bM1hQ8Pvne`).

## 4. Graduation, migration and post-migration fees

**Confirmed on the devnet fork, and the migrate-permission question confirmed on real devnet.**
Scripts `src/q4_graduate.ts`, `src/q4b_permissionless_creator_fee.ts`, `src/q4_min_fund_raising.ts`, `src/q4_devnet_migrations.ts`, `src/q4_devnet_migrate_permission.ts`.

### Smallest fund raising

The devnet SOL GlobalConfig allows `total_quote_fund_raising` down to 1 lamport, and 0 is rejected with `InvalidInput` (6002).
A 1-lamport pool launches (`QFvs8MHMKsF7ECPc32hrjwW6ayXrtWUASL3Adq5ivkU1KzekdgzqfosKHUzonhBDKQyZvNNaYko9wSDuzwsLi1i`) but can never trade: every buy fails `require_gte` (2506) because the output rounds to 0.
A 1,000-lamport pool launches, completes with one buy (status 1 at 997 lamports raised) and migrates (`34jn4LGjJqptsCdsWFXqRGwLFiXjcYaeMYeeuqXRXyVG6bzmGrbdRNTiQjV9vyhgZH71LRGbpvAtBkxNULBEqDLw`).
For the fee demonstration we graduated the 0.2 SOL pool from question 3, so the CPMM pool had enough depth for meaningful fees.
The final buy (`ztv1iHVLkhQb12exShGxXKpiBjPEpEHwMdJRjJDedq6epb21QuZpVRn1mstwnBdf734LnzgQZB5aPTttBurZDyN`) sent more than needed; the program took only 0.171153089 SOL, refunded the rest, and set the pool to status 1 (`Migrate`).

### Who may sign `migrate_to_cpswap`

Only the GlobalConfig's `migrate_to_cpswap_wallet`; it is not permissionless.
On real devnet, a simulation of `migrate_to_cpswap` (signatures off) against the already-migrated pool `BQJri4tM7GxrYpLe1DrPweZG296nM5gm2XRFqVQDA2M6` fails with `InvalidOwner` (6001) on account `payer` for any other wallet, while Raydium's crank wallet passes account checks and only fails with `PoolMigrated` (6006) (`out/devnet_migrate_permission.json`).
On the fork the same split: the trader gets 6001 on `payer`, and the wallet named in the (patched) GlobalConfig succeeds (`4gBSQaWLDJhusPeodjpENVgwkCEncija2N9rAwXJDsspJRUSLVyyom5xAtgvNRijsPgUKNjL665KwVCGRGJnYvt5`).
On mainnet all 571 GlobalConfigs name `RAYpQbFNq9i3mu6cKpTKKRwwHFDeK5AuZz8xvxUrCgw`, so Raydium alone migrates every pool.

Raydium's devnet crank migrates automatically.
Its last 200 transactions contain migrations for pools of several third-party platforms, usually 4 to 8 seconds after the completing trade (`out/devnet_migrations_sample.json`), for example [`5ZpE81mU...`](https://explorer.solana.com/tx/5ZpE81mU5gVsxRJE3tvVXnYoPGDARCWq4PgmA5AdB3kxm2YGbZdnkQ6D8C3wTqq9KriPtvcer1Lv9415KkRd9L1M?cluster=devnet) and a burn-scale platform [`W5UaseW2...`](https://explorer.solana.com/tx/W5UaseW2p6XY7QzUa4vx6yT3kwdYh9XnfmBz1eMBoLspoZTbuEEWNEdFS5qstGsnoPfshcBo6m3dhSmctzcNqc9?cluster=devnet).
The funded devnet run on 2026-09-27 proved it also picks up our own new platform: it migrated our pool 9 seconds after the curve completed (see "Real devnet run" above).

The migrate instruction takes 28 named accounts plus 10 remaining accounts when `platform_scale` is 100%: platform NFT wallet, a fresh Fee Key NFT mint (co-signer), its ATA, the locker's `["locked_liquidity", nft_mint]` PDA, the NFT's Metaplex metadata, the pool creator, the CPMM permission PDA `["permission", launchlab_authority]`, `platform_cp_creator`, and the CPMM `["support_mint", mint]` PDAs for quote then base.
It is too large for a legacy transaction (1,471 bytes), so it needs a v0 transaction with an address lookup table.
The migration payer funds the CPMM create fee (0.15 SOL on devnet index 0) and rent; on mainnet and devnet that is Raydium, not the platform.

### After migration

CPMM pool `3qtQrMzWrtbGA14CU4WjtitPj1HeKKn4FyCg7XtBDXFz`, config `5MxLgy...`, `poolCreator` = our token creator `DVHeY...` (because `platform_cp_creator` is empty), `enableCreatorFee` true, creator fee on the quote side.
The pool's `open_time` is the migration time plus 1 second; swaps before that fail with `NotApproved` (6000).
Our fee wallet received Fee Key NFT `2GBGxG77uMG4tEufQdxvYrMZzctTf5bFRr6pgC5f147J`, and the locker holds 203,420,747,155 LP for it (100 LP are locked in CPMM itself).

| Step | Fork tx | Result |
|---|---|---|
| Trader buys with 0.04 WSOL on CPMM | `2a8kD8Q6ZsR1y9cKUii2V76zntY6KXUrqEm1qk2NrexaQaCQ2fRhfzg2ZL3PSsBvxW6t2Xt6TkKN8az1Y33adZxi` | |
| Trader sells a quarter of its tokens | `3dwZgZTgLKDoPdDcVGBVBAKmqy3DG9uZAFHQP44wwYNLGLU26NzDG1wW9oBascUvJVVANq2fZ1VTo1r1maxPpPtC` | pool `creatorFeesMintA` (SOL) 0 to 426,590 lamports |
| `collect_creator_fee` signed by the trader | failed, `ConstraintAddress` (2012) on `creator` | only the pool creator can call it |
| `collect_creator_fee` signed by the creator | `GLgMiqEyTR2Z8VrYGLH6rBD2u1qaxYam6MESbhwwR1wTrj1MabrDyfcAtobcStNzRV8uUFK1S27zPfEz7HDK78F` | creator WSOL 336,414 to 763,004 (+426,590) |
| Another 0.02 WSOL buy | `2K3xew39vRatRzrmDC541skvytsY5vzNuMNyjhGTNxRnbokgiuHDEtBKd1DMvfUzaZ3pH4cQQEGMNwyLnFAv7Liw` | 50,000 lamports accrued |
| `collect_creator_fee_permissionless`, paid and signed by our fee wallet | `58i74ucfQtdk5ZaTZMHVfE2iB8pVvcMTu56j6VL28pnnCjh1u8qeMKQk1kozhhxo1upZ5CzWUJrCaoxYBDYgq1yG` | creator WSOL 763,004 to 813,004 without the creator signing |
| Locker `collect_cp_fees` by the trader (no NFT) | failed, 3012 on `fee_nft_account` | only the NFT holder can collect |
| Locker `collect_cp_fees` by our fee wallet (NFT holder, `fee_lp_amount` = u64 max) | `3dg9khVTJUkHjrukeAz4fF9x4H92xTKF8kLaB6wzbJwMKNHRppnGKgzGke4ZS8jPtWYzjkQ9fBWqZkBaZPWLijJG` | fee wallet WSOL 672,829 to 754,519 (+81,690 lamports) and +283,649.96 base tokens; 152,108,008 LP marked claimed |

So the creator fee keeps accruing after graduation and is claimable by the creator, and it can also be pushed to the creator by anyone (our backend) with the permissionless variant, which the mainnet CPMM binary also contains (`research/onchain/programs/raydium_cpmm_*.so` strings).
The platform's Fee Key NFT collects the locked LP's share of the 0.25% LP fee in both tokens.

## 5. Mainnet GlobalConfigs and quote assets

**Confirmed.**
`src/q5_mainnet_global_configs.ts` reads every `GlobalConfig` of `LanMV9sAd7wArD4vJFi2qDdfnVhFxYSUg6eADduJ3uj` through Helius (`getProgramAccounts` with the discriminator filter), resolves names with DAS `getAssetBatch` (falling back to the Token-2022 metadata extension), reads each mint's program and extensions, and writes `mainnet_global_configs.json` (a summary, one row per config, and one entry per quote mint with its extension state and risk flags).

- 571 GlobalConfigs, one per quote mint, all constant-product, all 0.25% trade fee, all zero migrate fee, all with `protocol_fee_owner` `rayvTLcCMDs7P5tgpuoNA6ZYeLERegeCphdqLSgdKms` and migrate wallet `RAYpQb...`.
- Only 3 configs set real launch limits, and only these 3 allow a share (referral) fee of up to 1%.
- The SOL config `6s1xP3hpbAfFoNtUNF8mfHsjr2Bd97JxFJRWLbL6aHuX` requires at least 24 SOL raised, at least 20% of supply sold and at most 80% locked.
- A USD1 config (`EPiZbnrThjyLnoQ6QQzkxeFqyL5uyg9RzNHHAudUPxBz`) requires at least 5,000 USD1 with the same sell and lock limits, and one community-token config ("Anon", `6xtK26kfQLo6wfhuZvyFZtP45ausAQmSY1Z2WJPbZNAM`) requires 75% sold and no lock.
- The other 568 configs, including every stock, allow a fund raise of 1 raw unit and no share fee.
- Quote mints: 1 SOL, 5 stablecoins (USDC, USDT, USD1, EURC, DUSD), 94 tokenized stocks, 2 unverified commodity tokens (GOLD, SILV), 1 other RWA (ONyc, reinsurance), and 468 others (community tokens, memecoins, platform tokens such as STONK and PUMP).
- Tokenized stocks: 63 Backpack Securities, 24 Backed xStocks (AAPLx, AMZNx, BRK.Bx, COINx, CRCLx, DFDVx, GLDx, GMEx, GOOGLx, HOODx, INTCx, KOx, MCDx, METAx, MSFTx, MSTRx, NVDAx, PLTRx, QQQx, SPCXx, SPYx, STRCx, TSLAx, VIDAx) and 7 PreStocks pre-IPO tokens (Anduril, OpenAI, Neuralink, Anthropic, Kalshi, Figure AI, Polymarket).
- 329 of 571 quote mints are Token-2022, including all 94 stocks.

Every tokenized-stock quote mint except one Backpack mint carries the same issuer-control extensions:

| Extension | State today | What it means for our pools |
|---|---|---|
| `TransferHook` | present, no hook program set; hook authority is the issuer (`5aMNNL...` for xStocks, `2cVYpa...` for Backpack, `WV9PJN...` for PreStocks) | The issuer can switch a hook on at any time; LaunchLab and CPMM transfers would then need extra accounts, and LaunchLab has a `NoSupportExtension` error, so live curve trading, claims and migration could break without warning |
| `PermanentDelegate` | the issuer | The issuer can move or burn the quote token out of any account, including our curve vaults, fee vaults and CPMM vaults |
| `PausableConfig` | not paused; authority is the issuer | A pause stops every transfer, so buys, sells, fee claims and migration all fail while paused |
| Freeze authority | the issuer | Individual vault or user accounts can be frozen |
| `DefaultAccountState` | `initialized` | If switched to `frozen`, new token accounts (a new platform fee vault, a new CPMM vault at migration) are born frozen |
| `ScaledUiAmount` | multiplier 1 on most, but 10 xStocks and 1 Backpack mint already differ (up to 1.08) | Curves and CPMM work on raw amounts; prices and market caps shown to users must apply the multiplier, which changes on dividends and splits |
| `TransferFeeConfig` | PreStocks only, 3% | Every quote transfer (each buy, sell, fee claim and the migration) loses 3% |
| `ConfidentialTransferMint` | present, no practical effect today | none observed |

Stablecoins and SOL are plain SPL (USDC, USDT, USD1 and EURC have a freeze authority).
26 "other" quote mints carry a transfer fee, mostly reward-style launchpad tokens.
StonkFun already runs pools against these stock mints on mainnet, so they work today; the risk is issuer action later, not current incompatibility.

## Gotchas found

- Devnet funding is the practical blocker: public faucet 429, Helius 1 SOL per project per day, faucet.solana.com behind a captcha.
- Trades must append `[system_program, platform_fee_vault, creator_fee_vault]` after the IDL accounts or they fail with 6018; the IDL does not show this, the SDK builders do.
- Fee vaults are per `(platform_config, quote_mint)` and per `(creator, quote_mint)`, not per pool, so one claim sweeps all pools sharing a quote mint, and claims pay WSOL, not native SOL.
- `claim_creator_fee` on the curve needs the creator's signature and has no permissionless form; after migration the CPMM creator fee can be pushed permissionlessly.
- Only the GlobalConfig's migrate wallet can migrate (6001 on `payer` otherwise); the platform cannot graduate its own pools and depends on Raydium's crank.
- The migrate transaction needs a v0 message with an address lookup table; a legacy transaction is 1,471 bytes.
- A migrated CPMM pool rejects swaps until `open_time` (migration plus 1 second) with `NotApproved` (6000); a bot that trades in the migration block will fail.
- `min_quote_fund_raising` = 1 is accepted but untradeable; 1,000 lamports is tradeable and migrates.
- An exact-in buy larger than what the curve needs is capped and refunded, and completion triggers slightly below the target (997 of 1,000).
- One admin key gives one PlatformConfig (PDA `["platform_config", admin]`); a second mode (for example a reward mode) needs a second admin key, as StonkFun does.
- `platform_cp_creator` decides who owns the CPMM creator fee after graduation: empty means the token creator, set means the platform (StonkFun sets it to itself).
- The post-graduation creator fee rate is fixed by the chosen Raydium CPMM config (devnet 0.25% or up to 1.495%; StonkFun's mainnet config is 1%); we cannot pick an arbitrary rate.
- The CPMM IDL in `research/onchain/programs/` is older than the deployed program (it lacks the creator-fee-share account and the permissionless collect); the SDK builders are current.
- `@solana/web3.js` `extendLookupTable` takes `lookupTable`, not `table`; passing `table` produces an undefined account key.

## Implications for v1

- No on-chain program is needed: one admin key creates the PlatformConfig (about 0.0075 SOL rent), with our fee wallet, `fee_rate`, `creator_fee_rate` and a Raydium CPMM config chosen for the post-graduation creator fee.
- Keep `platform_cp_creator` empty if the creator should earn on-chain after graduation, and take platform revenue from the curve fee plus the Fee Key NFT on 100% of locked LP.
- Pairing works with Raydium's existing 571 GlobalConfigs (94 stocks among them); a quote asset without a GlobalConfig needs Raydium, so list only existing ones.
- Use `restrict_global_config` with `PlatformAllowConfig` accounts as the on-chain allowlist of quote assets we support, and curve rules to pin the launch shape.
- Treat tokenized-stock quote assets as issuer-controlled: show the issuer and controls on the token page, apply `ScaledUiAmount` in pricing, watch for hook, pause and default-state changes, and decide whether to exclude PreStocks for their 3% transfer fee.
- The fee backend needs three jobs: `claim_platform_fee_from_vault` per quote mint, locker `collect_cp_fees` per graduated pool, and optionally `collect_creator_fee_permissionless` to push post-graduation creator fees to creators; curve-phase creator fees need a "claim" button signed by the creator.
- Graduation is Raydium's crank, so monitor pools stuck in status 1 and alert, because we cannot migrate them ourselves.
- Every trade builder (our UI, and any aggregator route) must pass the two fee vaults.
- On mainnet a SOL-paired launch must raise at least 24 SOL, while almost every other quote asset (all stocks included) has no practical minimum, so graduation targets for stock pairs are purely our frontend's choice.
- Referral (share) fees are only possible on the SOL config and two others, so a referral program cannot rely on the on-chain share fee for stock pairs.
- Before launch, rerun this spike on real devnet (`CLUSTER=devnet ./run.sh` after funding) to confirm the crank migrates pools from a brand-new platform.

## How to run

```bash
bun install
./localnet.sh               # terminal 1: devnet fork on 127.0.0.1:8899
./run.sh                    # terminal 2: fund, Q2, Q3, Q3b, Q3c, Q4, Q4b, Q4 probe
CLUSTER=devnet ./run.sh     # after funding 6QHxB5uiQaHbPGjvoMmUC6Uo3vTvnPU4DXXHuy2qKrvr

bun src/q1_devnet_configs.ts              # Q1, read-only devnet
bun src/q4_devnet_migrations.ts           # Q4, crank history, read-only devnet
bun src/q4_devnet_migrate_permission.ts   # Q4, migrate permission simulation, read-only devnet
bun src/q5_mainnet_global_configs.ts      # Q5, read-only mainnet via Helius (HELIUS_API_KEY from ../../.env)
```

Steps resume from `out/<cluster>/state.json`; delete that file for a fresh run.
Every signature and expected failure is appended to `out/<cluster>/evidence.jsonl`, and `.localnet/run.log` (git-ignored, local only) holds the full console output of the clean fork run cited above.

## Files

- `src/common.ts`: cluster selection, keys, Anchor coders, send (legacy or v0 with lookup table), evidence log.
- `src/launchlab.ts`: LaunchLab PDAs and instruction builders (IDL coder for launch and claims, SDK builders for trades).
- `src/cpmm.ts`: CPMM, locker and `migrate_to_cpswap` builders.
- `idl/`: devnet on-chain LaunchLab IDL, mainnet LaunchLab, CPMM and lock IDLs.
- `out/devnet_global_configs.json`, `out/devnet_migrations_sample.json`, `out/devnet_migrate_permission.json`: real devnet evidence.
- `out/localnet/`: state and evidence of the fork run.
- `mainnet_global_configs.json`: question 5 output.
