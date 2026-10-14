# Mainnet go-live runbook (#23)

What it takes to put the platform on mainnet, in the order it has to happen. Everything an agent can prepare is here; the steps only the owner can do (keys, money, names, third-party accounts) are marked **owner** and gathered again at the end. Terms are `CONTEXT.md`'s; the decisions behind the steps are ADR 0001 (fees), 0002 (Cloudflare), 0003 (server-built transactions), 0004 (key custody) and 0005 (curve rules).

The API refuses to start on mainnet until the settings below are right (`apps/api/src/env.ts`, `config()`), and `GET /health` fails the same way, so a wrong deploy never looks healthy.

## 0. Before anything is created on mainnet

- **owner** #7: the product name, the domain and the Platform Token ticker. The PlatformConfig's `name`, `web` and `img` and every coin's metadata URL carry them, and none can change afterwards.
- ADR 0005 is accepted (owner, 2026-10-04): the hot operations wallet writes every curve rule, and pays about 2 SOL of rent for mainnet's 571 GlobalConfigs.
- **owner** A devnet dress rehearsal (section 11) with the mainnet configuration flags on, since the local chain cannot prove Raydium's crank, Jupiter or Helius.

## 1. Keys and wallets (owner)

| Key | Where it lives | What it does |
| --- | --- | --- |
| Admin key | Cold: a file keypair kept offline (owner, 2026-10-06: a software key, not a hardware wallet), or a Squads multisig. Never on a server. | Creates the PlatformConfig, whose address is derived from it (`["platform_config", admin]`) and can never change (ADR 0004). Signs the rare `update_platform_config`: fee changes (#22), and re-pointing the wallet roles after a leak. |
| Operations wallet | Hot: its secret key is the Worker secret `OPERATIONS_KEY` (JSON byte array). | Every day-to-day role: fee wallet, Fee Key NFT wallet, `platform_cp_creator`, Reward Tax withdraw authority, fee-extension authority, curve rule manager, Reward Round payer, Burn and Flywheel buyer, Platform Lookup Table authority. |
| Treasury | Cold: a file keypair kept offline (owner, 2026-10-06), or a Squads vault; `TREASURY_WALLET` is only its address. | Receives the Fee Collector's sweeps. |

The owner decided (2026-10-06, prefix shortened 2026-10-09) that all three, and the Platform Token's mint (section 10), are vanity addresses starting with `Stoke` (a prefix, which stays visible when wallets and explorers truncate an address, and the brand's verb), ground on the owner's Mac with `solana-keygen grind --starts-with Stoke:4` in `~/.config/stoker/mainnet/` (started 2026-10-09 22:46 BST, logging to `grind-stoke.log`; about 424,000 keys a second on 20 threads, so about 7.4 hours a key and 30 for four; the keypairs land as `<address>.json`, the secret never printed). `Stoker` was the plan until the grind was measured: 1 in 6.6e11 keys, not 58^6, because an address starting with a letter after `J` must be a 43-character key, so 18 days a key and 72 for four (74 hours of `grind.log` found none, the expected outcome); the arithmetic is a trap in CLAUDE.md and the measurement is on #23. Each is then renamed `admin.json`, `treasury.json`, `operations.json` and `platform-token.json`; the admin's address is the platform's identity for good. Keep `admin.json` and `treasury.json` on an encrypted offline medium and plug it in only to sign, put `operations.json`'s JSON array into the Worker secret `OPERATIONS_KEY`, and keep an offline copy of all three: losing the operations key strands the Reward Tax withdraw authority on every Reward Launch and the curve rule manager role until the admin re-points them. Vanity prefixes are branding only: nothing verifies them, and anyone can grind the same prefix.

With a file admin keypair, section 2's `platform-config build --sign admin.json` signs, sends and checks in one go, so no hardware wallet signing path is needed.

