# Local chain fixtures

Snapshots of the Raydium devnet programs and accounts the local validator loads, so tests never depend on devnet being reachable.
Dumped from devnet on 2026-09-27 with `solana program dump` and `solana account --output json`.

- `programs/`: LaunchLab `DRay6f...`, CPMM `DRaycp...`, LP lock `DRay25...` and Metaplex Token Metadata `metaqb...`.
- `accounts/7ZR4zD...json`: the devnet SOL GlobalConfig; the local chain rewrites its migrate wallet to the local admin key, because only that wallet may migrate and there is no Raydium crank locally.
- `accounts/5MxLgy...json`: devnet CPMM config index 0 (0.25% LP fee plus 0.25% creator fee).
- `accounts/3oE58B...json` and `accounts/7BCZCN...json`: the CPMM create-pool fee account and the CPMM permission PDA migration needs.

Refresh them with `pnpm --filter @launchpad/localnet refresh-fixtures` only when Raydium upgrades the devnet programs.
