# stonk-fun-solana

An "open + trustless" asset-paired Solana launchpad on Raydium LaunchLab named Stoker (ticker STOKER, domain `stoker.markets`; the packages keep their `@launchpad/` scope), built after researching StonkFun.
No custom on-chain program: our own LaunchLab `PlatformConfig` plus a Cloudflare backend and a Next.js app.
Since 2026-11-04 the site's rebuild runs in `/Volumes/Farhan/Work Folder/Dev/AI/new-stoker` (`imDev2023/new-stoker`, a copy of this repository at `12dbc10` with its history; Multica project `e5972df9`): the whole website from scratch in the Playground's design, with programs of our own allowed, its map is issue #1 there, and the relay runs it as the project `new-stoker`.
This repository is the fallback: it still deploys the live mainnet API and the devnet rehearsal, and site work (phase 6, #137; Advanced Charts, #126) belongs in new-stoker unless the owner says otherwise.

## Read first

1. GitHub issue #5 (`gh issue view 5`) - the v1 PRD; slices are issues #8 to #23, each with "Blocked by", and a slice's latest comment is its current status.
2. `CONTEXT.md` - the domain glossary; use its terms in code, issues and UI copy.
3. `docs/adr/` - the decisions; `docs/agents/settled.md` opens with what each one holds.
4. `spike/launchlab-devnet/README.md` - what LaunchLab really does on devnet, with tx evidence and gotchas.
5. `research/README.md` - background on StonkFun only; don't re-derive its findings.
6. `docs/runbooks/mainnet.md` - the go-live runbook (#23): what an agent prepared, and what only the owner can do.
7. `docs/agents/` - this file's long form, read on demand: `code-map.md`, `run-and-test.md`, `settled.md`, `history.md` and `traps/`.
   Read the file the Traps index below names before the work it covers; none of them is loaded for you.

### The frontier (2026-11-13)

- **Next unit:** the small units of the rewards roadmap, one per session: #186, #183 and #185; #184's other half (the Burn's and the Flywheel's budgets pointed at liquidity) is open.
- **Row-Level Security (#201)** is built and merged (migration `0030`, the lint check, the stack's plain owner role); the issue stays open until devnet has taken it and Supabase's advisor shows neither finding on both projects.
- **Done on the rewards roadmap:** #187 (Budget Table), #188 (Creator Ladder), #113 with #184's Creator half (Creator Earnings Destinations), #196 (volume rebates), #199 (Holding Weight).
- **Devnet rehearsal** (`devnet.stoker.markets`, `api-devnet.stoker.markets`, and the apex with a devnet notice): its database is through `0026` and both Workers run `main` as of 62bfb75, so it is behind by #193, #198, #199 and #201.
  It takes migrations `0027` to `0030`, then the API, then the web: the owner's one line in #193's last comment, repeated on #198, #199 and #201.
  After every merge the rehearsal is redeployed from `main`, the database first when `packages/db` changed, and the record goes on the issue.
- **Mainnet:** `stoker-api` is live on `api.stoker.markets` on its build from before these merges; its database is through `0020` and takes `0021` to `0030` at go-live.
  Go-live is #23: the checklist is `docs/runbooks/mainnet.md` section 12, and #23's latest comment says which item is open.
- **The owner still owes:** the devnet redeploy line above; on #23, item 9 (Always Use HTTPS), step 5b's backup disk, Helius Developer, then items 8, 10 and 12 at go-live; a Budget Table version with a share for `rebates` before the rebates pay anything (runbook section 17); the Reward Rounds' version 2 before the first Reward Launch (runbook section 6), and with it or after it the first Holding Weights (section 18); answers on #159; closing #128 and #129; three calls each on #193, #198 and #199 that are theirs to overrule (`docs/agents/settled.md`); and on #201, Supabase's advisor read again on both projects once devnet has `0030` (mainnet's tables by the block on the issue, or at go-live).
- **Open PRs on 2026-11-13:** #203 (`hook-trap`, another session's), #168 (`sign-in`) and #132 (`design-research`: merge its `docs/design/research/` or close it).
  Check `gh pr list` before starting work, since cloud sessions also push here, and push every working branch.
- **Site work** (phase 6, #137, and anything in the Playground's design) belongs in new-stoker unless the owner says otherwise.

## Hard rules

- This repository is public.
  Nothing from stonkfun.xyz or from the private `imDev2023/Stoker-Markets-research` ever comes in, stonkfun.xyz is never fetched, and its copy is never pasted (`docs/agents/traps/research-legal.md`).
- Never edit `apps/api`, `packages/*` or `tools/*` while a backend run is in progress, a comment included, nor `apps/web` during a UI run: the stack hot-reloads and the results are meaningless.
  Finish the whole change, typecheck, then run.
- Ports 8787, 3000 and 8792 belong to other projects or sessions; ours are 3100, 8791, 8797, 8798, 8899 and 5442, and a worktree's own stack takes 8793 and 3101.
- Never stop, reload or migrate under the owner's dev stack.
  A worktree whose contract or migrations differ gets its own API and database, and keys are never copied between worktrees or replaced under a running suite (`docs/agents/traps/dev-stacks.md`).
- Agents cannot write Worker secrets, deploy production or change DNS; devnet deploys pass.
  Hand the owner one `! ...` command, tested for zsh first.
  Never delete the `stoker-api` Worker: `OPERATIONS_KEY` can never be put back from a file.
- `TWITTERAPI_API_KEY` is never set from a session, and the mentions code is never removed (ADR 0018).
- `apps/web` never imports `@launchpad/chain`, the Raydium SDK or Anchor (GPL, ADR 0003); it is a pure client of the API.
- UI baselines exist for `darwin` only, so the UI suite never runs in CI or a cloud session.
  After an intended UI change run `pnpm test:ui --update-snapshots=changed`, look at every changed image, and prove it with a second, plain run.
- Force pushes are blocked for agents: merge `main` in, never rebase a pushed branch.
  Deleting a branch goes to the owner as one `!` line; `gh issue` and `gh pr` writes and `git worktree remove` are allowed.
- Devnet SOL is never asked of the owner: `devnet-airdrop <address> --target <SOL>` in the background.
- Say "coin", never "token", and use `CONTEXT.md`'s terms in code, issues and copy.

## Code map

The full map, with every file and endpoint, is `docs/agents/code-map.md`.

- `packages/chain` - LaunchLab and CPMM PDAs, instruction builders, trades, migration, the decoder; server-only.
- `packages/db` - Drizzle schema and migrations (`pnpm --filter @launchpad/db generate`).
- `packages/contract` - the zod API contract shared by the API and every client.
- `packages/arweave` - ANS-104 data items and ArDrive Turbo's HTTP endpoints.
- `apps/api` - the Hono Worker: prepare endpoints, the Indexer, the read API, the operator view, and the Cron Trigger's five jobs (graduation watch, Quote Registry, Fee Collector with the Creator Forward and the rebates, Reward Engine, Burn).
- `apps/web` - Next.js 16 on OpenNext, a pure client of the API; read `apps/web/AGENTS.md` first.
- `tools/localnet` - the local chain with Raydium's devnet programs; `tools/stack` - the throwaway stack and its stand-ins; `tools/mainnet` - the go-live scripts.
- `tests/backend` - black-box tests over HTTP and the chain; `tests/ui` - Playwright E2E with a test wallet, plus pixel baselines at 1440 and 390, light and dark.

## Run and test

The long form is `docs/agents/run-and-test.md`.

- Dev: `docker compose up -d` (Postgres on 5442), `pnpm localnet` (chain on 8899, writes `tools/localnet/.ledger/state.json`), `pnpm stand-ins` (8797 and 8798), the API with `pnpm exec wrangler dev --port 8791 --test-scheduled` and its `--var`s from `state.json`, the web with `pnpm dev` (3100).
  One `curl localhost:8791/__scheduled` before anything can launch.
- Tests: `pnpm test:backend` (about eight minutes) and `pnpm test:ui`, each on its own throwaway stack; `pnpm lint` and `pnpm typecheck`.
  CI runs lint, typecheck and the backend suite on every push; run the suite a change touches locally and say so in the PR.
- The UI suite and any web build need TradingView's library, fetched with `GITHUB_TOKEN`, `GH_TOKEN` or the signed-in `gh` (ADR 0017).
- Without Docker: `STACK_DATABASE_URL=postgres://user:pass@host:port/postgres`; `STACK_LOG_DIR` keeps each process's log.
- Devnet rehearsal: the database first when a migration is pending, then `pnpm exec wrangler deploy --env devnet` in `apps/api`, then in `apps/web` `NEXT_PUBLIC_API_URL=https://api-devnet.stoker.markets pnpm exec opennextjs-cloudflare build` and `... deploy --env devnet`; `CI=1` keeps wrangler from prompting.
- `grep` is aliased to ugrep in this shell: use `/usr/bin/grep` in scripts.

## Settled (do not re-litigate)

One line each; read the full bullet in `docs/agents/settled.md` before building on a verdict.

Chain and launches:

- Slippage: LaunchLab checks `minimum_amount_out` against what reaches the wallet after the transfer fee, so quote from the wallet-side figure (6004 otherwise).
- A Reward Launch (#16) is `initialize_with_token_2022` with a transfer fee of 1% to 5%, locked after Graduation; rule group 0 is standard coins, group 1 Reward Launches.
- The launch shape (#166, ADR 0005): every new coin is 1 trillion at 6 decimals with 79.31% sold; 1B coins keep their own shape.
- Copy Protection (ADR 0012): for seven days nobody else may launch a coin's name, ticker or image; afterwards a label names the original.
- Referral share fee (#21): capped by the GlobalConfig; every fee shown comes from the chain (`GET /v1/platform`), never a constant.
- Only Raydium's migrate wallet graduates a pool, and its crank does so within seconds.
- A new Quote Asset needs Raydium to create its GlobalConfig; only the Platform Token's is planned.
- Permanent metadata (ADR 0008, #44): Arweave data items signed at prepare time, posted through ArDrive Turbo; never Irys; R2 is the cache alone.

Fees and Creator Earnings:

- Creator Earnings (ADR 0009, #85): 1.00% Platform Fee and 0% Creator Fee on-chain, the Creator's share forwarded off-chain; nothing to claim; `/creator` is the wallet's own page.
- The Creator Ladder (ADR 0020, #188): 50%, 60% after 15 Active Days, 70% after 30; a tier is the coin's, recorded once, and never falls.
- Creator Earnings Destinations (ADR 0011, #113): wallet, holders, burn or liquidity, fixed at launch; a coin with a rule has a pot of its own.
- The Graduation Fee (ADR 0015, #157): withheld from the Creator's share of that coin, never from a wallet or the holders' Reward Tax.
- Fee figures (owner, 2026-10-30): `/fees` is the only page with a percentage or a rate; every other page says what a fee is for and links there.
- After Graduation a trader pays 1.25% and the platform collects about 1.16%; the Creator's exact pool share starts at 0.475%, said as about 0.5%.

Rewards and budgets:

- Rewards (owner, 2026-11-09, #187): nothing is paid in STOKER to Creators; every new program is a row of the Budget Table; Airdrop Mode (#49) is parked.
- The Budget Table (ADR 0019, #187): six rows of the Platform Net, version 1 at 60 / 5 / 0 / 0 / 0 / 35; versions are announced ahead and never edited; trader programs take 2000 bps together at most.
- Volume rebates (ADR 0021, #196): every trade earns by the Platform Fee it paid, in UTC weeks, paid in SOL from 0.01 SOL.
- Holding Weight (ADR 0022, #199), shown as Diamond Hands: in every Reward Round a coin kept longer counts for more, coin by coin, by announced steps; a sell takes the newest coins first; the treasury counts once.
- Reward Rounds and the Burn's budgets: ADR 0006; a budget is a share of the net revenue less what earlier burns spent.
- The Payout Asset (#43): a Reward Launch pays in the coin or in its Quote Asset, fixed at launch; a run sells 0.5% of the reserve at most.
- The treasury is an eligible holder in Reward Rounds (owner, 2026-10-04).

Platform, keys and policy:

- The keys (owner, 2026-10-06): four file keypairs whose addresses start with `Stoke`; launches are open to anyone; the Platform Token uses the chosen-mint-key path (#75).
- The region gate (ADR 0014): nothing is withheld upfront; a feature leaves one country only by an operator's row, on request.
- The disclaimer: US, UK, Canada and sanctioned countries (`EXCLUDED_REGIONS`); the first visit's welcome blocks nothing.
- Chart marks (ADR 0018, #160): the trade marks are live; the mentions stay built but off.
- Row-Level Security (#201): on every table with no policy, never forced; the API is the tables' owner; a new table takes `.enableRLS()`.

Positioning:

- StonkFun is a LaunchLab `PlatformConfig` pair plus an off-chain backend; its creator share is an off-chain forward.
- Asset pairing is not StonkFun-only; our wedge is open (any Raydium GlobalConfig quote) plus accountable (every forward on a public Ledger).

Design and brand:

- The design phase (#37): dark by default with a toggle (`data-scheme`); the spacious landing, the terminal everywhere else; the character is called Stoker.
- Colour: Teal is the default, picked on the real site; Cobalt and Violet are `?theme=` alternates; the amber-to-ember heat ramp stays for the brand's moments.
- The Teal hue fix (owner, 2026-10-29): the up colour is a yellow-green, the accent untouched; `contrast.mjs` and `type.mjs` fail the lint.
- The slogan: "No one picks your pair. You do."; "paired with" and "priced in" are the site's words.
- The mark: E2, the heating ring on a dark tile, and the O of STOKER.
- The character: the salamander and the Furnace Cat; every brand image is made in the marketing folder, never here.

## Traps

Each file under `docs/agents/traps/` holds what went wrong before; read the one that matches the work before starting it.

- `chain.md` - before `packages/chain`, `tools/localnet`, `tools/mainnet`, a transaction's accounts or size, a lookup table, or a key.
- `api-jobs.md` - before `apps/api`: a job, the Indexer, the Ledger, the Burn, a Quote Asset's data, Jupiter, Helius or Turbo.
- `backend-tests.md` - before writing or debugging a `tests/backend` file; the files share one stack, in any order.
- `ui-tests.md` - before changing anything a baseline shows, adding a spec, or debugging a shot or a flow.
- `web.md` - before `apps/web`: server and client components, the header, CSS containers, TradingView, share images.
- `dev-stacks.md` - before starting a dev stack or a suite from a worktree, or reading a run that failed with timeouts or HTTP 500.
- `deploy-ops.md` - before a deploy, a secret, a cron, a database or a new table, the rehearsal, an RPC endpoint or the domain's email.
- `shell-tools.md` - before a shell or perl one-liner, `agent-browser`, an artifact page, or merging a stacked branch.
- `research-legal.md` - before any research on StonkFun or a competitor.

## Keeping this file small

This file is loaded whole into every session, so it holds the frontier, the hard rules and the indexes, and nothing else.
`pnpm lint` fails when it passes 20,000 bytes (`scripts/claude-md-size.mjs`).
A new trap goes to its file under `docs/agents/traps/`, a verdict's full text to `docs/agents/settled.md` with one line here, a new file or endpoint to `docs/agents/code-map.md`.
A merge, a redeploy or a dated record goes to the log in `docs/agents/history.md`; update the frontier above in place instead of adding to it.
A SessionStart hook (`.claude/hooks/ff-main.sh`) fast-forwards the main checkout when it is clean and nothing runs from it, and says so when it could not.

## Multica dashboard

This project is mirrored on the owner's Multica dashboard (workspace Pandora) as project `c5707009-2225-4a7d-94e3-93a9eed5d951`.
GitHub issues on `imDev2023/Stoker-Markets` are the source of truth; Multica only mirrors them (see `docs/agents/issue-tracker.md`).
At the end of every session, after the tracker is updated, run the `multica-sync` skill for this project: mirror ticket statuses, add any new tickets, and refresh the project's "Current step" section.
Every Multica write passes `--no-start` and no ticket is ever assigned to an agent, so the sync never starts an agent run.
If the `multica` CLI is not signed in, say so in the session summary and stop anyway; the sync never blocks the work.

## Agent skills

### Issue tracker

Issues live in GitHub Issues on `imDev2023/Stoker-Markets` and are mirrored to Multica; external PRs are not a triage surface. See `docs/agents/issue-tracker.md`.

### Triage labels

Default vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `CONTEXT.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.
