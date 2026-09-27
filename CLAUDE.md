# stonk-fun-solana

An "open + trustless" asset-paired Solana launchpad on Raydium LaunchLab (working name "Launchpad"), built after researching StonkFun.
No custom on-chain program: our own LaunchLab `PlatformConfig` plus a Cloudflare backend and a Next.js app.

## Read first

1. GitHub issue #5 (`gh issue view 5`) - the v1 PRD; slices are issues #8 to #23, each with "Blocked by". A slice's latest comment is its current status.
2. `CONTEXT.md` - the domain glossary; use its terms in code, issues and UI copy.
3. `docs/adr/` - fee model (0001), Cloudflare hosting (0002), server-built transactions (0003), key custody (0004).
4. `spike/launchlab-devnet/README.md` - what LaunchLab really does on devnet, with tx evidence and gotchas.
5. `research/README.md` - background on StonkFun only; don't re-derive its findings.

## Code map

- `packages/chain` - LaunchLab PDAs, instruction builders from the IDL (Anchor coder), launch transaction, decoder. Server-only.
- `packages/db` - Drizzle schema and migrations (`pnpm --filter @launchpad/db generate`).
- `packages/contract` - zod API contract shared by the API and every client.
- `apps/api` - Hono Worker: prepare endpoints, Helius webhook indexer, read API, metadata hosting.
- `apps/web` - Next.js 16 on OpenNext; a pure client of the API. Read `apps/web/AGENTS.md` (Next 16 breaking changes).
- `tools/localnet` - `solana-test-validator` with the Raydium devnet programs from committed fixtures, plus platform bootstrap.
- `tools/stack` - starts Postgres, local chain, API (and optionally web) for tests.
- `tests/backend` - black-box tests: only HTTP API and chain, never internals.
- `tests/ui` - Playwright browser E2E on the full stack with a Wallet Standard test wallet (`src/wallet.ts`: the key stays in Node, tests approve or decline each signature), plus pixel baselines at 1440 and 390, light and dark.

## Run and test

- Dev: `docker compose up -d` (Postgres on 5442), `pnpm localnet` (chain on 8899, writes `tools/localnet/.ledger/state.json`), `apps/api`: `pnpm exec wrangler dev --port 8791 --var PLATFORM_CONFIG:<from state.json>`, `apps/web`: `pnpm dev` (3100). Migrate the dev DB with `runMigrations` from `@launchpad/db/migrate`.
- Tests: `pnpm test:backend` and `pnpm test:ui`, each on its own throwaway stack; the chain takes a free block of ports, so checkouts and agents can run suites side by side (`TEST_RPC_PORT` pins it). `pnpm lint`, `pnpm typecheck`; CI runs both.
- UI baselines live in `tests/ui/screenshots/<platform>/`; after an intended UI change, run `pnpm test:ui --update-snapshots=all` and look at every changed image before committing.
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
- Decode Helius payloads as raw RPC `getTransaction` JSON (`accountKeys` strings); web3.js's parsed `getTransaction` object has a different shape.
- `solana account --output json` dumps `rentEpoch` as u64 max; a JSON round-trip turns it into a float the validator rejects, so write 0.
- TypeScript is pinned to 6.0 because typescript-eslint doesn't support 7. pnpm 11 needs `allowBuilds` in `pnpm-workspace.yaml` for native deps.
- A `container-type: inline-size` box has no width of its own: in a column flex with `align-items: flex-start` it collapses to 0 and anything sized in `cqi` vanishes. `PairMark` measures its glyphs to fit, because per-character estimates break on wide letters like W.
- `grep` in this shell is aliased to ugrep with different flags; use `/usr/bin/grep` in scripts.
- Test `next dev` runs rewrite `apps/web/next-env.d.ts` to point at their throwaway build folder; the web `typecheck` runs `next typegen` first, so ignore that file.
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
