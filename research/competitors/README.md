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
