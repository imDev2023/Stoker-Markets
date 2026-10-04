# The public API

The web app is one client of the API among many (ADR 0003): a Telegram bot, a trading terminal or a script uses the same endpoints, and gets the same unsigned transactions to sign. Every body is JSON and every amount is a raw integer as a decimal string. The zod contract in `packages/contract` is the source of truth for every shape; this page is the map.

Base URL: `PUBLIC_API_URL` (locally `http://localhost:8791`). Everything below is under `/v1`.

## Reading, no key needed

| Endpoint | What it answers |
| --- | --- |
| `GET /platform` | Cluster, RPC for browsers, program and PlatformConfig addresses, the Graduation Target in lamports, the Platform Fee and Creator Fee as the chain has them now, the referral share rate, and `creatorForward`: what the platform forwards to a Creator on top of the Creator Fee (ADR 0007), in basis points of curve and pool volume, with its minimum. |
| `GET /quotes`, `GET /quotes/:mint` | The Quote Registry: every Quote Asset with its price, Graduation Target, whether it can be launched against, whether a referral share fee applies on it, and its Quote Risk Labels (`labels`: `kind`, `severity`, `title`, `detail`, `source`; null until the Quote Registry refresh has checked the mint, an empty list when there is nothing to flag). Labels come from the mint's authorities and Token-2022 extensions and from the token list; they inform and never block. |
| `GET /launches` | The board. `sort` (`new`, `trending`, `marketCap`, `volume`, `graduating`), `category`, `quote`, `status`, `limit`, `offset`. |
| `GET /launches/quotes` | The Quote Assets that have Launches, for filters. |
| `GET /launches/:mint` | One Launch: curve progress, Graduation, Reward Tax (with its `payout` asset, `coin` or `quote`), market. |
| `GET /launches/:mint/trades`, `/candles?interval=`, `/holders` | Indexed trades (with any referral fee paid), price candles, top holders read from the chain. |
| `GET /launches/:mint/quote` | A trade quote. `side`, `amount`, `slippageBps`, `payWith` (`quote` or `sol`), `referrer`. A buy paid with SOL on a coin paired with another asset carries `route`: the swap takes exactly `solIn`, the trade spends `quoteOut` (the least the swap may deliver, `slippageBps.route` under the current price), and about `kept` of the Quote Asset stays in the trader's wallet. |
| `GET /launches/:mint/airdrop` | An Airdrop's recipients and which are paid. |
| `GET /launches/:mint/rewards`, `GET /rewards/rules`, `GET /rewards/rounds/:id`, `GET /wallets/:address/rewards` | Holder Rewards: the Payout Asset, tax waiting, the pot, the rules in force and announced, every round, a wallet's payouts; for a Quote Asset payout also the Reward Sales (`sales`: the bounds, totals, and the latest sales with their transactions). Amounts of a pot or payout are in the round's `payout` asset. |
| `GET /creators/:address/fees`, `/claims`, `/forwards` | A Creator's fee vaults and claims, and the Creator Forward: per Quote Asset what was earned, forwarded and is still pending, per Launch what its curve and pool earned, and every forward with its transaction. |
| `GET /creators/:address/launch-permissions` | What the launch form offers this wallet: `airdrop` is true only for wallets the operator has allowed. |
| `GET /revenue`, `GET /ledger` | Platform revenue per asset and per day, with what of it was forwarded to Creators and what is still owed them, and the Ledger page by page (`kind`, `limit`, `before`; a `creator_forward` entry is a payment to a Creator, an `arweave_top_up` SOL sent to ArDrive Turbo for upload credits, a `metadata_upload` what one Launch's permanent metadata cost in those credits, in lamports, against its launch transaction, a `reward_sale` a Reward Launch's tax sold for its holders: the coins out and the Quote Asset in, two entries of one transaction). |
| `GET /burns` | Burn and Flywheel: shares, rule, budgets, picks, every buy and burn. |
| `GET /announcements` | Every announced Platform Fee or Creator Fee change, with the transaction that applied it once it has. |

## Preparing transactions

Each returns an unsigned transaction (base64) for the user's wallet to sign and send, with its `lastValidBlockHeight`. Nothing is custodied.

