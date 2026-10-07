# StonkFun research and build assessment

Snapshot taken 2026-09-26.
Sources: stonkfun.xyz (every public page, its public API and its internal page feeds), on-chain data via Helius, DexScreener, GeckoTerminal, Jupiter charts, X @LaunchOnSF and Telegram @StonkFunXyz.

## Verdict

Yes, we can build a platform like this, and it needs no smart-contract work.
StonkFun has no program of its own.
It is a Raydium LaunchLab "platform" (two `PlatformConfig` accounts) plus a large off-chain backend that claims fees, pays holders, forwards creator fees and runs a buyback-and-burn flywheel.
Anyone can create a LaunchLab `PlatformConfig`; mainnet already holds 2,729 of them from launchpads such as letsbonk.fun, America.Fun, tap.fun and only.meme.
The hard part is not the technology but distribution, liquidity and regulatory exposure.

## What StonkFun is

A Solana launchpad whose pitch is "launch coins paired with anything": a new coin's quote asset can be SOL, $STONK, tokenized stocks (xStocks, Backpack, Sunrise), pre-IPO shares (PreStocks), commodities, leveraged tokens or any other token.
Live since 2026-07-23.
139,770 tokens launched by 47,278 creator wallets, 3,985 graduated.
Revenue: $1.25M in August, $25.1M in September to date, currently $0.5M to $2.1M per day.
$2.67B total volume by 2026-09-14.
$STONK (`6GmAFSYs4gk3FDao5FzzySQpPZaWsa4rUJHacpMpUNgx`) sits at about $236M market cap, with about 18% of supply burned.
Only 26 graduated tokens are above $1M market cap and 252 above $100K; the long tail is dead memecoins.

## How it works on-chain

| Piece | Program / account |
|---|---|
| Bonding curve (current path; first pool on-chain 2026-08-28, public release 2026-09-05) | Raydium LaunchLab `LanMV9sAd7wArD4vJFi2qDdfnVhFxYSUg6eADduJ3uj` |
| Post-graduation AMM | Raydium CPMM `CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C` |
| LP lock and Fee Key NFTs | Raydium Liquidity Locking `LockrWmn6K5twhz3y9w1dQERbmgSaRkfnTeTKbpofwE` |
| Earlier launch paths | Raydium CLMM `CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK`, pump.fun and PumpSwap |
| StonkFun platform configs | standard `4E876qZTE9FJMrBzgVtBrSrzz2TLivB5Y5QXPjB4gZL7`, reward `6BwHHDg3u1854jC8PDLXvR4spTcLNaoBxLJNGC4nTESt` |
| Fee wallet (also Fee Key holder and CPMM creator) | `5CEbueQnq1Ym2uSSx2xXds3jQAqT1BDnkA59RZobSPAG` |
| Reward-token transfer-fee authority | `5KXDF6QnqhBj72hDtJNkkpFaQVUfbFXNybMsp3DiK6tD` |

Launch shape enforced by 568 curve rules per config: 1B supply, 793.1M sold on the curve, constant-product curve, migration to CPMM, Token-2022 base mint, no vesting, and a 1% or 3% transfer fee on reward tokens.
Quote-token pairing uses per-quote `GlobalConfig` accounts created by Raydium's admin; they are shared, so a new platform can reuse the 503 that already exist, but a brand-new quote token needs Raydium to create its config.

## Fee model

| When | Fee | Recipient |
|---|---|---|
| Curve trade | 0.25% | Raydium |
| Curve trade | 1.00% | StonkFun platform fee |
| After graduation | 0.25% LP fee (84% to locked LP) | StonkFun via Fee Key NFT |
| After graduation | 1% CPMM creator fee | StonkFun (it is set as `platform_cp_creator`) |
| Reward tokens | 1% or 3% Token-2022 transfer tax | withheld, harvested by StonkFun, paid to holders |

