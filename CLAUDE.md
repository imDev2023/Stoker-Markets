# stonk-fun-solana

An "open + trustless" asset-paired Solana launchpad on Raydium LaunchLab (working name "Launchpad"), built after researching StonkFun.
No custom on-chain program: our own LaunchLab `PlatformConfig` plus a Cloudflare backend and a Next.js app.

## Read first

1. GitHub issue #5 (`gh issue view 5`) - the v1 PRD; slices are issues #8 to #23, each with "Blocked by". A slice's latest comment is its current status.
2. `CONTEXT.md` - the domain glossary; use its terms in code, issues and UI copy.
3. `docs/adr/` - fee model (0001), Cloudflare hosting (0002), server-built transactions (0003), key custody (0004), price-banded curve rules (0005, proposed).
4. `spike/launchlab-devnet/README.md` - what LaunchLab really does on devnet, with tx evidence and gotchas.
5. `research/README.md` - background on StonkFun only; don't re-derive its findings.

## Code map

- `packages/chain` - LaunchLab and CPMM PDAs, instruction builders from the IDLs (Anchor coder), launch, curve and pool trades, migration, decoder. Server-only.
- `packages/db` - Drizzle schema and migrations (`pnpm --filter @launchpad/db generate`).
- `packages/contract` - zod API contract shared by the API and every client.
- `apps/api` - Hono Worker: prepare endpoints, Helius webhook indexer, read API, metadata hosting, and a Cron Trigger (`scheduled`) that watches Graduations and raises operator alerts, and runs the Fee Collector (`src/fees`): it claims revenue into the operations wallet, sweeps it to the treasury and writes the Ledger. Every job run is recorded in `job_runs` (`GET /v1/operator/jobs`).
- `apps/web` - Next.js 16 on OpenNext; a pure client of the API. Read `apps/web/AGENTS.md` (Next 16 breaking changes).
- `tools/localnet` - `solana-test-validator` with the Raydium devnet programs from committed fixtures, plus platform bootstrap and `migrateCurve`, which plays Raydium's crank with a local stand-in migrate wallet.
- `tools/stack` - starts Postgres, local chain, API (and optionally web) for tests, plus an alert sink standing in for the operator's chat webhook. `STACK_LOG_DIR` streams each process's output to files.
- `tests/backend` - black-box tests: only HTTP API and chain, never internals.
- `tests/ui` - Playwright browser E2E on the full stack with a Wallet Standard test wallet (`src/wallet.ts`: the key stays in Node, tests approve or decline each signature), plus pixel baselines at 1440 and 390, light and dark.

## Run and test

- Dev: `docker compose up -d` (Postgres on 5442), `pnpm localnet` (chain on 8899, writes `tools/localnet/.ledger/state.json`; migrates sold-out curves within seconds like Raydium's crank, `CRANK=off` to leave them graduating), `apps/api`: `pnpm exec wrangler dev --port 8791 --test-scheduled --var PLATFORM_CONFIG:<from state.json> --var PLATFORM_LOOKUP_TABLE:<lookupTable from state.json>` with `MINT_KEY_SECRET` (32+ random characters) in `apps/api/.dev.vars`, `apps/web`: `pnpm dev` (3100). Migrate the dev DB with `runMigrations` from `@launchpad/db/migrate`.
- Scheduled jobs: `wrangler dev --test-scheduled` runs them on `GET /__scheduled?cron=<cron>`: `*+*+*+*+*` is the graduation watch, `*/5+*+*+*+*` the Quote Registry refresh, `15+*+*+*+*` the Fee Collector, and a bare `GET /__scheduled` runs all three. The Fee Collector sweeps only with `TREASURY_WALLET` set (required on mainnet).
- Tests: `pnpm test:backend` and `pnpm test:ui`, each on its own throwaway stack; the chain takes a free block of ports, so checkouts and agents can run suites side by side (`TEST_RPC_PORT` pins it). `pnpm lint`, `pnpm typecheck`; CI runs both.
- UI baselines live in `tests/ui/screenshots/<platform>/`; after an intended UI change, run `pnpm test:ui --update-snapshots=changed` (`all` rewrites matching baselines with byte-different PNGs) and look at every changed image before committing.
- Port 8787 and 3000 belong to other projects on this machine; ours are 3100, 8791, 8899, 5442.

## Settled (do not re-litigate)

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
- CPMM's ExceededSlippage is 6005 (LaunchLab's is 6004), and CPMM emits `SwapEvent` to the log (`Program data:`), not through a self-invocation like LaunchLab's `TradeEvent`.
- `Keypair.publicKey` returns a new `PublicKey` on every access: compare keys with `.equals`, never `===`.
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