The four keys landed on 2026-10-10 (about 8.5 hours a key) and the owner assigned them on 2026-10-13 (#23):

| Role | Address |
| --- | --- |
| admin (`PLATFORM_ADMIN`) | `Stoke7675JniwDxRnT9rfjZ1EU3yUTEoHRBtZT6XcJb` |
| operations | `StokehV2bK8z7c3kbUmdTbdJ8HxKNR7WmHLmEpR9ZGu` |
| treasury (`TREASURY_WALLET`) | `StokezuREp73svYnkD8eWisfRLo6AQh2WtBFT4Q93B3` |
| platform-token mint | `StokeDgBjCYcTGe7VExPaJ5biH2MR6TYtQiiN7NAQX1` |

Backups (owner, 2026-10-13): each keypair file printed on a home printer straight from Terminal (`lpr <file>`, never through a document app or the clipboard, which autosave to iCloud and sync to other devices), two sets stored apart, and all four imported into a Phantom wallet made for Stoker alone and never connected to a dapp. An imported key is not covered by Phantom's recovery phrase, so the paper is the backup. The plain files stay in `~/.config/stoker/mainnet/` only until sections 2, 3 and 5 have signed with them; then delete them, exclude `~/.config/stoker` from Time Machine (`tmutil addexclusion`) and delete its earlier backups and local snapshots.

Funding the operations wallet, in SOL, before the first refresh:

| Need | About |
| --- | --- |
| Curve rule accounts, one per GlobalConfig (ADR 0005) | 0.003 each, 2 for all 571 |
| Platform Lookup Table (section 3) | 0.02 |
| Fee vault and token account rents as Quote Assets get their first trade, Reward Round payouts (network fees and holders' new coin accounts), Burn and Flywheel network fees | keep the `SWEEP_FLOAT_LAMPORTS` float, 1 SOL by default |
| A margin | 5 in total is comfortable |

The admin key needs about 0.01 SOL: the PlatformConfig's rent (0.0075) and four transaction fees.

## 2. Create the mainnet PlatformConfig (cold admin key)

Exactly what `bootstrapPlatform` in `tools/localnet/src/index.ts` does on the local chain, signed by the cold key instead. Mainnet program ids are in `packages/chain/src/programs.ts` (`programsFor("mainnet")`): LaunchLab `LanMV9sAd7wArD4vJFi2qDdfnVhFxYSUg6eADduJ3uj`, CPMM `CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C`, lock `LockrWmn6K5twhz3y9w1dQERbmgSaRkfnTeTKbpofwE`.

1. **owner** Pick the CPMM config graduated pools use: list mainnet's CPMM configs (the spike's `list_cpmm_configs.ts` against a mainnet RPC) and take the one with a 1% creator fee, which is what the PRD and StonkFun use; the config fixes the post-Graduation Platform Fee for every pool for good, and half of what it collects is forwarded to the Creator (ADR 0009).
   Listed on 2026-10-04: of mainnet's 21 configs only index 11, `CRRS5ieQmBrZjWhcj99JuGrT5tyuWDaGAXLXLFjbAtjQ`, has a 1% creator fee (with a 0.25% trade fee), and it is the one StonkFun's PlatformConfigs name.
2. Build the four instructions, in one transaction, with `packages/chain`:
   - `createPlatformConfigIx(program, admin, { feeRate: 10000, creatorFeeRate: 0, name, web, img, operationsWallet, cpswapConfig })`: Platform Fee 1.00% and no on-chain Creator Fee (ADR 0009, the Creator's half is forwarded; rates use LaunchLab's 1e6 denominator), all locked-LP Fee Key rights to the platform (`migrate_nft_info.platform_scale` 1e6), no platform vesting, and the operations wallet as fee wallet, NFT wallet, transfer-fee-extension authority and vesting wallet.
   - `updatePlatformConfigIx(program, admin, { PlatformCPCreator: [operations] })`: the platform is every graduated pool's creator.
   - `updatePlatformConfigIx(program, admin, { RestrictCurveParam: [1] })`: launches must match a curve rule.
   - `updatePlatformConfigIx(program, admin, { CurveRuleManager: [operations] })`: the operations wallet writes the rules (ADR 0005).
3. Serialise it unsigned with a recent blockhash and the admin as fee payer (the same way `POST /v1/operator/fees/prepare` hands the admin a fee change), sign it on the cold device or through Squads, and send it. `tools/mainnet/platform-config.ts` does the building; nothing in the API does, since the API never holds the admin key. It takes the admin's address (or a keypair file, of which it reads only the public half) and prints the base64 transaction; it is valid for about a minute, so build it when the cold device is ready to sign:

   ```sh
   pnpm --filter @launchpad/mainnet platform-config build --rpc https://... --cluster mainnet \
     --admin <admin pubkey> --operations <operations pubkey> --cpswap-config <the 1% config> \
     --name "<name>" --web https://<domain> --img https://<domain>/icon.png
   ```

   The `--img` the chain will carry is `https://<domain>/icon.png`, which the web Worker serves from `apps/web/public/icon.png` once it is deployed on the domain (section 9); the admin can change `img` later, at the price of another cold signature.
   Simulated on mainnet on 2026-10-05 with a stand-in admin, the mainnet CPMM config and nothing sent: all four instructions pass (546 bytes, about 53,000 compute units), and the PlatformConfig's rent is 0.00544576 SOL.

   `--platform-fee-bps` defaults to 100 and `--creator-fee-bps` to 0 (ADR 0009). On devnet (section 11), where the admin can be a file keypair, `--sign admin.json` signs, sends and runs the check below in one go.
4. Verify by decoding the account, which is the acceptance criterion in #23: `pnpm --filter @launchpad/mainnet platform-config check --rpc ... --cluster mainnet --admin <admin pubkey>` prints the decoded PlatformConfig, and with the same `--operations`, `--cpswap-config`, `--name`, `--web` and `--img` as the build it names every field that differs from what was decided, or passes: `fee_rate` 10000, `creator_fee_rate` 0, `migrate_nft_info` `{1000000, 0, 0}`, `platform_vesting_scale` 0, `fee_wallet`, `nft_wallet`, `transfer_fee_extension_auth`, `vesting_wallet` and `platform_cp_creator` all the operations wallet, `curve_rule_manager` the operations wallet, `restrict_curve_param` on, `cpswap_config` the chosen config, `name`, `web` and `img` as decided in #7. (`launchlabCoder.accounts.decode("PlatformConfig", data)` from `packages/chain` is what it decodes with.) The script is proven against the local chain in `tests/backend/src/mainnet-tools.test.ts`.
5. `PLATFORM_CONFIG` is `launchlabPdas(program).platformConfig(admin)`; `PLATFORM_ADMIN` is the admin's address, and the API checks on mainnet that the one derives from the other.

Every curve rule is written by the API's Quote Registry refresh (section 6), never by the admin.

## 3. The Platform Lookup Table (operations wallet)

A launch with a First Buy only fits Solana's 1,232 bytes through an address lookup table, and a buy paid with SOL needs the same table (CLAUDE.md traps). The table is owned by the operations wallet and holds `platformLookupAddresses(program, platformConfig, quotes)` from `packages/chain/src/lookup.ts`: 11 shared accounts plus 4 per listed Quote Asset (its GlobalConfig, mint, curve rule and platform fee vault). A table holds 256 addresses, so list SOL (required: a SOL First Buy needs SOL's own accounts) and up to 60 of the busiest Quote Assets, never all 571.

