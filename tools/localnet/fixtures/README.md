# Local chain fixtures

Snapshots of the Raydium devnet programs and accounts the local validator loads, so tests never depend on devnet being reachable.
Dumped from devnet on 2026-09-27 with `solana program dump` and `solana account --output json`.

- `programs/`: LaunchLab `DRay6f...`, CPMM `DRaycp...`, LP lock `DRay25...` and Metaplex Token Metadata `metaqb...`.
- `accounts/7ZR4zD...json`: the devnet SOL GlobalConfig; the local chain rewrites its migrate wallet to a local stand-in key (`.keys/migrate.json`), because only that wallet may migrate and there is no Raydium crank locally.
- `accounts/DHHEU8...json`: the data of mainnet CPMM config index 11 (`CRRS5i...`: 0.25% trade fee plus the 1% creator fee the runbook picks), placed at the address index 11 derives under the devnet CPMM program the local chain runs (`DRaycpLY...`, with the bump byte and the `owner` rewritten to match), because LaunchLab's `create_platform_config` refuses a config that is not its index's PDA (`InvalidCpSwapConfig`, 6016) and refuses one owned by another program (ConstraintOwner, 2004). The local PlatformConfig names it since 2026-10-25, so the local site reads mainnet's creator figure.
- `accounts/5MxLgy...json`: devnet CPMM config index 0 (0.25% LP fee plus 0.25% creator fee), the devnet rehearsal's, and locally the SOL route pools' (`routes.ts`), which stand in for the real pools Jupiter routes through.
- `accounts/3oE58B...json` and `accounts/7BCZCN...json`: the CPMM create-pool fee account and the CPMM permission PDA migration needs.
- `quotes/`: quote mints cloned from mainnet on 2026-09-27, one per case the Quote Registry must handle: USDC (SPL Token, 6 decimals), NVDAx (a Token-2022 xStock, 8 decimals, with every issuer extension a tokenized stock carries), JTO (SPL Token, 9 decimals) and BULLWHALE (a Token-2022 pump.fun coin, 6 decimals, left unpriced), plus the Metaplex metadata accounts of USDC and JTO.

- `mainnet/`: a snapshot of mainnet's Quote Assets, taken on 2026-10-10 with `pnpm --filter @launchpad/localnet snapshot` (a mainnet `RPC_URL`, and `JUPITER_API_KEY` for the keyed host): `quotes.json` holds every GlobalConfig's quote mint account, its Metaplex metadata account where it has one, and the config's referral allowance; `market.json` holds Jupiter's price, logo, verified flag, liquidity and tags for each, in the shapes of its Price API v3 and Tokens API v2.

Raydium's admin creates GlobalConfigs, so the local chain plants its own: at startup it copies the SOL GlobalConfig into a GlobalConfig for every quote mint of the set it runs, at that mint's PDA under the devnet program, with only the quote mint (and the referral allowance) changed.
The tests' chain runs the cases in `quotes/`; adding a quote mint there is all it takes to make it a Quote Asset in the tests.
The development chain (`pnpm localnet`) runs mainnet's whole set from `mainnet/` beside the cases, so the site quotes what mainnet quotes, and the Jupiter stand-in in `tools/stack` (`pnpm stand-ins`) serves `market.json` to the API as Jupiter would.
The local chain makes the local admin key the mint authority of the cases' mints, so tests can hand wallets USDC or a stock to trade with (`mintLocalQuote`); mainnet's other mints keep their real authorities, which the Quote Registry reads an asset's kind from (ADR 0010).
The lookup tables list the cases and the snapshot's forty deepest markets, as mainnet's Platform Lookup Table will list SOL and the busiest Quote Assets: a coin paired with any other asset still launches, but not with a First Buy.
Retake the snapshot with the same command when Raydium adds Quote Assets worth seeing locally; prices are the day's and only ever serve the local chain.

Refresh them with `pnpm --filter @launchpad/localnet refresh-fixtures` only when Raydium upgrades the devnet programs.