On-chain the creator fee rate is 0.
The "about 0.5% to the creator" advertised on the launch page is paid off-chain by a StonkFun cron job, so creators trust StonkFun to forward it.
Launching costs about 0.012 SOL in rent; there is no platform launch fee on the LaunchLab path.
About 60% of platform revenue is swapped to $STONK on Jupiter and burned; a 5% flywheel share buys back and burns the top 10 platform coins.

## What we would have to build

On-chain configuration only:
- Two `PlatformConfig` accounts (standard and reward) with our fee rate, fee wallet, `platform_cp_creator`, LP split and transfer-fee authority.
- Curve rules to pin the launch shape.

Backend (this is the real product; StonkFun's route manifest shows about 25 admin routes and 14 cron jobs):
- Launch builder API that constructs LaunchLab initialize transactions, uploads metadata to Irys/Arweave and bundles an optional dev buy.
- Indexer fed by Helius webhooks, plus a per-minute scanner that adopts pools carrying our platform id.
- Fee claimer for curve fees, CPMM creator fees and locked-LP Fee Key positions.
- Transfer-fee harvester and pro-rata holder reward distributor with payout thresholds and a minimum holding.
- Creator-fee forwarder.
- Buyback-and-burn flywheel via Jupiter.
- Revenue ledger, quote-token pricing, stats and a public API.
- Airdrop mode, geo-blocking and ToS acceptance.

Frontend: Next.js with the Jupiter wallet kit, swap plugin and chart API, a token board, launch form, token pages, and revenue, flywheel and rewards pages.

## Risks

- **Raydium dependency:** LaunchLab and the locker have no public source and no verified build, and all four Raydium programs are upgradeable by a single key (`FytDrVzDybM1TwFQPGb8qaxZR7dBCzNeqT3vtQsceZQK`); Raydium also controls which quote tokens are pairable.
- **Regulatory:** pairing memecoins with tokenized stocks and pre-IPO shares, and paying holders from a transfer tax, look securities-like; StonkFun geo-blocks 20+ jurisdictions and disclaims heavily.
- **Custody and trust:** hot wallets control every fee flow and the transfer-fee authority on reward tokens, which can change a live token's tax.
- **Competition:** StonkFun already has network effects: $STONK is the quote for about 9,000 launches, @LaunchOnSF has 54K followers, and its revenue funds constant buybacks.
- **Legal on the research itself:** StonkFun's Terms of Use (accepted during this research on the owner's instruction) ban scrapers and copying; build from Raydium's public IDLs and SDK, not from StonkFun's frontend, copy or branding.
- **Licensing:** raydium-sdk-V2 is GPL-3.0, which matters if it ships inside client code we distribute; raydium-cp-swap and raydium-clmm are Apache-2.0.

## Gaps in the collection

- Telegram: the public channel has only 2 posts; the community is a private group behind a Safeguard verification button, and bots cannot read past history, so reading it needs a Telethon user-account login.
- X: 70 of 1,209 posts collected with full metrics; the rest needs X cookies or the official API.
- The integrator docs are password-protected, and the admin routes were deliberately not probed.
- Telegram's pinned post names the launchpad `stonkpad.xyz` while X uses `stonkfun.xyz`; treat stonkpad.xyz as unverified.

## Where everything is

Moved to the private repository `imDev2023/Stoker-Markets-research` on 2026-10-07, before this repository went public (StonkFun's Terms of Use ban copying):

- `website/`: page text (`pages/`), screenshots, Terms of Use, public API dumps (`api/`, including all 139,770 assets and all 3,985 graduated tokens in `api/bulk/`), internal page feeds, Jupiter chart candles, frontend bundles and route manifest (`meta/buildManifest.js`).
- `onchain/`: on-chain report (`onchain/README.md`), decoded accounts, 29 full transactions, program binaries and IDLs, pool dumps and decoder scripts.
- `social/`: X profile and posts, Telegram channel, and a links table (`social/README.md`).
- `scripts/pull_api.py`: rate-limited puller for StonkFun's public API.
- `scripts/telegram_export.py`: read-only Telegram group export through the owner's own account (Telethon), run by the owner.