`tools/mainnet/lookup-table.ts` creates or extends it with the operations keypair from a list of quote mints (SOL is always included), reusing `ensureLookupTable` from `tools/localnet`, which works against any RPC and waits until the last extension is rooted (about 32 slots):

```sh
pnpm --filter @launchpad/mainnet lookup-table --rpc https://... --cluster mainnet \
  --operations operations.json --admin <admin pubkey> --quotes <mint>,<mint>,...
```

It prints the table's address, which is `PLATFORM_LOOKUP_TABLE`, and refuses a list that would not fit. Extending it later (a Quote Asset getting popular) is the same command with the longer list; a new address is usable a minute after it is added. Jupiter routes bring their own tables. The script is proven against the local chain in `tests/backend/src/mainnet-tools.test.ts`.

## 4. Postgres and Hyperdrive

1. **owner** A managed Postgres (Neon, Supabase, Crunchy or the like) reachable from Cloudflare, with a password (Hyperdrive refuses a URL without one).
2. Run the migrations from a machine, never from the Worker: `runMigrations(directUrl)` from `@launchpad/db/migrate` applies `packages/db/migrations`, including the trigger that makes `ledger_entries` append-only. Re-run it on every deploy that adds a migration.
3. Create a Hyperdrive configuration for the database and put its id in `wrangler.jsonc` (`hyperdrive[0].id`, binding `HYPERDRIVE`).

Done on 2026-10-07: Supabase project `stoker-mainnet` (ref `fzhdksjedbgompsxryvz`, org Farhan, London, created with the Supabase CLI; password in `~/.config/stoker/mainnet/db-password`), all 18 migrations applied through the session pooler (`postgres.fzhdksjedbgompsxryvz@aws-0-eu-west-2.pooler.supabase.com:5432`), Hyperdrive `stoker-mainnet` `01fb2d350e084d64b496759343705c51` on the direct host (`db.fzhdksjedbgompsxryvz.supabase.co`), in `env.production`.

## 5. The API Worker: production configuration checklist

The mainnet values are in the `env.production` block of `apps/api/wrangler.jsonc` (deploy with `wrangler deploy --env production`), so the local defaults stay as they are.
`PLATFORM_CONFIG`, `PLATFORM_ADMIN`, `PLATFORM_LOOKUP_TABLE` and `TREASURY_WALLET` are empty there until sections 1 to 3 produce them; the Hyperdrive id is set (section 4). Everything below is read by `config()` and refused on mainnet when wrong.

