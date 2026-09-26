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
- Not scanned yet: Meteora Dynamic Bonding Curve platforms (Believe, Bags, Jupiter Studio and others) and pump.fun itself, which run on their own programs rather than LaunchLab.
