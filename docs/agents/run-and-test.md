# Run and test

How to run the stack, the jobs, the suites and the devnet rehearsal, in full.
Moved out of `CLAUDE.md` on 2026-11-12 so it is read on demand; `CLAUDE.md` keeps the index.
The text is the original's, one sentence a line.

## The dev stack

- Dev: `docker compose up -d` (Postgres on 5442), `pnpm localnet` (chain on 8899, writes `tools/localnet/.ledger/state.json`; quotes mainnet's whole set of Quote Assets from the snapshot in `tools/localnet/fixtures/mainnet` (605 on 2026-10-10; `pnpm --filter @launchpad/localnet snapshot` with a mainnet `RPC_URL` and `JUPITER_API_KEY` retakes it, `LOCALNET_QUOTES=cases` gives the tests' six instead), and migrates sold-out curves within seconds like Raydium's crank, `CRANK=off` to leave them graduating), `pnpm stand-ins` (the Turbo and gateway stand-in on 8797, where the dev API's `TURBO_*_URL` and `ARWEAVE_GATEWAY_URL` point, without which every prepare still works but no upload lands; and the Jupiter stand-in on 8798, `JUPITER_API_URL`, which prices, tags and gives logos to the snapshot's assets as Jupiter did on the day, without which nothing is launchable), `apps/api`: `pnpm exec wrangler dev --port 8791 --test-scheduled --var PLATFORM_CONFIG:<from state.json> --var PLATFORM_LOOKUP_TABLE:<lookupTable from state.json>` with `MINT_KEY_SECRET` (32+ random characters) in `apps/api/.dev.vars`, `apps/web`: `pnpm dev` (3100).
  Migrate the dev DB with `runMigrations` from `@launchpad/db/migrate`.
- Scheduled jobs: `wrangler dev --test-scheduled` runs them on `GET /__scheduled?cron=<cron>`: `*+*+*+*+*` is the graduation watch, `*/5+*+*+*+*` the Quote Registry refresh, `15+*+*+*+*` the Fee Collector, then the Creator Forward, then the volume rebates, `*/10+*+*+*+*` the Reward Engine, `45+*+*+*+*` the Burn, and a bare `GET /__scheduled` runs all five.
  The Fee Collector sweeps only with `TREASURY_WALLET` set (required on mainnet).
  The dev API also needs `PLATFORM_ADMIN` (the admin from `state.json`; `PLATFORM_CONFIG` must be its PDA).

## The suites

- Tests: `pnpm test:backend` and `pnpm test:ui`, each on its own throwaway stack; the chain takes a free block of ports, so checkouts and agents can run suites side by side (`TEST_RPC_PORT` pins it).
  `pnpm lint`, `pnpm typecheck`; CI runs both plus the backend suite.
  Without docker, `STACK_DATABASE_URL=postgres://user:pass@host:port/postgres` makes the stack create a throwaway database on that server instead (the Hyperdrive binding refuses a URL without a password); `STACK_LOG_DIR` keeps each process's log.
  The backend suite takes about eight minutes on Surfpool.
  The UI suite needs TradingView's library (ADR 0017): its stack fetches it with `GITHUB_TOKEN`, `GH_TOKEN` or the signed-in `gh`, so a session without access to the private `tradingview/charting_library` can run lint, typecheck and the backend suite but not the UI suite or a web build.
- Never edit `apps/api`, `packages/*` or `tools/*` sources while a backend run is in progress: `wrangler dev` hot-reloads the API mid-run and the results are meaningless.
  Tests, web and docs are safe to edit meanwhile.
  During a UI run `apps/web` is not safe either: `next dev` hot-reloads it, and one web edit that named a contract field not yet in `packages/contract` broke every page for the rest of the run (2026-10-07).
  Finish the whole change, typecheck, then run.