| Variable | Mainnet value | Checked |
| --- | --- | --- |
| `CLUSTER` | `mainnet` | turns every check below on |
| `RPC_URL` | the Helius (or other provider) RPC URL with its key | must be https; never reaches a browser |
| `PUBLIC_RPC_URL` | `https://solana-rpc.publicnode.com` (owner, 2026-10-14: keyless, and it answered a request with a browser `Origin` with 200 and `access-control-allow-origin: *`); the Secure RPC URL in Helius's dashboard (keyless, 5 requests a second per IP, paid plans only) if publicnode's limits are ever hit. A URL with `?api-key=` is refused even when the key is restricted to our domain. Not `https://api.mainnet-beta.solana.com`: it answers a server but refuses every request that carries a browser `Origin` with 403 "Access forbidden" (tested 2026-10-05 with `https://stoker.markets` and with localhost), so wallets could not read balances or send trades through it | required on mainnet; https; refused if the URL carries a key, token or secret |
| `PUBLIC_API_URL` | `https://api.<our domain>` | refused if not https, or on localhost, a bare IP or `workers.dev`: every coin's metadata URL is built from it and can never change (section 8) |
| `WEB_ORIGIN` | `https://<our domain>` | CORS |
| `LAUNCHLAB_PROGRAM`, `CPMM_PROGRAM`, `LOCK_PROGRAM` | the mainnet ids in section 2 | the local defaults are devnet's |
| `PLATFORM_CONFIG`, `PLATFORM_ADMIN` | from section 2 | the config must derive from the admin |
| `PLATFORM_LOOKUP_TABLE` | from section 3 | must exist and be active |
| `GRADUATION_TARGET_LAMPORTS` | `85000000000` (85 SOL, PRD) | the local stack uses 1 SOL |
| `GRADUATION_ALERT_AFTER_SECONDS` | `300` | a stuck Graduation alert after five minutes without Raydium's crank |
| `POOL_BACKFILL_SECONDS` | `900` | for 15 minutes after a Graduation the graduation watch reads the new pool's history every minute, since a webhook takes minutes to start delivering a new address |
| `PRICE_SOURCE` | `jupiter` | `static` is refused on mainnet; drop `QUOTE_PRICES_USD` |
| `SOL_ROUTE_SOURCE` | `jupiter` (or `none` to offer no SOL payment on non-SOL Launches) | `raydium-cpmm` is refused; drop `SOL_ROUTE_POOLS`. Before the switch, prove the route against the real Jupiter: `RPC_URL=<mainnet RPC> pnpm --filter @launchpad/mainnet jupiter-route <a wallet with SOL> [quote mint]` simulates the swap and fails if it would deliver under its promised minimum |
| `TREASURY_WALLET` | the Treasury address | required on mainnet |
| `SWEEP_THRESHOLD_LAMPORTS`, `SWEEP_FLOAT_LAMPORTS`, `COLLECT_MIN_LAMPORTS` | `5000000000`, `1000000000`, `1000000` unless the owner decides otherwise (#14's open question) | float below threshold and above the rent a sweep may pay |
| `CREATOR_FORWARD_MIN_LAMPORTS` | `10000000` (0.01 SOL): what a Creator must be owed in one Quote Asset, at the Quote Registry's price, before the Creator Forward pays it (ADR 0009) | the job runs hourly, right after the Fee Collector |
| `FEE_CHANGE_LEAD_SECONDS`, `REWARD_RULES_LEAD_SECONDS` | `86400` | the fee lead is refused under an hour on mainnet |
| `BURN_SHARE_BPS`, `FLYWHEEL_SHARE_BPS`, `FLYWHEEL_TOP_N`, `BURN_MIN_SPEND_LAMPORTS` | `6000`, `500`, `10`, `10000000` (PRD) | whole basis points |
| `REFERRAL_SHARE_BPS` | `50` | capped per Quote Asset by its GlobalConfig |
| `ANON_RATE_LIMIT_PER_MINUTE`, `ANON_PREPARE_RATE_LIMIT_PER_MINUTE` | `300`, `25` | what one IP may do each minute without an API key |
| `TURBO_UPLOAD_URL`, `TURBO_PAYMENT_URL`, `ARWEAVE_GATEWAY_URL` | `https://upload.ardrive.io`, `https://payment.ardrive.io`, `https://arweave.net` (the local defaults name the stand-in) | https on a public host; the gateway is in every coin's on-chain URI and can never change (section 8, ADR 0008) |
| `ARWEAVE_TOP_UP_LAMPORTS` | `50000000` (0.05 SOL, about 34 launches with the largest image) | sent from the operations wallet's float to Turbo whenever an upload is refused for want of credits |
| `triggers.crons` | the five in `wrangler.jsonc` as they are | graduation watch (and the Metadata Upload with it), Quote Registry, Fee Collector (and the Creator Forward after it), Reward Engine, Burn |
| `hyperdrive[0].id`, `r2_buckets[0].bucket_name` | from section 4 and 8 | |

Secrets, set with `wrangler secret put <NAME> --env production`, never in the config file:

| Secret | Value |
| --- | --- |
| `OPERATIONS_KEY` | the operations wallet's secret key as a JSON byte array |
| `HELIUS_WEBHOOK_SECRET` | a long random string; the same one goes into the webhook's auth header (section 7) |
| `MINT_KEY_SECRET` | at least 32 random characters. Every launch's mint key is derived from it and a nonce, so a retry rebuilds the same coin address; never rotate it while any prepared launch could still be retried, and keep an offline copy |
| `OPERATOR_TOKEN` | a long random string; whoever holds it has the operator endpoints and the `/operator` page. **owner**: who holds it |
| `ALERT_WEBHOOK_URL` | the chat webhook (Slack, Discord, Telegram) alerts are posted to as JSON; without it alerts are only stored. **owner**: which channel |
| `JUPITER_API_KEY` | the owner's Jupiter key, `JUP_API_KEY` in `~/.config/env/global.env` (checked 2026-10-07: `api.jup.ag` answers it 200). Set it: without it prices use the keyless `lite-api.jup.ag` host, which Jupiter is retiring, and routes run keyless at 0.5 requests a second. Plans are $0 (measured 2026-10-14: a window of 10 requests, about ten seconds, told by `x-ratelimit-remaining` and `x-ratelimit-reset`), $25 a month (10 rps) and up. The first mainnet refresh failed in one second with `Jupiter /price/v3 failed: 429` on the free plan, since a refresh of 605 Quote Assets makes about thirty calls; since then the client waits for the window and retries a 429 (`apps/api/src/quotes/pricing.ts`), so a refresh takes about half a minute on the free plan. Raise the plan when a job run's duration or the portal's usage page says so |
| `HELIUS_API_KEY`, `HELIUS_WEBHOOK_ID` | optional, together: the Helius API key and the id of the raw webhook from section 7. With both, the Indexer adds each graduated pool to the webhook as it indexes the Graduation, through Helius's webhook API (`PUT /v0/webhooks/<id>`, `apps/api/src/helius.ts`); one without the other fails `/health`. Without them the webhook's addresses are edited by hand |

After the deploy: `GET https://api.<domain>/health` must answer `{"ok":true}`; any configuration error is its message.

## 6. First refresh: the Quote Registry and every curve rule

A GlobalConfig with no curve rule account is unrestricted even with `restrict_curve_param` on (ADR 0005), so nothing may launch before every GlobalConfig has a rule. The refresh writes at most 120 rules a run, missing ones first, and runs every five minutes: mainnet's 571 take five runs, about 25 minutes, or run the job by hand five times (`POST /v1/operator/jobs/quote-registry`, or the operator page's button) and check `GET /v1/operator/jobs?job=quote-registry`. Then `GET /v1/quotes` should list 571 Quote Assets, launchable where Jupiter prices them, each with a Graduation Target worth 85 SOL.