| Endpoint | What it prepares |
| --- | --- |
| `POST /launches/prepare` (multipart) | A launch: `creator`, `quoteMint`, `name`, `symbol`, `description`, `website`, `x`, `telegram`, `image`, and the launch modes `firstBuy`, `airdrop`, `rewardTax` and, with it, `rewardPayout` (`coin` or `quote`; `coin` unless set, refused with 400 without `rewardTax`). An `airdrop` from a wallet the operator has not allowed is refused with 403. The mint address and the coin's `metadataUri` on Arweave are fixed at first prepare; `POST /launches/:mint/prepare` rebuilds the same launch for a retry. The image and metadata JSON are uploaded to Arweave once the launch is indexed (ADR 0008); until then the URI answers 404. |
| `GET /launch-quote` | What a First Buy would get before anything is prepared. |
| `POST /launches/:mint/airdrop/prepare` | The Creator's airdrop payments, however many transactions they take. |
| `POST /trades/prepare` | A buy or sell, on the curve or in the pool: `mint`, `trader`, `side`, `amount`, `slippageBps`, `payWith`, `referrer`. |
| `POST /creator-fees/prepare` | A Creator Fee claim. |
| `POST /transactions/:signature` | Reports a confirmed transaction so it shows up without waiting for the webhook. |

## Referrals

A trade prepared with `referrer` pays that wallet LaunchLab's share fee, on-chain, in the Quote Asset, at `REFERRAL_SHARE_BPS` (50 by default), where the Quote Asset's GlobalConfig allows a share fee (`referralShare` on `GET /quotes`; SOL's allows up to 1%, most others, every tokenized stock among them, allow none). The quote says whether it applies and what it pays (`referral`), the trade records it (`referral` on each trade), and the referrer's Quote Asset account is opened by the trader if it doesn't exist. A trader can't refer themselves, and a pool trade after Graduation pays no referral fee. The web app takes the referrer from `?ref=<wallet>` on a coin page.

## API keys

Reads are open, and a caller without a key is bounded per IP address: 300 requests a minute, and 25 prepare requests a minute (`ANON_RATE_LIMIT_PER_MINUTE`, `ANON_PREPARE_RATE_LIMIT_PER_MINUTE`), answered past the limit with 429 and `retry-after`. The Helius webhook and the operator's endpoints are not counted. A key identifies an integrator, meters its usage and bounds it: send it in `x-api-key` on every request. Past the key's per-minute limit the API answers 429 with `retry-after`; an unknown or revoked key is refused with 401. `GET /keys/me` shows the key's limit and its last hour of usage by minute, and stays reachable past the limit.

The operator issues keys, from the `/operator` page or directly: `POST /operator/api-keys` (`name`, `rateLimitPerMinute`, 60 by default) answers with the key once and never again; `GET /operator/api-keys` lists them without the key; `DELETE /operator/api-keys/:id` revokes one.

## The operator's endpoints

Behind `Authorization: Bearer <OPERATOR_TOKEN>`.

| Endpoint | What it does |
| --- | --- |
| `GET /operator/overview` | Launches by status, rounds, burns, Launches with their metadata on Arweave and still waiting (`metadataUploads`), the latest run of each job, open alerts, the fees on-chain. |
| `GET /operator/alerts` | Alerts: a stuck Graduation, a Reward Tax left unlocked, a failed job, a stalled Reward Round; each resolved when its cause goes away. |
| `GET /operator/jobs?job=` | Job runs and unsettled job transactions. |
| `POST /operator/jobs/{quote-registry,fee-collector,creator-forward,reward-rounds,burn,metadata-upload}` | Runs a job now; `?fail=simulated` makes it fail on purpose to see the alert path. |
| `POST /operator/rewards/rules` | Announces a Reward Round rules change, effective no sooner than `REWARD_RULES_LEAD_SECONDS` ahead. |
| `PUT /operator/platform-token` | Names the Platform Token the Burn buys. |
| `GET /operator/airdrop-creators`, `POST` (`wallet`), `DELETE /operator/airdrop-creators/:wallet` | The Creator wallets allowed an airdrop at launch. The list starts empty, so nobody is offered one until the operator names a wallet. |
| `POST /operator/fees/announce`, `POST /operator/fees/prepare` | Announces a Platform Fee or Creator Fee change, effective no sooner than `FEE_CHANGE_LEAD_SECONDS` ahead (a day on mainnet), and once due prepares the `update_platform_config` transaction for the cold admin key (ADR 0004). The Indexer marks the announcement applied when the change lands. |
| `POST /operator/api-keys` and the rest | See API keys. |
