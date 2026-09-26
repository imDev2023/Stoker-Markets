# stonk-fun-solana

Research into StonkFun (stonkfun.xyz), a Solana launchpad, and the start of building our own.
Decision (owner, 2026-09-26): build a revenue-earning asset-paired launchpad on Raydium LaunchLab, with tokenized stocks among the quote assets from launch.
Research lives under `research/`; the LaunchLab devnet spike under `spike/launchlab-devnet/`.

## Read first

1. `research/README.md` - verdict, how StonkFun works, fee model, build scope, risks, collection gaps.
2. `research/competitors/README.md` - DefiLlama launchpad revenue ranking and the full LaunchLab platform scan.
3. `research/onchain/README.md` - program IDs, decoded config accounts, fee flows, each fact tied to a tx signature.
4. `research/website/pages/developers.md` and `research/website/api/openapi.json` - StonkFun's public API.

## Settled findings (do not re-derive)

- StonkFun has no custom program: it is a Raydium LaunchLab `PlatformConfig` pair plus an off-chain backend; creating our own `PlatformConfig` is permissionless (2,729 exist on mainnet).
- Quote-token `GlobalConfig`s are created by Raydium's admin but shared, so existing ones are reusable; a new quote mint needs Raydium.
- StonkFun's on-chain creator fee is 0; its "~0.5% to creators" is an off-chain cron forward.
- Correction (2026-09-26): on-chain creator fees are NOT a market differentiator; letsbonk.fun, Bankr, TRiX, PossumLabs already pay 0.5% on-chain. The open niche is asset pairing: StonkFun is the only LaunchLab platform doing it at scale (503 quote mints, 91% non-SOL).

## Traps

- StonkFun's Terms of Use (accepted 2026-09-26 on the owner's instruction) ban scraping and copying; build from Raydium IDLs and SDK, never from their frontend, copy or branding.
- Never open `/admin`, `/api/admin/*` or the password-gated `/integrators` docs; the route list in `research/website/meta/buildManifest.js` is enough.
- StonkFun `/api/public/v1/tokens` pages take ~8 s each when uncached (1,400 pages); pull slices (`status=graduated`, top by market cap or volume), not the whole list. `/api/public/total-assets` gives all mints cheaply. See `research/scripts/pull_api.py`.
- The first `/tokens` page can return fewer than `pageSize` rows; paginate on `pagination.totalPages`.
- `agent-browser screenshot` resolves relative paths against its daemon, not the shell; pass absolute paths.
- Firecrawl is out of credits; use `agent-browser` for pages and Bright Data for X.
- Telegram: the public @StonkFunXyz is a near-empty portal; the real group is private. The owner runs `research/scripts/telegram_export.py` themselves (needs `TG_API_ID`, `TG_API_HASH` in `.env`); never ask for the login code or session.
- Helius `getProgramAccountsV2` with `dataSlice` and `paginationKey` scans all 1.43M LaunchLab pools in about 2 minutes; see `research/competitors/launchlab_platforms.py` for offsets.
- `research/` holds large binaries and dumps that `.gitignore` excludes, plus the owner's private Telegram group export in `research/social/telegram-group/`; that export is other people's messages, so it stays gitignored and is never published.

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