- UI baselines live in `tests/ui/screenshots/<platform>/`, and only `darwin` exists, so cloud (Linux) sessions can't run the visual projects and a Mac session re-baselines their PRs; after an intended UI change, run `pnpm test:ui --update-snapshots=changed` (`all` rewrites matching baselines with byte-different PNGs) and look at every changed image before committing.
  To review a hundred of them, diff each against `git show HEAD:<path>` with the rows below the header band and above the footer band aligned separately, and eyeball only the rows between: a plain top-aligned diff marks every row below a height change (156 images reviewed that way for #85).
- Port 8787 and 3000 belong to other projects on this machine; ours are 3100, 8791, 8797, 8899, 5442.

## A page with data

- To see a page with data on a running dev or worktree stack (the owner's database is empty), a short `.mts` script inside `tests/ui` that copies the fixtures' thin helpers (airdrop, `POST /v1/launches/prepare` with `tests/ui/fixtures/coin.png`, `POST /v1/trades/prepare`, sign, send, `POST /v1/transactions/:signature`) against that stack's URLs, run with `pnpm exec tsx` from `tests/ui` and deleted after: a file in the scratchpad cannot resolve the packages, `.ts` is transformed as CJS and refuses top-level await, and a sell must stay under what the trader holds (2026-10-10).

## The devnet rehearsal

- Devnet rehearsal (`env.devnet` in both `wrangler.jsonc` files): `pnpm exec wrangler deploy --env devnet` in `apps/api`; in `apps/web`, `NEXT_PUBLIC_API_URL=https://api-devnet.stoker.markets pnpm exec opennextjs-cloudflare build` (its `pnpm run build` fetches TradingView's library first with the `gh` token, ADR 0017; an API from before #126 ignores the candles' `before` and `limit`, and the datafeed then shows its latest 500 candles alone), then `... deploy --env devnet` (plus `NEXT_PUBLIC_JUPITER_REFERRAL=<the owner's referral account>` once it exists, runbook section 13, so the landing's swap widget takes its fee; it swaps on mainnet whatever cluster the API is on).
  Since 2026-10-14 the rehearsal answers on `devnet.stoker.markets` and `api-devnet.stoker.markets` (the Helius devnet webhook `782124df-...` points at the latter) and mainnet's `stoker-api` holds `api.stoker.markets`; since 2026-10-15 the devnet web Worker also holds `stoker.markets` (#104, with the `ClusterNotice` banner), so item 10 starts by removing the apex from `env.devnet` and redeploying devnet, or wrangler asks to move the domain.
  A resolver asked for a hostname before its custom domain existed caches the miss for a while: check with `dig @1.1.1.1` or `curl --resolve`.
  The web is a pure client, so the API goes first, and the devnet database before it when a migration is pending (Supabase `stoker-devnet`, ref `yxwffqnoggspghpzrntl`, London, the owner's password: hand them one `!` command through the session pooler); `main`'s contract rejected the 2026-10-04 API on every page, which is why a web-only upload, on Cloudflare or anywhere else, cannot work (Vercel and Netlify were asked about and declined for that reason).
  `CI=1` keeps wrangler from prompting about the custom domain; the Cloudflare token lists deployments and secrets but cannot `hyperdrive get`, so find a database with `supabase projects list`.
  Mainnet is `env.production` in both files.
  `--var NAME:value` on the API deploy overrides one setting for a temporary deploy (a 0.5 SOL `GRADUATION_TARGET_LAMPORTS` to rehearse a Graduation; run the Quote Registry job after any change to it, since the curve rules carry the target).
  The keypairs, the database password and the operator token are files under `~/.config/stoker/devnet/` on the owner's Mac, never in the repo; under `~/.config/stoker/mainnet/` only the database password, the operator token, the webhook id and secret, `mint-key-secret` remain (the three wallet keypairs were deleted after the Worker secrets were set and live on paper and in a Phantom wallet; `platform-token.json` was stored on the mainnet API and deleted on 2026-10-24, so the production database holds the STOKER mint key's only copy; `OPERATIONS_KEY` can never be re-put from a file, so never delete the `stoker-api` Worker).
  The owner's shared API keys are in `~/.config/env/global.env`, loaded by direnv through the project's `.envrc`; an agent's shell has not run direnv, so read one in a subshell (`set -a; source ~/.config/env/global.env; set +a`) and never print a value.
  That token reads the zone's settings (`always_use_https` was off on 2026-10-08, a #23 item) but not its DNS.
