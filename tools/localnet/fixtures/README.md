# Local chain fixtures

Snapshots of the Raydium devnet programs and accounts the local validator loads, so tests never depend on devnet being reachable.
Dumped from devnet on 2026-09-27 with `solana program dump` and `solana account --output json`.

- `programs/`: LaunchLab `DRay6f...`, CPMM `DRaycp...`, LP lock `DRay25...` and Metaplex Token Metadata `metaqb...`.
- `accounts/7ZR4zD...json`: the devnet SOL GlobalConfig; the local chain rewrites its migrate wallet to the local admin key, because only that wallet may migrate and there is no Raydium crank locally.
- `accounts/5MxLgy...json`: devnet CPMM config index 0 (0.25% LP fee plus 0.25% creator fee).
- `accounts/3oE58B...json` and `accounts/7BCZCN...json`: the CPMM create-pool fee account and the CPMM permission PDA migration needs.
- `quotes/`: quote mints cloned from mainnet on 2026-09-27, one per case the Quote Registry must handle: USDC (SPL Token, 6 decimals), NVDAx (a Token-2022 xStock, 8 decimals, with every issuer extension a tokenized stock carries), JTO (SPL Token, 9 decimals) and BULLWHALE (a Token-2022 pump.fun coin, 6 decimals, left unpriced), plus the Metaplex metadata accounts of USDC and JTO.

Raydium's admin creates GlobalConfigs, so the local chain plants its own: at startup it copies the SOL GlobalConfig into a GlobalConfig for every mint in `quotes/`, at that mint's PDA under the devnet program, with only the quote mint changed.
Adding a quote mint to `quotes/` is all it takes to make it a Quote Asset locally.

Refresh them with `pnpm --filter @launchpad/localnet refresh-fixtures` only when Raydium upgrades the devnet programs.
