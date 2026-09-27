#!/usr/bin/env bash
# Re-dump the devnet programs and accounts the local chain loads (see fixtures/README.md).
set -euo pipefail
cd "$(dirname "$0")/fixtures"
for p in DRay6fNdQ5J82H7xV6uq2aV3mNrUZ1J4PgSKsWgptcm6 DRaycpLY18LhpbydsBWbVJtxpNv9oXPgjRSfpF2bWpYb DRay25Usp3YJAi7beckgpGUC7mGJ2cR1AVPxhYfwVCUX metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s; do
  solana program dump -u devnet "$p" "programs/$p.so"
done
for a in 7ZR4zD7PYfY2XxoG1Gxcy2EgEeGYrpxrwzPuwdUBssEt 5MxLgy9oPdTC3YgkiePHqr3EoCRD9uLVYRQS2ANAs7wy 3oE58BKVt8KuYkGxx8zBojugnymWmBiyafWgMrnb6eYy 7BCZCNvf2TnXavEAtrf7JRAZyLGJ3mJsqQhyLkuqC1Tb; do
  solana account -u devnet "$a" --output json --output-file "accounts/$a.json" >/dev/null
done
