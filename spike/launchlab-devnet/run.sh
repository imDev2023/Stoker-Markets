#!/usr/bin/env bash
# Run the state-changing spike steps in order. CLUSTER=localnet (default; start ./localnet.sh first) or CLUSTER=devnet.
# Each step reads and writes out/$CLUSTER/state.json, so a rerun resumes where the last run stopped.
set -euo pipefail
cd "$(dirname "$0")"
export CLUSTER="${CLUSTER:-localnet}"
bun src/fund.ts
bun src/q2_platform.ts
bun src/q3_launch_trade_claim.ts
bun src/q3b_token2022.ts
bun src/q3c_trade_without_fee_vaults.ts
bun src/q4_graduate.ts
bun src/q4b_permissionless_creator_fee.ts
bun src/q4_min_fund_raising.ts
