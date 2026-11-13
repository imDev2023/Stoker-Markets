# Traps: deploys, Cloudflare, the databases, devnet and mainnet

Read before a deploy, a secret, a cron, a database (a new table included), the devnet rehearsal, an RPC endpoint or the domain's email.
Moved out of `CLAUDE.md` on 2026-11-12 so it is read on demand; `CLAUDE.md` keeps the index.
The text is the original's, one sentence a line.

## Workers, secrets and crons

- Agents can't write Worker secrets or deploy production here: the permission classifier denies `wrangler secret put`, `secret bulk` and `wrangler deploy --env production` (devnet deploys pass), and also denies comparing a value against the files under `~/.config/stoker/`; reading the operator token or a keypair file in a subshell for one `curl` passes (the mint key was stored that way on 2026-10-24).
  The Cloudflare token in `.env` has no DNS or Email Routing rights, so DNS changes are the owner's too.
  Hand the owner one `! ...` command instead, and test it for zsh first: zsh does not word-split a variable holding a command (`W="pnpm exec wrangler"; $W ...` fails with "command not found"), so use a shell function.
- A Worker secret is only checked when something uses it: since #66 the API calls Helius only when it indexes a Graduation, so a wrong `HELIUS_WEBHOOK_ID` or key passes `/health` and every job until then.
  The owner once pasted the webhook's auth header into the id; the failed job's error printed it, and it had to be rotated.
  Prove a secret with the flow that uses it (a devnet Graduation at a 0.5 SOL target took a minute and about 0.53 SOL).
- `POST /v1/operator/jobs/quote-registry` in the first seconds after a deploy can still run on the old version (it answered `ruleWrites: 0` after a Graduation Target change, and 2 when run again 20 seconds later).
  `wrangler secret put` makes a new deployment, and a plain deploy drops any earlier `--var` override.
- The production Worker's five Cron Triggers did not fire for the first four hours after its first deploy (2026-10-14; it was born as a draft by `wrangler secret put`), while the devnet Worker's identical five fired every minute; a `PUT .../workers/scripts/<name>/schedules` with the same five, made at 05:59Z, took effect at about 10:15Z and they have fired every minute since.
  To check, count invocations with the Workers Logs query API (`POST .../workers/observability/telemetry/query`, dataset `cloudflare-workers`, filter `$metadata.trigger` = `* * * * *`, grouped by `$metadata.service`) rather than waiting on `wrangler tail`; the dashboard's Settings > Trigger events shows each cron's next run.

## Devnet and mainnet

- Devnet has no CPMM config with a 1% creator fee; the rehearsal uses `5MxLgy9oPdTC3YgkiePHqr3EoCRD9uLVYRQS2ANAs7wy` (0.25%), which the local chain cloned until 2026-10-25, when it switched to the data of mainnet's `CRRS5i...` (1%) at the devnet-derived address `DHHEU8...`.
  Devnet's LaunchLab also quotes only 4 GlobalConfigs, 2 of them priced (SOL and a devnet USDC clone), so the rehearsal's landing says "any of the 2 assets" and its launch form offers two pairs where mainnet's read 614 and 585 launchable (2026-10-15): what a page shows comes from the chain the API is on, never a setting.
  Raydium's devnet crank migrated our two sold-out curves 6 and 31 seconds after they completed.
  ArDrive Turbo can't be paid in devnet SOL, so there `ARWEAVE_TOP_UP_LAMPORTS` is too small to leave the wallet and only free-tier items land on Arweave.
- Devnet SOL is never asked of the owner (global `CLAUDE.md`, 2026-11-10): `devnet-airdrop <address> --target <SOL>` in `~/.local/bin`, run in the background, funds a wallet from Alchemy's devnet RPC; faucet.solana.com is closed to agents and the public RPC faucet answers 410.
- Mainnet Postgres is Supabase `stoker-mainnet` (ref `fzhdksjedbgompsxryvz`, London), migrated, with Hyperdrive `01fb2d350e084d64b496759343705c51` in `env.production` (runbook section 4).
  Supabase as the Hyperdrive origin: the direct host (`db.<ref>.supabase.co`) works for Hyperdrive but is IPv6-only, so run migrations from a Mac through the session pooler (`aws-0-<region>.pooler.supabase.com`, user `postgres.<ref>`).
- `https://api.mainnet-beta.solana.com` answers 403 to any request with a browser `Origin`, so it cannot be `PUBLIC_RPC_URL`; the API also refuses a URL with `?api-key=` even when the key is domain-restricted, so the browser endpoint must be keyless (runbook section 5): `https://solana-rpc.publicnode.com` (owner, 2026-10-14; it answered a browser `Origin` with 200 and CORS `*`), and Helius's Secure RPC URL (paid plans, 5 requests a second per IP) if its limits are ever hit.

## The databases

- Supabase switches a Data API (PostgREST) on for every new project, over the `public` schema, behind an anon key that is designed to be public: on 2026-11-08 its advisor flagged both databases (`rls_disabled_in_public`, `sensitive_columns_exposed`), and a request with a project's anon key was answered for our tables on both, although the API only ever reaches Postgres through Hyperdrive (#201).
  Two closures, neither resting on the other: the Data API is off in both projects (owner, 2026-11-12; `/rest/v1/` answers 503), and every table has Row-Level Security with no policy (migration `0030`), so a role that is not the tables' owner reads and writes nothing even with every privilege granted.
  A new table is declared with `.enableRLS()` in `packages/db/src/schema.ts`; `pnpm lint` fails without it (`scripts/row-security.mjs` reads the latest snapshot), and `runMigrations` throws at the end on a database where any `public` table lacks it, which also catches a table made by hand-written SQL.
  A new database on any host gets both (runbook section 4), and its Hyperdrive must connect as the role that ran the migrations: to any other role every read answers empty without an error, and only a write fails.
- Never `FORCE ROW LEVEL SECURITY` and never a policy by habit: forcing applies it to the owner, so the API would read nothing, and a policy opens a table to a role that has no business there (`row-security.test.ts` asserts neither exists).
  A superuser passes Row-Level Security whatever the tables say, so the test stack's database belongs to a plain role (`launchpad_stack` in `tools/stack`), or a suite run would prove nothing about it.
  Supabase's `service_role` key passes it too, by design: it is a secret we never use, and it only matters if the Data API is ever on again.

## Email

- `info@stoker.markets` receives through Cloudflare Email Routing (forwarded to the owner's Gmail) and sends from that Gmail through Brevo's SMTP relay, which signs with the domain's DKIM key (`brevo1` and `brevo2._domainkey`); sending through `smtp.gmail.com` instead brings back Outlook's "can't verify the sender" banner.
  The method, a checklist and a DNS checker are in https://github.com/imDev2023/custom-domain-email.
  The Brevo SMTP key expires after 90 days without use.
