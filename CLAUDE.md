# stonk-fun-solana

An "open + trustless" asset-paired Solana launchpad on Raydium LaunchLab (working name "Launchpad"), built after researching StonkFun.
No custom on-chain program: our own LaunchLab `PlatformConfig` plus a Cloudflare backend and a Next.js app.

## Read first

1. GitHub issue #5 (`gh issue view 5`) - the v1 PRD; slices are issues #8 to #23, each with "Blocked by". A slice's latest comment is its current status. Every v1 slice except #11 (draft PR #36) and #23 (mainnet go-live, the owner's) is merged; check `gh pr list` for open drafts before starting work, since cloud sessions also push here.
2. `CONTEXT.md` - the domain glossary; use its terms in code, issues and UI copy.
3. `docs/adr/` - fee model (0001), Cloudflare hosting (0002), server-built transactions (0003), key custody (0004), price-banded curve rules (0005, proposed), Reward Rounds and Burn budgets (0006).
4. `spike/launchlab-devnet/README.md` - what LaunchLab really does on devnet, with tx evidence and gotchas.
5. `research/README.md` - background on StonkFun only; don't re-derive its findings.

## Code map

- `packages/chain` - LaunchLab and CPMM PDAs, instruction builders from the IDLs (Anchor coder), launch, curve and pool trades (transfer-fee aware, `transferFee.ts`; referral share fee), migration, decoder. Server-only.
- `packages/db` - Drizzle schema and migrations (`pnpm --filter @launchpad/db generate`).
- `packages/contract` - zod API contract shared by the API and every client.
- `apps/api` - Hono Worker: prepare endpoints, Helius webhook indexer, read API (`docs/api.md`), metadata hosting, API keys (`src/apiKeys.ts`), the operator view and fee-change announcements (`src/routes/operator.ts`), and a Cron Trigger (`scheduled`) with five jobs: the graduation watch (plus `reward-tax-lock`, `src/rewardTax.ts`), the Quote Registry refresh, the Fee Collector (`src/fees`: claims revenue into the operations wallet, sweeps it to the treasury less the Burn's unspent budgets, writes the Ledger), the Reward Engine (`src/rewards`: harvests Reward Tax, snapshots holders, pays rounds) and the Burn and Flywheel (`src/burn`). Every job run is recorded in `job_runs` (`GET /v1/operator/jobs`); a failed run raises a `job_failed` alert, resolved by the next success.
- `apps/web` - Next.js 16 on OpenNext; a pure client of the API. Read `apps/web/AGENTS.md` (Next 16 breaking changes).
- `tools/localnet` - the local chain with the Raydium devnet programs from committed fixtures: `solana-test-validator` when installed, else the embedded Surfpool runtime (`@solana/surfpool`, `LOCALNET_RUNTIME` to force one), plus platform bootstrap, the taxed Token-2022 quote `TAXQ` (1% transfer fee), and `migrateCurve`, which plays Raydium's crank with a local stand-in migrate wallet.
- `tools/stack` - starts Postgres, local chain, API (and optionally web) for tests, plus an alert sink standing in for the operator's chat webhook. `STACK_LOG_DIR` streams each process's output to files.
- `tests/backend` - black-box tests: only HTTP API and chain, never internals.
- `tests/ui` - Playwright browser E2E on the full stack with a Wallet Standard test wallet (`src/wallet.ts`: the key stays in Node, tests approve or decline each signature), plus pixel baselines at 1440 and 390, light and dark.

## Run and test

- Dev: `docker compose up -d` (Postgres on 5442), `pnpm localnet` (chain on 8899, writes `tools/localnet/.ledger/state.json`; migrates sold-out curves within seconds like Raydium's crank, `CRANK=off` to leave them graduating), `apps/api`: `pnpm exec wrangler dev --port 8791 --test-scheduled --var PLATFORM_CONFIG:<from state.json> --var PLATFORM_LOOKUP_TABLE:<lookupTable from state.json>` with `MINT_KEY_SECRET` (32+ random characters) in `apps/api/.dev.vars`, `apps/web`: `pnpm dev` (3100). Migrate the dev DB with `runMigrations` from `@launchpad/db/migrate`.
- Scheduled jobs: `wrangler dev --test-scheduled` runs them on `GET /__scheduled?cron=<cron>`: `*+*+*+*+*` is the graduation watch, `*/5+*+*+*+*` the Quote Registry refresh, `15+*+*+*+*` the Fee Collector, `*/10+*+*+*+*` the Reward Engine, `45+*+*+*+*` the Burn, and a bare `GET /__scheduled` runs all five. The Fee Collector sweeps only with `TREASURY_WALLET` set (required on mainnet). The dev API also needs `PLATFORM_ADMIN` (the admin from `state.json`; `PLATFORM_CONFIG` must be its PDA).
- Tests: `pnpm test:backend` and `pnpm test:ui`, each on its own throwaway stack; the chain takes a free block of ports, so checkouts and agents can run suites side by side (`TEST_RPC_PORT` pins it). `pnpm lint`, `pnpm typecheck`; CI runs both plus the backend suite. Without docker, `STACK_DATABASE_URL=postgres://user:pass@host:port/postgres` makes the stack create a throwaway database on that server instead (the Hyperdrive binding refuses a URL without a password); `STACK_LOG_DIR` keeps each process's log. The backend suite takes about eight minutes on Surfpool.
- Never edit `apps/api`, `packages/*` or `tools/*` sources while a backend run is in progress: `wrangler dev` hot-reloads the API mid-run and the results are meaningless. Tests, web and docs are safe to edit meanwhile.
- UI baselines live in `tests/ui/screenshots/<platform>/`; after an intended UI change, run `pnpm test:ui --update-snapshots=changed` (`all` rewrites matching baselines with byte-different PNGs) and look at every changed image before committing.
- Port 8787 and 3000 belong to other projects on this machine; ours are 3100, 8791, 8899, 5442.

## Settled (do not re-litigate)

- LaunchLab checks a trade's `minimum_amount_out` against what reaches the wallet after the received asset's Token-2022 transfer fee (proven on the fork with a Reward Launch's coin and the taxed quote): quote limits from the wallet-side figure, never the pre-fee one, or the program fails with 6004.
- A Reward Launch (#16) is `initialize_with_token_2022` with a transfer fee at 1%, 3% or 5%; the fee-config authority is LaunchLab's vault authority until migration, then the operations wallet, which the `reward-tax-lock` job revokes after Graduation so the tax can never change; the withdraw-withheld authority is the operations wallet from launch. Curve rule group 0 pins standard coins, group 1 Reward Launches.
- Reward Rounds and the Burn's budgets: `docs/adr/0006-reward-rounds-and-burn-budgets.md`. Burn and Flywheel budgets are shares of the Ledger's revenue less what earlier burns spent; the Fee Collector's sweep leaves the unspent budgets in the operations wallet. A payout's own Reward Tax is withheld again, so a paid round can open the next one.
- Referral share fee (#21): a trade names `share_fee_rate` and the referrer's Quote Asset account (the account before the system program among the remaining accounts); the rate is capped by the GlobalConfig's `max_share_fee_rate` (SOL 1%, most configs including every stock 0), so `referralShare` on a Quote Asset says whether it applies. The Platform Fee and Creator Fee shown anywhere come from the chain (`GET /v1/platform`), never a constant; a change is announced ahead (#22) and applied by the cold admin key.

- StonkFun is a LaunchLab `PlatformConfig` pair plus an off-chain backend; its ~0.5% creator share is an off-chain forward that broke for ~3 weeks (`research/social/telegram-group-insights.md`).
- Asset pairing is not StonkFun-only: pump.fun has admin-listed custom quotes since 2026-09-09 (`research/competitors/README.md`). Our wedge is open (any Raydium GlobalConfig quote, 571 on mainnet) plus trustless (Creator Fee paid by the chain).
- Only Raydium's migrate wallet can graduate a pool, and its crank migrates a new platform's pools within seconds (proven on real devnet 2026-09-27).
- A new Quote Asset needs Raydium to create its GlobalConfig; only the Platform Token's is planned (after it graduates).
- The disclaimer's excluded list (US, UK, Canada, sanctioned countries) is confirmed by the owner.
- Metadata stays on R2 plus Postgres for v1, on a domain we keep for good; a coin's metadata URL can never change after launch, and the API refuses a temporary address on mainnet. Arweave only via ArDrive Turbo, since Irys retires its Arweave endpoints on 2026-11-01 (#23).

## Traps

- `apps/web` never imports `@launchpad/chain`, the Raydium SDK or Anchor (GPL, ADR 0003); ESLint and a UI test enforce it.
- The `PlatformConfig` address is derived from the admin key and the admin can never change (ADR 0004).
- Our platform sets `restrict_curve_param`, so every launch must pass the curve-rule PDA as the last account; a mismatched shape fails with 6025 `CurveParamNotMatchPlatformRule`.
- Trades must include the platform and creator fee-vault accounts or fail with 6018.
- A Creator Fee vault is per (Creator, Quote Asset) across every LaunchLab platform, and `claim_creator_fee` names no platform: its balance can include fees earned elsewhere, and the Indexer keeps claims only for Creators who launched with us. To see claims made without our site, the Helius webhook must watch the vault authority PDA (seed `creator_fee_vault_auth_seed`), which every claim passes.
- `simulateTransaction` returns account lamports with the network fee already taken off; subtracting `getFeeForMessage` again double-counts it.
- The UI tests' overflow check flags any element whose box runs past the viewport, even inside a scrolling container; a sideways-scrolling `pre` must hold plain text, not a `code` child.
- A launch transaction is about 980 bytes with the longest name, so a launch with a First Buy only fits Solana's 1,232 bytes through the Platform Lookup Table (`PLATFORM_LOOKUP_TABLE`, owned by the operations wallet, built from `platformLookupAddresses`). A SOL First Buy also needs SOL's own accounts in it (1,256 bytes without); other Quote Assets fit on the shared accounts alone (about 1,020 bytes), and a table holds at most 256 addresses, so on mainnet list SOL and the busiest Quote Assets only.
- A retry must never mint a second coin: launch mint keys are derived from `MINT_KEY_SECRET` and a nonce in `launch_drafts`, so `POST /v1/launches/:mint/prepare` rebuilds the same address. Airdrop transactions for a wallet are only handed out again once every earlier one has expired (`airdrop_recipients.sendable_until`).
- Decode Helius payloads as raw RPC `getTransaction` JSON (`accountKeys` strings); web3.js's parsed `getTransaction` object has a different shape.
- `solana account --output json` dumps `rentEpoch` as u64 max; a JSON round-trip turns it into a float the validator rejects, so write 0.
- TypeScript is pinned to 6.0 because typescript-eslint doesn't support 7. pnpm 11 needs `allowBuilds` in `pnpm-workspace.yaml` for native deps.
- A `container-type: inline-size` box has no width of its own: in a column flex with `align-items: flex-start` it collapses to 0 and anything sized in `cqi` vanishes. `PairMark` measures its glyphs to fit, because per-character estimates break on wide letters like W.
- `migrate_to_cpswap` wants the CPMM `support_mint` PDAs in the pool's token order (sorted mint bytes), not quote then base; WSOL sorts first for all but about 1 in 40 mints, so the wrong order fails only now and then with 2502 `RequireKeysEqViolated`.
- A v0 transaction through an address lookup table is dropped until the table's last extension is rooted (about 32 slots, 15 s locally); create tables ahead of use. The migration needs one (1,471 bytes as legacy); the local migrate wallet's table is made at bootstrap.
- A migrated CPMM pool opens one second after migration by the chain's clock, which lags the wall clock on the local validator; check `Pool.chainTime` against `openTime`, never `Date.now()`.
- The deployed CPMM's `collect_creator_fee` wants one account more than Raydium's published IDL: the `creator_fee_share` PDA (creator, CPMM config) last, even when it doesn't exist, or it fails with 3005 `AccountNotEnoughKeys`. Raydium's LP-lock program only has a legacy IDL; `packages/chain/idl/lock.json` is it converted to the current Anchor format.
- `ledger_entries` is append-only in Postgres itself (a trigger rejects UPDATE, DELETE and TRUNCATE): fix a wrong entry with a new one, never an edit.
- Buys paid with SOL (#19) swap through a route source: Jupiter on mainnet, and locally `raydium-cpmm`, the SOL-USDC and SOL-JTO CPMM pools `tools/localnet/src/routes.ts` seeds (NVDAx has none on purpose). Only exact-out swaps are used and the Quote Asset passes through a temporary account that must close empty, so nothing is left in the wallet. A routed buy only fits a transaction through the Platform Lookup Table, so a `raydium-cpmm` route pool's accounts must be in it (the local chain adds them); Jupiter brings its own tables; Jupiter has no exact-out route to xStocks, and a Token-2022 transfer-fee Quote Asset can't be routed, since withheld fees stop the account closing.
- Sending the same transaction twice in a row (same signers, same instructions) makes web3.js wait for a new finalized blockhash and fail after 10 s ("Unable to obtain a new blockhash"); batch such work into one transaction.
- A Playwright element screenshot taller than the viewport is taken scrolled, with the sticky site header drawn over its top (wallet address included); `visual.spec.ts` unsticks the header for those shots.
- CPMM's ExceededSlippage is 6005 (LaunchLab's is 6004), and CPMM emits `SwapEvent` to the log (`Program data:`), not through a self-invocation like LaunchLab's `TradeEvent`.
- `Keypair.publicKey` returns a new `PublicKey` on every access: compare keys with `.equals`, never `===`.
- web3.js `confirmTransaction` rejects with a bare object (`{ InstructionError, stacks: [] }` on Surfpool) when the transaction failed before the subscription; `confirmOutcome` and `sendLanding` in `tests/backend/src/client.ts` and `landedError` in the web app treat that as a landed failure, not a lost connection.
- Job summaries are stored and logged as JSON: never put a `bigint` in one (`Do not know how to serialize a BigInt` kills the whole scheduled run); convert to strings, as `budgetsView` does.
- A burn transaction that closes the operations wallet's coin account gets that rent back; the Ledger's "SOL spent" adds the refund back, or a tiny buy shows as negative.
- Surfpool's websocket is not on `rpc+1`; `tools/localnet` forwards the adjacent ports so web3.js's default derivation works. `pkill -f` on a pattern that matches the calling shell kills the shell; kill by pid.
- Drizzle `sql` templates with a `Date` parameter fail under our `postgres` client settings; pass `toISOString()` and cast `::timestamptz`.
- `grep` in this shell is aliased to ugrep with different flags; use `/usr/bin/grep` in scripts.
- Test `next dev` runs rewrite `apps/web/next-env.d.ts` to point at their throwaway build folder; the web `typecheck` runs `next typegen` first, so ignore that file.
- A Quote Asset with no curve rule account is unrestricted even with `restrict_curve_param` on, so the Quote Registry refresh (`/__scheduled`, run once by `tools/stack` at startup) gives every GlobalConfig a rule, a closed one when unpriced (ADR 0005). The dev API needs `OPERATIONS_KEY` (the operations key as a JSON byte array, `tools/localnet/.keys/operations.json`) in `apps/api/.dev.vars` and one `curl localhost:8791/__scheduled` before anything can launch.
- The local quote mints are clones of mainnet mints whose mint authority the local admin key holds; fund a test wallet with `mintLocalQuote`, never by transfer.
- Write every trade row (curve or pool) through `insertTrade` in `apps/api/src/market.ts`, never `db.insert(trades)`: it also moves the Launch's `launch_markets` price, which the board's market caps and sorts read.
- Never classify a Quote Asset by its name: a pump.fun coin on mainnet calls itself "GoPro - Backpack Securities". Categories come from the mint address (SOL, stablecoins) or the issuer's freeze authority or permanent delegate (tokenized stocks), in `apps/api/src/quotes/categories.ts`.
- A curve's coins sit in `launchlabPdas.vault(pool, mint)`, owned by the LaunchLab vault authority PDA, not in an associated token account; after Graduation the CPMM authority PDA owns the pool's.
- On a cold `next dev` load, hydration can land after `networkidle`, so a UI check that needs client script (a fitted `PairMark`, anything set in an effect) must poll, as `expectNoTruncatedText` does.
- A Playwright full-page screenshot doesn't scroll, so `loading="lazy"` images far down a long page load or not by timing; `snap` in `visual.spec.ts` scrolls through the page first. Never force `loading="eager"` from a test: it causes a hydration mismatch. Masks paint even over elements hidden inside a closed `<details>`, so mask only visible ones.
- lightweight-charts lays out its chart with a `<table>`, so in UI tests scope table queries to the Trades region. Playwright won't click an `aria-disabled` option without `force: true`.
- `agent-browser screenshot` needs absolute paths. Firecrawl is out of credits.
- Devnet faucets are rate-limited and faucet.solana.com is closed to agents; the owner's default Solana CLI wallet holds devnet SOL.
- StonkFun's Terms of Use ban scraping and copying: never use its frontend, copy or branding; never open its `/admin`, `/api/admin/*` or `/integrators`.
- `research/social/telegram-group/` is the owner's private group export (other people's messages): gitignored, never published.

## Multica dashboard

This project is mirrored on the owner's Multica dashboard (workspace Pandora) as project `c5707009-2225-4a7d-94e3-93a9eed5d951`.
GitHub issues on `imDev2023/stonk-fun-solana` are the source of truth; Multica only mirrors them (see `docs/agents/issue-tracker.md`).
At the end of every session, after the tracker is updated, run the `multica-sync` skill for this project: mirror ticket statuses, add any new tickets, and refresh the project's "Current step" section.
Every Multica write passes `--no-start` and no ticket is ever assigned to an agent, so the sync never starts an agent run.
If the `multica` CLI is not signed in, say so in the session summary and stop anyway; the sync never blocks the work.

## Agent skills

### Issue tracker

Issues live in GitHub Issues on `imDev2023/stonk-fun-solana` and are mirrored to Multica; external PRs are not a triage surface. See `docs/agents/issue-tracker.md`.

### Triage labels

Default vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `CONTEXT.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.
