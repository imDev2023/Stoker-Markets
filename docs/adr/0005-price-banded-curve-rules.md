# Price-banded curve rules, managed by the hot operations wallet

Status: accepted by the owner on 2026-10-04 (#23), after the devnet rehearsal ran on it; amended 2026-10-24 (owner): a band moves at 5% of drift, not 2.5%.

A Graduation Target is fixed at launch as 85 SOL-equivalent in the Quote Asset's raw units, so for anything but SOL it depends on a price the chain cannot see.
LaunchLab curve rules compare launch parameters with constants, so an exact on-chain pin of `TotalFundRaisingB` only works for SOL.
Each Quote Asset's curve rule therefore accepts a band of Graduation Targets, 10% either side of the target at the latest price, alongside the same exact pins on the rest of the launch shape.
The API fixes each launch's target from the live price at the moment it builds the transaction, and refuses a launch whose target falls outside the band on-chain.
The Quote Registry refresh, a Cron Trigger every five minutes, moves a band once its centre is 5% away from the current target.
A launch is priced live when the API builds it and checked against the band on-chain before it is handed out, so the 5% between the move threshold and the band's edge covers the price move within one refresh interval, and a launch outside it is refused with "price moved" rather than failing on-chain.
The threshold was 2.5% until 2026-10-24: on mainnet that rewrote 4,000 to 5,900 rules a day (about 0.03 SOL in fees, 11 SOL a year), 541 of 586 priced assets in one day and the most volatile ones every other run, because every move is its own transaction (one asset's two groups fill most of one) and a diffusing price crosses a threshold about four times as often when the threshold is halved.
SOL needs no price and keeps an exact pin.

We found on the local fork that a GlobalConfig with no curve rule account is not restricted at all, even with `restrict_curve_param` on.
So the refresh gives every GlobalConfig a rule: a band when the Quote Asset has a reliable price, and an unsatisfiable group (a raise of at least 1 and at most 0) when it has none.

Rule writes are signed by the hot operations wallet, which the cold admin key names as the PlatformConfig's `curve_rule_manager` once at setup.
The admin key stays offline (ADR 0004); moving bands every few minutes with a hardware wallet or multisig is not practical.

## Considered Options

- Pin the target exactly and rewrite the pin on every price change: any price move between building and landing a launch would make it fail on-chain.
- Pin only the shape and a loose floor on the raise, and enforce the target off-chain by ignoring launches that don't match: API callers could launch off-target coins on our PlatformConfig, which is what curve rules exist to stop.
- An on-chain allowlist of Quote Assets (`restrict_global_config`): still needs the rules to pin the shape, and the PRD rules out an allowlist.
- Have the cold admin sign rule updates: safe, but incompatible with a price that moves.

## Consequences

- A launch sent straight to the chain can pick any target within 10% of the band's centre, which may itself sit up to 5% from the live SOL-equivalent; launches built by our API always use the exact target at the live price.
- A leaked operations key can loosen or close any curve rule, letting off-shape coins launch on our PlatformConfig or stopping launches, but it cannot touch fees, which only the admin key can change; the admin key recovers by naming a new curve rule manager.
- A GlobalConfig Raydium creates is unrestricted on our PlatformConfig until the next refresh writes its rule, so the window is up to five minutes; the Indexer ignores any launch outside our launch shape, so such a coin never reaches the board. It cannot tell an in-window Graduation Target from the band it would have had, so an on-shape launch with an off-price target in that window is still listed.
- The operations wallet pays rent for one rule account per GlobalConfig (0.00375 SOL each, 2.27 SOL for mainnet's 613 on 2026-10-14) and one transaction fee for each band move.
- A refresh writes at most 120 rules, missing ones first, so the first run on mainnet needs a few runs to cover every Quote Asset.
- If the price source is down, launches against non-SOL Quote Assets are refused until it returns; existing bands stay as they were.