Run on 2026-10-14: mainnet had 613 GlobalConfigs by then, 586 priced by Jupiter. The first run died in a second on Jupiter's free-plan window (#100 fixed it), and the next five each reported 120 writes while only about 38 a run landed: ten sends at once with one blockhash for the run, stretched past its validity by the Helius free plan's throttling (281 "Blockhash not found", 114 fetches cancelled by the Worker's connection cap). Since then a run sends four at a time with a fresh blockhash a batch and reports `ruleWrites` (landed) and `ruleWriteFailures`; on the free RPC plan a run of 120 takes a few minutes. The crons could not do the runs: the production Worker's five Cron Triggers had not fired once in 80 minutes while devnet's identical five fired every minute (Workers Logs, grouped by trigger), cause not found yet (CLAUDE.md, traps); the runs were made by hand.

Keep the site's launch page closed (or the DNS unpublished) until that count is right.

## 7. The Helius webhook

The Indexer reads Helius payloads as raw `getTransaction` JSON, so the webhook must be of type **raw** (the enhanced type has a different shape and is not decoded); transaction types: all. Deliveries carry `Authorization: <HELIUS_WEBHOOK_SECRET>`, and the API answers 500 for a batch it could not fully index, so Helius delivers it again and the rest are no-ops. Endpoint: `POST https://api.<domain>/v1/webhooks/helius`.

Addresses to watch (print them with `launchlabPdas(program)` from `packages/chain`):

| Address | Why |
| --- | --- |
| Our PlatformConfig | Every launch, curve trade, Graduation (migration) and `update_platform_config` on our platform names it. Watching the whole LaunchLab program instead would deliver every other platform's traffic. |
| Each graduated pool | Pool trades after Graduation. The Indexer backfills a pool's history when it indexes the Graduation, and with `HELIUS_API_KEY` and `HELIUS_WEBHOOK_ID` set (section 5) adds the pool's address to the webhook in the same delivery, before recording the Graduation, so a failed call makes Helius deliver the migration again. Helius takes minutes to start delivering a new address, so for `POOL_BACKFILL_SECONDS` after that the graduation watch reads the pool's history every minute and indexes what the webhook missed. Without the secrets, add pools by hand or watch the CPMM program (high volume). |
| The operations wallet | Optional: the jobs record their own transactions, but this catches anything sent from the wallet by hand. |

Never add the quote mints: watching a mint delivers every transaction that names it, and for wrapped SOL or USDC that is much of the chain. Quote Risk Labels (#11) follow an issuer's change at the next Quote Registry refresh, within five minutes; the Indexer also re-reads a mint that a transaction delivered for another reason marked writable.

A Helius webhook holds up to 100,000 addresses. The `POST /v1/transactions/:signature` fast path means the web app never waits for the webhook, but every trade made elsewhere does. The API keeps the webhook's URL, type and auth header as it found them when it adds addresses, so create the webhook by hand first; `tests/backend/src/helius.test.ts` proves both additions against a stand-in for Helius's API in `tools/stack`. The `POST /v1/transactions/:signature` fast path means the web app never waits for the webhook, but every trade made elsewhere does.

## 8. Permanent metadata on Arweave, and the domain

Every coin's on-chain metadata URI is `ARWEAVE_GATEWAY_URL/<id>` (`https://arweave.net/<id>`), written at launch where LaunchLab holds the update authority (ADR 0008, #44). The image and the metadata JSON are signed as Arweave data items with the operations key when the launch is prepared and posted through ArDrive Turbo once the launch is indexed, so nothing is uploaded for a launch that never lands. The document, with its image, is also served from our own domain as a cache: `PUBLIC_API_URL/metadata/<mint>.json` from Postgres and `PUBLIC_API_URL/metadata/<mint>/image` from the R2 bucket (`METADATA_BUCKET`: `stoker-metadata` in `env.production`, created in the Cloudflare account on 2026-10-07 in WEUR, empty; the rehearsal's is `stoker-metadata-devnet`), which is what the site shows.

- Turbo is paid in SOL: whenever an upload is refused for want of credits, the Metadata Upload job sends `ARWEAVE_TOP_UP_LAMPORTS` (0.05 SOL) from the operations wallet to Turbo's deposit address and Turbo credits it once finalized. Items under about 105 KiB are free. Every top-up and every paid upload is on the Ledger (`arweave_top_up`, `metadata_upload`) and the `/operator` page counts what is on Arweave and what still waits; a failed run raises `job_failed`. The float the Fee Collector leaves (1 SOL) covers many top-ups, so no extra balance is needed beyond section 1's.
- A fresh item is on `arweave.net` only once Turbo has bundled it onto Arweave, minutes after the upload; `https://turbo-gateway.com/<id>` serves it at once. Wallets that read the URI on launch day may show the image a little late; the site never waits.
- **owner** Register the domain (#7) and keep it renewed on auto-pay under an account nobody else controls; add `api.<domain>` as the API Worker's custom domain and `<domain>` as the web Worker's.
- After the deploy, before the first launch: `GET https://payment.ardrive.io/v1/account/balance/solana?address=<operations wallet>` answers 404 (no credits yet) and the first launch's run of `metadata-upload` (`GET /v1/operator/jobs?job=metadata-upload`) shows one top-up credited and both items uploaded; `https://arweave.net/<id>` resolves within the hour.

## 9. The web Worker

`NEXT_PUBLIC_API_URL=https://api.<domain>` at build time (`pnpm exec opennextjs-cloudflare build` in `apps/web`), then `pnpm exec opennextjs-cloudflare deploy --env production` (`env.production` in `apps/web/wrangler.jsonc`, with `<domain>` as its custom domain). Confirm the `/launch` page shows the 571 Quote Assets and `/operator` opens with the token. The public site needs no secret.

The web Worker renders pages on the server, and all of those requests reach the API from the Worker's own address, which the per-IP limit would count as one caller. Issue it an API key with a high limit (`POST /v1/operator/api-keys` with `name` and `rateLimitPerMinute`; 6000, the most a key can have, is 100 requests a second) and set it as the web Worker's secret `API_KEY` (`wrangler secret put API_KEY` in `apps/web`); it is only ever sent from the server. Requests made in a visitor's browser carry no key and count against the visitor's own IP.

## 10. Launch #1: the Platform Token (owner)

1. Its address starts with `Stoke` (owner, 2026-10-06, shortened 2026-10-09): the keypair is ground with the three wallets (section 1). Store it for the wallet that will launch, from the Mac that holds the file (the secret travels once, over https, to the API; it is kept encrypted under `MINT_KEY_SECRET` and never answered back):

   ```sh
   curl -X POST https://api.stoker.markets/v1/operator/mint-keys -H "authorization: Bearer $OPERATOR_TOKEN" -H "content-type: application/json" \
     -d "{\"creator\": \"<the launching wallet>\", \"secretKey\": $(cat ~/.config/stoker/mainnet/platform-token.json)}"
   ```

   That wallet's next launch takes the address (`GET /v1/operator/mint-keys` shows it `drafted` once prepared), so launch from that wallet next, and nothing else from it before. A key no draft has taken can be removed with `DELETE /v1/operator/mint-keys/<address>`.
2. Launch it from the site like any Creator, paired with SOL, standard (not a Reward Launch), with **no First Buy and no Airdrop**: a First Buy is a team allocation, and the PRD promises none. The launch transaction is public proof; publish its signature and the mint.
3. Name it for the Burn: `PUT /v1/operator/platform-token` with the mint (the Burn is idle until then).
4. Once it graduates (85 SOL raised, Raydium's crank migrates it within seconds), ask Raydium for a LaunchLab GlobalConfig with the Platform Token as quote mint; only Raydium can create one (CLAUDE.md, settled). When it exists, the next Quote Registry refresh lists it, prices it and writes its curve rule, and the token becomes a Quote Asset with no code change.
5. If the Platform Token's GlobalConfig should be in the Platform Lookup Table, extend the table (section 3).

## 11. Before the switch: the devnet dress rehearsal (owner runs it, an agent prepares it)

Run the same deploy against real devnet (`CLUSTER=devnet`, the devnet program ids the local config already has, `PRICE_SOURCE=static` and `SOL_ROUTE_SOURCE=none` since devnet has no Jupiter), fund the wallets from the owner's CLI wallet (faucets are rate-limited), and prove what the local chain cannot:

- Raydium's crank migrates our pools (proven once on 2026-09-27 in the spike; prove it on the production code path), including a coin whose mint sorts before SOL (about 1 in 40, error 2502 when the account order is wrong).
- Graduation, pool fees and Fee Keys for a Token-2022 Quote Asset (devnet has no stock GlobalConfig, so this may only be provable on mainnet with a small amount).
- The Helius webhook end to end: a trade made from another wallet appears on the board without the fast path.
- The Fee Collector sweeps to the treasury and the Creator Forward then pays the Creator their share (ADR 0009): the Creator's wallet receives it with nothing to sign, and the forward is on the Ledger and the creator page.
- The rehearsal's PlatformConfig was created under ADR 0007 (`fee_rate` 7500, `creator_fee_rate` 2500); #85 moves it to 10000 and 0 through the fee-change flow (#22) rather than a new config, which is also the rehearsal of that flow: `pnpm --filter @launchpad/mainnet fee-change announce --api https://api-devnet.stoker.markets --token-file ~/.config/stoker/devnet/<operator token> --platform-fee-bps 100 --creator-fee-bps 0 --effective-at <a day ahead, ISO> --note "..."`, and once due `fee-change apply --api ... --token-file ... --rpc <devnet RPC> --id <the announcement's id> --sign ~/.config/stoker/devnet/<admin keypair>` (proven against the local chain in `tests/backend/src/mainnet-tools.test.ts`). The webhook delivers the change and the site's fees follow; `platform-config check` then passes with the new defaults.
- The Reward Engine pays a round, the Burn buys and burns (a SOL route is needed for the Burn: on devnet use `raydium-cpmm` pools you seed, as the local chain does).
- The Jupiter route source and `PRICE_SOURCE=jupiter` can only be exercised on mainnet: exercise them with a tiny Launch before opening the site.

The rehearsal ran on `stoker.markets` and `api.stoker.markets`, which mainnet takes over (owner, 2026-10-04).
Move it to `devnet.stoker.markets` and `api-devnet.stoker.markets`, which `env.devnet` in both `wrangler.jsonc` files now names, before the first production deploy:

1. `pnpm exec wrangler deploy --env devnet` in `apps/api`; the Worker leaves `api.stoker.markets` and answers on `api-devnet.stoker.markets`.
2. In the Helius dashboard, change the devnet webhook's URL to `https://api-devnet.stoker.markets/v1/webhooks/helius`.
3. In `apps/web`, `NEXT_PUBLIC_API_URL=https://api-devnet.stoker.markets pnpm exec opennextjs-cloudflare build`, then `pnpm exec opennextjs-cloudflare deploy --env devnet`.
4. Check `https://api-devnet.stoker.markets/health` and that a devnet trade made away from the site is indexed.

Made on 2026-10-14: both Workers deployed from main (`ed6b5f0`) with their new custom domains, the webhook's URL changed through Helius's API with its six addresses kept, `/health` ok, the site built against `api-devnet` with the fee-change banner showing. A resolver that was asked for the new hostnames before the deploy caches the negative answer for a while: check against `1.1.1.1` or with `curl --resolve`.

## 12. Go-live checklist

1. [x] #7 decided: name, domain, ticker. ADR 0005 accepted.
2. [x] Admin key on a cold device; operations wallet and Treasury created; operations wallet funded (section 1). 2026-10-13: the four `Stoke` keys assigned (section 1's table), paper backups made, admin 1.67 SOL and operations 5.1 SOL.
3. [x] PlatformConfig created and decoded as expected (section 2). 2026-10-13: `2a6kp9vQ4X4pjkvf6isuvp8eCGBNnSdaNL8NKhqywXVA`, tx `2Fm9Dzxk8SLFCtAeGSV4tTyQR9a9rzKhz17SYoest8sy6ysScc3Ej5nziDBG7QBbe8sUXpdvYbEoYkxEcGqBW7pZ`, `platform-config check` passed.
4. [x] Platform Lookup Table created and rooted (section 3). 2026-10-13: `CPv7717aQwPXihwvbSkQvT9nhBmo3Eh7pgCJ7hbN8CHc`, 255 addresses, SOL and the 60 deepest verified markets of the 2026-10-10 snapshot (listed on #23).
5. [x] Postgres migrated; Hyperdrive configured (section 4). 2026-10-07.
6. [ ] API deployed with the checklist's values and secrets; `/health` ok (section 5).
7. [ ] Quote Registry refreshed until 571 Quote Assets each have a curve rule (section 6).
8. [ ] Helius raw webhook on the PlatformConfig, with the secret (section 7); `HELIUS_API_KEY` and `HELIUS_WEBHOOK_ID` set so graduated pools join it on their own (section 5).
9. [ ] Domain and R2 in place; the Arweave settings left at their mainnet defaults (section 8). R2 bucket `stoker-metadata` created 2026-10-07; the domain move (section 11) was made on 2026-10-14, so `stoker.markets` and `api.stoker.markets` are free for the production Workers. The zone's "Always Use HTTPS" (SSL/TLS > Edge Certificates) was off on 2026-10-08, so `http://` served the site and the API with 200: turn it on (owner; the agents' token only reads it).
10. [ ] Web deployed on the domain (section 9). Every non-mainnet cluster answers `noindex` (the root layout's `generateMetadata`, pinned by `tests/ui/src/empty.spec.ts`), so the rehearsal's test coins are never indexed under the brand.
11. [ ] Alerts arrive in the chosen channel: `POST /v1/operator/jobs/fee-collector?fail=simulated` raises `job_failed`, the next run resolves it.
12. [ ] Platform Token launched fairly and named; GlobalConfig requested after Graduation (section 10).

## Only the owner can do

- Decide the name, domain and ticker (#7), and register the domain.
- Generate and keep the admin key, the operations wallet and the Treasury; fund the operations wallet; sign the PlatformConfig transaction with the cold key.
- Choose the mainnet CPMM config (the 1% creator fee one).
- Open the Cloudflare, Helius, Jupiter (if a key is wanted) and Postgres accounts, and create the Hyperdrive configuration, the R2 bucket and the webhook.
- Choose the alert channel and who holds the operator token; set the sweep thresholds if the defaults are wrong.
- Launch the Platform Token, publish the proof, and ask Raydium for its GlobalConfig.
- Run the devnet rehearsal, and the first tiny mainnet Launch that proves Jupiter prices and routes.
