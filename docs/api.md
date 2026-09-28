# The public API

The web app is one client of the API among many (ADR 0003): a Telegram bot, a trading terminal or a script uses the same endpoints, and gets the same unsigned transactions to sign. Every body is JSON and every amount is a raw integer as a decimal string. The zod contract in `packages/contract` is the source of truth for every shape; this page is the map.

Base URL: `PUBLIC_API_URL` (locally `http://localhost:8791`). Everything below is under `/v1`.

## Reading, no key needed

| Endpoint | What it answers |
| --- | --- |
| `GET /platform` | Cluster, RPC for browsers, program and PlatformConfig addresses, the Graduation Target in lamports, the Platform Fee and Creator Fee as the chain has them now, the referral share rate. |
| `GET /quotes`, `GET /quotes/:mint` | The Quote Registry: every Quote Asset with its price, Graduation Target, whether it can be launched against, and whether a referral share fee applies on it. |
| `GET /launches` | The board. `sort` (`new`, `trending`, `marketCap`, `volume`, `graduating`), `category`, `quote`, `status`, `limit`, `offset`. |
| `GET /launches/quotes` | The Quote Assets that have Launches, for filters. |
| `GET /launches/:mint` | One Launch: curve progress, Graduation, Reward Tax, market. |
| `GET /launches/:mint/trades`, `/candles?interval=`, `/holders` | Indexed trades (with any referral fee paid), price candles, top holders read from the chain. |
| `GET /launches/:mint/quote` | A trade quote. `side`, `amount`, `slippageBps`, `payWith` (`quote` or `sol`), `referrer`. |
| `GET /launches/:mint/airdrop` | An Airdrop's recipients and which are paid. |
| `GET /launches/:mint/rewards`, `GET /rewards/rules`, `GET /rewards/rounds/:id`, `GET /wallets/:address/rewards` | Holder Rewards: tax waiting, the rules in force and announced, every round, a wallet's payouts. |
| `GET /creators/:address/fees`, `/claims` | A Creator's fee vaults and claims. |
| `GET /revenue`, `GET /ledger` | Platform revenue per asset and per day, and the Ledger page by page (`kind`, `limit`, `before`). |
| `GET /burns` | Burn and Flywheel: shares, rule, budgets, picks, every buy and burn. |
| `GET /announcements` | Every announced Platform Fee or Creator Fee change, with the transaction that applied it once it has. |

## Preparing transactions

Each returns an unsigned transaction (base64) for the user's wallet to sign and send, with its `lastValidBlockHeight`. Nothing is custodied.

| Endpoint | What it prepares |
| --- | --- |
| `POST /launches/prepare` (multipart) | A launch: `creator`, `quoteMint`, `name`, `symbol`, `description`, `website`, `x`, `telegram`, `image`, and the launch modes `firstBuy`, `airdrop`, `rewardTax`. The mint address is fixed at first prepare; `POST /launches/:mint/prepare` rebuilds the same launch for a retry. |
| `GET /launch-quote` | What a First Buy would get before anything is prepared. |
| `POST /launches/:mint/airdrop/prepare` | The Creator's airdrop payments, however many transactions they take. |
| `POST /trades/prepare` | A buy or sell, on the curve or in the pool: `mint`, `trader`, `side`, `amount`, `slippageBps`, `payWith`, `referrer`. |
| `POST /creator-fees/prepare` | A Creator Fee claim. |
| `POST /transactions/:signature` | Reports a confirmed transaction so it shows up without waiting for the webhook. |

## Referrals

A trade prepared with `referrer` pays that wallet LaunchLab's share fee, on-chain, in the Quote Asset, at `REFERRAL_SHARE_BPS` (50 by default), where the Quote Asset's GlobalConfig allows a share fee (`referralShare` on `GET /quotes`; SOL's allows up to 1%, most others, every tokenized stock among them, allow none). The quote says whether it applies and what it pays (`referral`), the trade records it (`referral` on each trade), and the referrer's Quote Asset account is opened by the trader if it doesn't exist. A trader can't refer themselves, and a pool trade after Graduation pays no referral fee. The web app takes the referrer from `?ref=<wallet>` on a coin page.

## API keys

Reads are open. A key identifies an integrator, meters its usage and bounds it: send it in `x-api-key` on every request. Past the key's per-minute limit the API answers 429 with `retry-after`; an unknown or revoked key is refused with 401. `GET /keys/me` shows the key's limit and its last hour of usage by minute, and stays reachable past the limit.

The operator issues keys: `POST /operator/api-keys` (`name`, `rateLimitPerMinute`, 60 by default) answers with the key once and never again; `GET /operator/api-keys` lists them without the key; `DELETE /operator/api-keys/:id` revokes one.

## The operator's endpoints

Behind `Authorization: Bearer <OPERATOR_TOKEN>`.

| Endpoint | What it does |
| --- | --- |
| `GET /operator/overview` | Launches by status, rounds, burns, the latest run of each job, open alerts, the fees on-chain. |
| `GET /operator/alerts` | Alerts: a stuck Graduation, a Reward Tax left unlocked, a failed job, a stalled Reward Round; each resolved when its cause goes away. |
| `GET /operator/jobs?job=` | Job runs and unsettled job transactions. |
| `POST /operator/jobs/{fee-collector,reward-rounds,burn}` | Runs a job now; `?fail=simulated` makes it fail on purpose to see the alert path. |
| `POST /operator/rewards/rules` | Announces a Reward Round rules change, effective no sooner than `REWARD_RULES_LEAD_SECONDS` ahead. |
| `PUT /operator/platform-token` | Names the Platform Token the Burn buys. |
| `POST /operator/fees/announce`, `POST /operator/fees/prepare` | Announces a Platform Fee or Creator Fee change, effective no sooner than `FEE_CHANGE_LEAD_SECONDS` ahead (a day on mainnet), and once due prepares the `update_platform_config` transaction for the cold admin key (ADR 0004). The Indexer marks the announcement applied when the change lands. |
| `POST /operator/api-keys` and the rest | See API keys. |
