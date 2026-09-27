#!/usr/bin/env bash
# Start a local solana-test-validator forked from devnet: the exact devnet LaunchLab, CPMM, lock and Metaplex programs,
# the CPMM config and fee account, and a copy of the devnet SOL GlobalConfig whose migrate wallet is our admin key.
set -euo pipefail
cd "$(dirname "$0")"
bun src/patch_global_config.ts
exec solana-test-validator --reset --quiet --ledger .localnet/ledger --url https://api.devnet.solana.com \
  --clone-upgradeable-program DRay6fNdQ5J82H7xV6uq2aV3mNrUZ1J4PgSKsWgptcm6 \
  --clone-upgradeable-program DRaycpLY18LhpbydsBWbVJtxpNv9oXPgjRSfpF2bWpYb \
  --clone-upgradeable-program DRay25Usp3YJAi7beckgpGUC7mGJ2cR1AVPxhYfwVCUX \
  --clone-upgradeable-program metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s \
  --clone 5MxLgy9oPdTC3YgkiePHqr3EoCRD9uLVYRQS2ANAs7wy \
  --maybe-clone 3oE58BKVt8KuYkGxx8zBojugnymWmBiyafWgMrnb6eYy \
  --maybe-clone 7BCZCNvf2TnXavEAtrf7JRAZyLGJ3mJsqQhyLkuqC1Tb \
  --account 7ZR4zD7PYfY2XxoG1Gxcy2EgEeGYrpxrwzPuwdUBssEt .localnet/global_config_patched.json
