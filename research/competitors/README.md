# Launchpad competitors

Snapshot taken 2026-09-26.
Sources: DefiLlama fees API (`llama_revenue.json`, `llama_fees.json`), and a full scan of every Raydium LaunchLab pool on mainnet via Helius (`launchlab_platforms.py`, `launchlab_platforms.json`, `launchlab_quote_mix.json`).

## Revenue across all launchpads (DefiLlama, 179 tracked)

| Launchpad | Chain | Revenue 24h | Revenue 7d | Revenue 30d |
|---|---|---:|---:|---:|
| pump.fun | Solana | $1.23M | $8.19M | $32.55M |
| Pons V2 | Robinhood Chain | $0.26M | $2.43M | $24.17M |
| StonkFun | Solana | $0.78M | $8.94M | $23.64M |
| Flap sh | BSC, X Layer, Monad, Robinhood | $0.15M | $1.86M | $9.74M |
| BONK.fun | Solana | $0.14M | $2.16M | $4.20M |
| o1 Launchpad | Base, Robinhood Chain | $0.01M | $0.16M | $2.99M |
| Graphite Protocol | Solana | $0.09M | $1.44M | $2.81M |
| Binance Alpha | multi-chain | $0.03M | $0.40M | $2.16M |
| LaunchLab (Raydium's own cut) | Solana | $0.11M | $0.88M | $1.74M |
| Meteora DBC | Solana | $0.02M | $0.09M | $0.23M |
| Bags | Solana, Robinhood Chain | $0.01M | $0.03M | $0.16M |
| Moonshot Create | Solana | $0.00M | $0.02M | $0.09M |
| Jupiter Studio | Solana | $0.00M | $0.00M | $0.08M |

StonkFun out-earned pump.fun over the last 7 days.
Revenue is concentrated: launchpads earned $110.0M in total over 30 days, the top 5 took 85.8% of it, and 154 of the 179 earned under $100K.

## Raydium LaunchLab platforms (on-chain, all 1,430,641 pools)

2,376 platform configs have at least one pool, but a handful dominate.

| Platform | Pools | Share | Graduated | Grad rate | Platform fee | On-chain creator fee | Distinct quote tokens | Non-SOL pools |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| letsbonk.fun | 1,148,907 | 80.3% | 12,582 | 1.10% | see note | 0.5% | 104 | 21.9% (almost all USD1) |
| StonkFun | 131,867 | 9.2% | 3,133 | 2.38% | 1.0% | 0% | 503 | 91.0% |
| Raydium (own UI) | 97,128 | 6.8% | 550 | 0.57% | 0.75% | 0% | 12 | 0.7% |
| RevShare | 11,589 | 0.8% | 1 | 0.01% | 0.1% | 0% | 2 | 0% |
| cook.meme | 5,178 | 0.4% | 26 | 0.50% | 1.0% | 0% | 1 | 0% |
| Everyone else (2,371 configs) | about 36,000 | 2.5% | | | | | | |

Note: the letsbonk.fun value shown is for its largest config; its six configs may differ.
On-chain creator fees are common (letsbonk.fun, Bankr, TRiX, PossumLabs, Pumpkin.fun all set 0.5%), so they are not a differentiator on their own.
StonkFun is the only LaunchLab platform doing "pair with anything" at scale: 503 quote tokens and 91% of pools paired with something other than SOL.

## Direct competitors to the "pair with anything" idea

- On Solana: none at scale on LaunchLab; letsbonk.fun's non-SOL pairing is a stablecoin (USD1), not assets.
- On Robinhood Chain (stock tokens native to the chain): Pons V2 ($24.2M 30-day revenue), BaseStonk, StonkBrokers, PAIR and others; see the owner's Robinhood Chain knowledge base for the 22 archived launchpads there.

## Meteora DBC and pump.fun (asset pairing check)

Snapshot taken 2026-09-26.
"Asset-paired" means the bonding curve's quote token is neither SOL/WSOL nor a stablecoin (tokenized stocks, memecoins, other tokens).
Sources: a full scan of every Meteora DBC pool and config (`meteora_dbc_scan.py`, `meteora_dbc_quote_mix.json`, `meteora_dbc_platforms.json`; the 250 MB per-config dump `meteora_dbc_configs.json` is git-ignored), and pump.fun's public IDL plus a key-space sample of its curves (`pumpfun_quote_check.py`, `pumpfun_quote_mix.json`).

| Launchpad | Program | Who can add a quote token | Pools or curves | Asset-paired | Asset-paired share | Distinct asset quotes | Graduated (asset-paired) |
|---|---|---|---:|---:|---:|---:|---:|
| StonkFun (reference, above) | Raydium LaunchLab | anyone, any mint | 131,867 | 119,976 non-SOL | 91.0% non-SOL | 503 quotes in total | see LaunchLab table |
| pump.fun (since 2026-09-09) | `6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P` | pump.fun admin only (QuoteControl list, 181 mints) | about 22.9M (estimate) | about 64,000 (estimate, 95% range 60,000 to 68,000) | 0.28% | 139 seen in sample | 7 of 849 sampled |
| Meteora DBC, all platforms | `dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN` | anyone for SPL mints; Token-2022 mints need a Meteora TokenBadge | 1,697,859 | 10,430 | 0.61% | 714 | 843 |
| EmberCurve (largest DBC asset-pairer) | Meteora DBC | its own configs | 3,242 | 3,090 | 95.3% | 125 | 95 |

Meteora DBC (all 1,697,859 pools, 481,064 configs with pools, 731 quote mints):
- SOL 85.6% (1,453,722 pools), stablecoins 13.8% (233,707; USDC alone 231,787), asset-paired 0.61% (10,430).
- Asset-paired breaks down into other tokens 8,930 (EMBER 1,640, ANTFUN 1,146, MET 1,071, JUP 516, ZEC 346), xStocks 1,243 (NVDAx 271, SPYx 173, AAPLx 91) and Backpack or Ondo stock tokens 257.
- The big DBC platforms are SOL- or USDC-only: Moonshot (175,058 pools, all USDC), Jupiter Studio (45,410 pools: USDC 38,701, SOL 6,512, JUP 197), Trends (14,859, SOL), Anoncoin (13,889, SOL); Bags creates one config per launch and every sampled Bags launch was SOL.
- The asset-paired pools are spread over 1,786 fee claimers; the largest is EmberCurve (fee claimer `GZjYfGyUNQfDChcQ66Gc3ZMcQqPEisyRYe1nPyQhP9bp`, named in the public ember-metrics repo) with 3,090, then a partner self-named "bingan" with 1,124 (almost all ANTFUN).
- Platform names come from DefiLlama's dimension-adapters (Moonshot, Jupiter Studio, Trends, Bags), the ember-metrics README, or self-declared on-chain PartnerMetadata (Anoncoin, bingan); other fee claimers are left unnamed.
- Believe could not be tied to a config: none of the latest 40 transactions of its known signer (`5qWya6UjwWnGVhdSBL3hyZ7B45jbk6Byt1hwd7ohEGXE`, DefiLlama; late July 2026) touched a DBC config.

pump.fun (claim from the StonkFun Telegram group: confirmed on-chain):
- The bonding curve gained a `quote_mint` field in the 2026-05-07 IDL for USDC pairs; `Global.whitelisted_quote_mints` holds only USDC (`EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`).
- Custom pairs came with a program upgrade at slot 445691021 (2026-09-09 19:30 UTC, tx `5bD2JZEjvh8BhrJWbQy6QwhSSDRVJvqkeJNxajCdK84o35bnKL8G7KDkAJo7ahFGSdzrpUvdFFUdzhPZeL9fnjZv`).
- Two minutes later a Squads vault ran `InitializeQuoteControl` (slot 445691266, tx `3ULbKDUPuEVADdBEnmmY8owHD1SzjrsDnULe2Qk6nmfLmeDBq8gYrCw9n68TTpRRdTkGBpoFGAoYTPQzsCfJgqH3`), creating the admin-only QuoteControl PDA `6z6GDdfb2AjR9ZhJmAUQ5cipJCVxQvLJhB2H8mCwTFBP`, then `AddQuoteControlMint` at slot 445692801.
- The first custom-pair coin followed at slot 445692804 (tx `55SRkfh6LjDbXjmjKsTqmvPHJGh1eAcfiA57m5LMNEjQHhD5agziiygFqRSbBVvQcAcvaAGtBFXgYrwz8dkTPGH`), bonding curve `5GesdFM5SRNV6RUAy2uWxxCyFYA7CDaA79Kp8C4dSVX6` paired with SPYx.
- The public IDL (pump-fun/pump-public-docs, refreshed 2026-09-12) documents it: `create_v2` accepts a quote mint admitted by QuoteControl, including Token-2022 xStock-style mints, and such coins may carry their own `creator_fee_bps`.
- QuoteControl now lists 181 mints: xStocks, Backpack and Ondo stock tokens, WBTC, ZEC, XMR, DOGE, PUMP, MET, HYPE and a long tail of pump.fun memecoins.
- A sample of 303,888 curves (40 random pages, 1.33% of the key space) puts asset-paired coins at 0.28% of about 22.9M curves, led by PUMP, SPCX (Backpack), WBTC, ZEC, SPYx and NVDAx; USDC adds about 101,500 more.
- Cross-check: 71,726 transactions have touched the QuoteControl PDA since 2026-09-09, about 4,000 a day.
- PumpSwap (`pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA`) accepts any quote mint in `create_pool`, and `migrate_v2` carries the curve's quote mint over, so custom-pair coins keep their pair after graduating.

Conclusion: on Meteora DBC the claim holds, because asset pairing is only 0.6% of pools and the largest asset-pairing platform (EmberCurve) has about 3,100 pools.
The claim no longer holds for pump.fun: since the 2026-09-09 upgrade it has launched roughly 64,000 asset-paired coins in 17 days, about half of StonkFun's all-time non-SOL total, and xStocks and other stock tokens are among its top quotes.
What still sets StonkFun apart is openness and focus: pump.fun admits only the 181 quotes on its admin list and asset pairs are 0.3% of its launches, while StonkFun takes any mint (503 so far) and 91% of its pools are non-SOL.

## Peak (launchonpeak.fun), checked 2026-11-04

Sources: the site's pages and its documented keyless read API (`/api/coins`, `/api/coin/:mint`, `/api/health`), DexScreener's token API, Telegram's public preview, and the chain, read with our own LaunchLab and CPMM decoders (`packages/chain`).
The pages themselves are not kept here, because this repository is public.

Peak is a Raydium LaunchLab platform for Solana memecoins, live since 2026-10-27, built on Vercel and Supabase, with its own coin $PEAK (`APLPiTjBWzwfZ5U1TBeqLF9XJ7dV7XKGe7j4BZhkDray`).
Its pitch is fairness: no copycat tickers, no buys in the creation block, and a DEX Screener profile paid from each coin's fees.

Numbers at about 06:00 UTC that day:
- 105 coins from 78 launcher wallets, 10 graduated, 67 still trading after 24 hours by its own count; its busiest days were 2026-11-01 (25 launches) and 2026-11-02 (32).
- 588 SOL of fees collected since launch (its stats page), 104 SOL of it in the last 24 hours (its feed); the five biggest coins earned 52% of it.
- Its public pages account for 39.4 SOL of buybacks and $5.5K of DEX Screener funds; nothing public says where the rest of the 588 SOL went.
- $PEAK: $639K market cap, $77K liquidity, $666K of 24-hour volume (DexScreener).
- Its Telegram channel had 84 subscribers, and DefiLlama does not list it.

On-chain it runs three PlatformConfigs, all with the fee wallet `8Uvc5sffYGqcfqYQXmM3U1gFtNKzRLCV9g38AZ2Joub8`, a 0% Creator Fee, no curve rules (`restrict_curve_param` 0) and every graduated pool's LP burned (`burn_scale` 100%, so no Fee Key).

| PlatformConfig | Name | Curve Platform Fee | CPMM config after Graduation | Used for (the 100 coins in its feed) |
|---|---|---:|---|---|
| `BDTgTEvMyGXjJSDHnCdVG4zRgBufvREVrfAksYgTNjHW` | Peak | 1.00% | `CRRS5i...`: 0.25% trade fee, 1% creator fee (the config ours names) | SOL coins until 2026-11-03, and the RAY, HYPE, CARDS and xStock pairs |
| `FcaxvE2A5UipS6Bbtd1McsPjFvzEhrqE75Sq7AXWPbDY` | Peak PEAK | 1.50% | `FMmwToGq...`: 0.005% trade fee, 1.495% creator fee | PEAK pairs since 2026-11-02, and all four SOL coins launched after 01:35 UTC on 2026-11-04 |
| `7adqEP7wCfsvKaoKFnrHb5Mk9mK5NHDvR1vbyz5ouCAE` | Peak Deep | 2.00% | `627Jx6eN...`: 0.25% trade fee, 1.25% creator fee | the deep curve (a 200 SOL target), since 2026-11-02 |

- The site never states a rate; it calls the fee small. Two PlatformConfigs' `web` field still reads `http://localhost:3000` and the first one's `launch-raydium.vercel.app`.
- Raydium created a GlobalConfig for $PEAK (`FZtxGmLsVyE3Hx2KK5Qaok5QJH6NabEoUHeQCst7g97n`, first used 2026-11-02 18:18 UTC) six days after $PEAK's pool opened; mainnet had 647 constant-product GlobalConfigs that day.
- Pairs: 74 of the 100 coins are paired with SOL, 11 with PEAK (the launch form's default), 4 with RAY, 3 with HYPE, 7 with xStocks and 1 with CARDS; the form offers 23 hand-picked pairs, the two pre-IPO tokens OPENAI and ANTHROPIC among them.
- $YETI's creation transaction is signed by a Peak deployer and the mint alone (one `initialize_v2`, no buy), and in all 100 pools the LaunchLab creator is a Peak wallet, never the launcher.
- Each coin's metadata JSON and image sit in Peak's Supabase storage bucket, named by metadata that can no longer change.

What it offers:
- A blind launch: the launcher pays about 0.23 SOL (0.2 SOL of it a launch fee) to Peak, whose deployer creates the pool 3 to 15 seconds later with a mint derived from a server secret, and the payment comes back if creation fails.
- A bundle check about 90 seconds in: every wallet that bought in the first 20 slots is traced to the wallet that funded it, and links to the launcher or between buyers are flagged on the coin page with the supply they still hold.
- The ticker, the name (ignoring case, spaces and symbols) and the launch tweet are locked for 3 days; lookalike tickers and identical images are flagged, never refused.
- A DEX Screener fund per coin: with a banner, part of the coin's fees fills about $299, the profile is ordered at Graduation, and the page shows Funding, Funded, Paid and Live from DEX Screener's order status.
- Fees buy $PEAK in chunks of up to 2 SOL at most once an hour and burn it in the same transaction; 9.09% of each buy is airdropped to holders of any Peak coin, weighted by the value held, at random snapshots about four times a day, with Peak paying the rent; holders of new coins also get airdrops in the coin's pair token.
- Each coin's own share of its fees adds to its liquidity after Graduation (the default, LP burned) or buys back and burns the coin, chosen at launch.
- Creator rewards since 2026-11-04: a share of the coin's fees, claimable every 6 hours once the coin is 3 days old, larger as the coin's highest market cap grows, and forfeited by a rug in the first 3 days; the rate is not stated, and the FAQ still says a creator gets no fee share.
- A clean Graduation (no linked early buyers, no top holder funded by the launcher, the launcher at 10% of supply or less) refunds the 0.2 SOL launch fee and gives the wallet a permanent Graduated dev badge.
- A deep curve for a 0.3 SOL launch fee, starting at about 122 SOL of market cap and graduating at 200 SOL.
- The Oath: a free signed pledge to hold a coin, counted 1.5 times for holder rewards, with a bonus if the coin graduates; breaking it bars that wallet from launching on Peak.
- The Summit: one coin featured each day, drawn at random with odds tilted by market cap, volume and youth; flagged coins are never drawn.
- Callers: anyone can open a caller page; a call needs 1% of supply held for 24 hours and is graded in public after 3 days, a call that doubles earns SOL from a pool every trade fills, new wallets brought in earn the caller a share of Peak's fees for 90 days, and strikes suspend a caller.
- A community takeover: holders of 0.5% of supply sign a request for a new logo, banner, links and description, which Peak reviews and sends on to DEX Screener.
- Also: charity coins through donate.gg, a builder tag, a numbered launch registry with Founding 100 badges, wallet-signed comments, public creator profiles, a watchlist, a portfolio, downloadable share cards, trade sounds, a live trade ticker, an ideas form, a proof-of-work human check, and a launch verification script on its developers page.

Against Stoker:
- The same 1.00% and 0% split on its first PlatformConfig and the same CPMM config, but its newest SOL coins pay 1.5% plus Raydium's 0.25% on the curve and 1.5% after Graduation, where ours pay 1% plus Raydium's 0.25% and then 1.25%.
- After Graduation it burns the LP and collects about 0.95% (the creator fee less Raydium's 5%), where we keep the Fee Key and collect about 1.16%.
- Its creator share is new, claimed, locked for 3 days and unstated; ours is about 0.5% of every trade from the first one, forwarded without a claim, every payment on the Ledger.
- Its blind launch takes the creation out of the launcher's hands, so the trust moves from the dev to Peak, which knows each mint seconds before anyone else; our launch is signed in the Creator's wallet (ADR 0003) and may carry a First Buy, which is the very thing its pitch is against.
- Its bundle check traces funders, the part ADR 0013 deferred; our "Before you buy" card marks snipers by slot and amount only.
- Its copy lock is 3 days and flags images, where our Copy Protection is 7 days and refuses the image and near copies too.
- Its pairs are 23 hand-picked, ours any Raydium GlobalConfig; even so, 74% of its coins chose SOL.
