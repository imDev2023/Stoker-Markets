# The public API

The web app is one client of the API among many ([ADR 0003](adr/0003-server-built-transactions.md)): a Telegram bot, a trading terminal or a script uses the same endpoints, and gets the same unsigned transactions to sign.
Every body is JSON and every amount is a raw integer as a decimal string.
The zod contract in [`packages/contract`](../packages/contract/src) is the source of truth for every shape; this page is the map.
The site's [API page](https://stoker.markets/api) introduces it, with a quickstart the API answers live; this file is the full reference until that page grows into it.

Base URL: `https://api.stoker.markets/v1` on mainnet; any deployment's is its `PUBLIC_API_URL` under `/v1` (locally `http://localhost:8791/v1`).
Every path below is relative to it.

## Reading, no key needed

Reads are open: no key and no signup, JSON back.
A caller without a key is bounded per IP address, generously ([API keys and limits](#api-keys-and-limits)).

### The platform and the Quote Registry

| Endpoint | What it answers |
| --- | --- |
| `GET /platform` | Cluster, RPC for browsers, program and PlatformConfig addresses, the Graduation Target in lamports, the Platform Fee and Creator Fee as the chain has them now (the latter 0 on our platform), the referral share rate, and `creatorForward`: the Creator's share of what the platform collects on their coin's trades ([ADR 0009](adr/0009-creator-earnings-off-chain.md)), `shareBps`, also as basis points of curve and pool volume, with its minimum. |
| `GET /quotes`, `GET /quotes/:mint` | The Quote Registry: every Quote Asset with its price, Graduation Target, whether it can be launched against, whether a referral share fee applies on it, and its Quote Risk Labels (`labels`: `kind`, `severity`, `title`, `detail`, `source`; null until the Quote Registry refresh has checked the mint, an empty list when there is nothing to flag). Labels come from the mint's authorities and Token-2022 extensions and from the token list; they inform and never block. |

### The board and one coin

| Endpoint | What it answers |
| --- | --- |
| `GET /launches` | The board. `sort` (`new`, `trending`, `market_cap`, `graduation`; `new` unless set), `q` (a search: name or ticker containing it in any case, or a mint address starting with it; up to 64 characters), `quote`, `category` (`sol`, `stablecoin`, `tokenized_stock`, `leveraged`, `collectible`, `community`), `issuer` (`xstocks`, `prestocks`, `tessera`, `backpack`: the stock issuer of the Quote Asset, finer than `category=tokenized_stock`), `status`, `limit` (50 unless set, up to 100) and `offset`; `nextOffset` is the next page's `offset`, null on the last. |
| `GET /launches/quotes` | The Quote Assets that have Launches, for filters; each with its `category` and, for a tokenized stock, its `issuer`. |
| `GET /launches/:mint` | One Launch: curve progress, Graduation, Reward Tax (with its `payout` asset, `coin` or `quote`), market. |
| `GET /launches/:mint/airdrop` | An Airdrop's recipients and which are paid; 404 for a coin launched without one. |

### Trades, candles and holders

| Endpoint | What it answers |
| --- | --- |
| `GET /launches/:mint/trades` | Indexed trades, newest first, each with its venue, fees and any referral fee paid; `limit` (50 unless set, up to 100). |
| `GET /launches/:mint/candles` | Price candles at `interval`: `1m`, `5m`, `15m`, `1h`, `4h` or `1d` (`5m` unless set), up to 500. |
| `GET /launches/:mint/holders` | The largest holders read from the chain (the 20 largest token accounts, grouped by owner) and the Creator's holding. |

### A trade quote

| Endpoint | What it answers |
| --- | --- |
| `GET /launches/:mint/quote` | A trade quote. `side`, `amount`, `slippageBps`, `payWith` (`quote` or `sol`), `referrer`. A buy paid with SOL on a coin paired with another asset carries `route`: the swap takes exactly `solIn`, the trade spends `quoteOut` (the least the swap may deliver, `slippageBps.route` under the current price), and about `kept` of the Quote Asset stays in the trader's wallet. |

### Holder Rewards

| Endpoint | What it answers |
| --- | --- |
| `GET /launches/:mint/rewards` | A Reward Launch's Holder Rewards: the Payout Asset, the tax waiting for the next round (from the chain), the rules, and its rounds, newest first; for a Quote Asset payout also the Reward Sales (`sales`: the bounds, totals, and the latest sales with their transactions). Amounts of a pot or payout are in the round's `payout` asset. 404 for a standard coin. |
| `GET /rewards/rules` | The Reward Round rules in force (`inForce`) and every announced version still to come (`upcoming`). |
| `GET /rewards/rounds/:id` | One round and its payouts, each with its status (`unpaid`, `sending`, `paid`, `returned`). |
| `GET /wallets/:address/rewards` | Every Holder Reward of one wallet across every Reward Launch, newest round first. |

### Creators

| Endpoint | What it answers |
| --- | --- |
| `GET /creators/:address/earnings` | Creator Earnings ([ADR 0009](adr/0009-creator-earnings-off-chain.md)): per Quote Asset what the Creator's Launches earned (half of what the platform collected on their trades), what was forwarded to their wallet and what is still pending; per Launch what its curve and pool earned. Nothing to claim. |
| `GET /creators/:address/forwards` | Every forward to that wallet with its transaction, newest first. |
| `GET /creators/:address/launch-permissions` | What the launch form offers this wallet: `airdrop` is true only for wallets the operator has allowed. |

### Revenue and the Ledger

| Endpoint | What it answers |
| --- | --- |
| `GET /revenue` | Platform revenue per asset and per day, with what of it was forwarded to Creators and what is still owed them. |
| `GET /ledger` | The Ledger, newest first, page by page: `kind`, `limit` (50 unless set, up to 100) and `before` (the previous page's `next`). A `creator_forward` entry is a payment to a Creator, an `arweave_top_up` SOL sent to ArDrive Turbo for upload credits, a `metadata_upload` what one Launch's permanent metadata cost in those credits, in lamports, against its launch transaction, a `reward_sale` a Reward Launch's tax sold for its holders: the coins out and the Quote Asset in, two entries of one transaction. |

### Burn and Flywheel

| Endpoint | What it answers |
| --- | --- |
| `GET /burns` | Burn and Flywheel: shares, rule, budgets, picks, every buy and burn. |

### Announcements

| Endpoint | What it answers |
| --- | --- |
| `GET /announcements` | Every announced Platform Fee or Creator Fee change, with the transaction that applied it once it has. |

## Preparing transactions

Each returns an unsigned transaction (base64) for the user's wallet to sign and send, with its `lastValidBlockHeight`.
Nothing is custodied: the API never holds a key of yours, and a transaction it prepares does only what its endpoint says.

| Endpoint | What it prepares |
| --- | --- |
| `POST /launches/prepare` (multipart) | A launch: `creator`, `quoteMint`, `name`, `symbol`, `description`, `website`, `x`, `telegram`, `image`, and the launch modes `firstBuy`, `airdrop`, `rewardTax` and, with it, `rewardPayout` (`coin` or `quote`; `coin` unless set, refused with 400 without `rewardTax`). An `airdrop` from a wallet the operator has not allowed is refused with 403. The mint address and the coin's `metadataUri` on Arweave are fixed at first prepare; `POST /launches/:mint/prepare` rebuilds the same launch for a retry. The image and metadata JSON are uploaded to Arweave once the launch is indexed ([ADR 0008](adr/0008-permanent-metadata-on-arweave.md)); until then the URI answers 404. |
| `GET /launch-quote` | What a First Buy would get before anything is prepared. |
| `POST /launches/:mint/airdrop/prepare` | The Creator's airdrop payments, however many transactions they take. |
| `POST /trades/prepare` | A buy or sell, on the curve or in the pool: `mint`, `trader`, `side`, `amount`, `slippageBps`, `payWith`, `referrer`. `amount` is in raw units of what is paid: the Quote Asset for a buy (lamports when `payWith` is `sol`), the coin for a sell. |
| `POST /transactions/:signature` | Reports a confirmed transaction so it shows up without waiting for the webhook. |

### Sign, send, report

The same three steps for a launch, a trade or an airdrop: deserialize the transaction, sign it with the wallet it was prepared for, send it to the chain, then report its signature so it shows up at once rather than when the webhook delivers it.
A launch transaction already carries the new mint's signature; the Creator's wallet signs as fee payer.
In a browser a Wallet Standard wallet signs with `signTransaction`, and the rest is the same.

```js
import { Connection, VersionedTransaction } from "@solana/web3.js";

const api = "https://api.stoker.markets/v1";
const prepared = await (await fetch(`${api}/trades/prepare`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ mint, trader: wallet.publicKey.toBase58(), side: "buy", amount: "100000000", slippageBps: 100 }),
})).json();

const tx = VersionedTransaction.deserialize(Buffer.from(prepared.transaction, "base64"));
tx.sign([wallet]);
const connection = new Connection(rpcUrl, "confirmed"); // your own RPC, or rpcUrl from GET /platform
const signature = await connection.sendTransaction(tx);
await connection.confirmTransaction({ signature, blockhash: tx.message.recentBlockhash, lastValidBlockHeight: prepared.lastValidBlockHeight }, "confirmed");
await fetch(`${api}/transactions/${signature}`, { method: "POST" });
```

## Referrals

A trade prepared with `referrer` pays that wallet LaunchLab's share fee, on-chain, in the Quote Asset, at `REFERRAL_SHARE_BPS` (50 by default), where the Quote Asset's GlobalConfig allows a share fee (`referralShare` on `GET /quotes`; SOL's allows up to 1%, most others, every tokenized stock among them, allow none).
The quote says whether it applies and what it pays (`referral`), the trade records it (`referral` on each trade), and the referrer's Quote Asset account is opened by the trader if it doesn't exist.
A trader can't refer themselves, and a pool trade after Graduation pays no referral fee.
The web app takes the referrer from `?ref=<wallet>` on a coin page.

## API keys and limits

Reads are open, and a caller without a key is bounded per IP address: 300 requests a minute, and 25 prepare requests a minute (`ANON_RATE_LIMIT_PER_MINUTE`, `ANON_PREPARE_RATE_LIMIT_PER_MINUTE`), answered past the limit with 429 and `retry-after`.
The Helius webhook and the operator's endpoints are not counted.
A key identifies an integrator, meters its usage and bounds it: send it in `x-api-key` on every request.
Past the key's per-minute limit (60 unless the operator set another) the API answers 429 with `retry-after`; an unknown or revoked key is refused with 401.
`GET /keys/me` shows the key's limit and its last hour of usage by minute, and stays reachable past the limit.

Keys are issued by hand today: write to [info@stoker.markets](mailto:info@stoker.markets) with what you are building and the rate you need.
The operator issues them from the `/operator` page or directly: `POST /operator/api-keys` (`name`, `rateLimitPerMinute`, 60 by default) answers with the key once and never again; `GET /operator/api-keys` lists them without the key; `DELETE /operator/api-keys/:id` revokes one.

## Errors

An error answers `{ "error": "<one sentence>" }`, with the status that says what kind it is.

| Status | When |
| --- | --- |
| 400 | The body or query isn't what the contract asks (`details` carries zod's issues, each with its `path` and `message`), an address that isn't a wallet address, a mint that is no Quote Asset, or a launch mode that can't be set up as given. |
| 401 | An unknown or revoked key in `x-api-key`; the operator's endpoints without their token. |
| 403 | A launch with an airdrop from a wallet the operator hasn't allowed one. |
| 404 | No such coin, Quote Asset, round or key; `/rewards` of a coin that is no Reward Launch; `/airdrop` of a coin launched without one; a reported transaction not found or not confirmed yet. |
| 409 | A retry of a coin that has already launched (`details.mint`); an airdrop that can't be sent right now: every wallet paid, the coin not launched yet, or transactions handed out a moment ago that can still land (`details.retryAfterSeconds`). |
| 422 | Well-formed, but not as asked: a Quote Asset the curve rules don't admit at today's price, or a buy paid with SOL where no route exists or none fits one transaction. |
| 429 | Past a rate limit; `retry-after` says how many seconds to wait. |
| 500, 503 | Ours: an internal error, or a dependency down for the moment (the price source, the SOL route, reading holders from the chain). Try again in a minute. |

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
| `GET /operator/mint-keys`, `POST` (`creator`, `secretKey`: a keypair file's 64 bytes), `DELETE /operator/mint-keys/:mint` | Mint keys chosen for a Creator wallet's next launch (the Platform Token's vanity address, #75), kept encrypted under `MINT_KEY_SECRET`; the list says which a draft has taken, never the secret. A taken key can't be removed; a stored address that is already a coin or draft here is refused. |
| `POST /operator/fees/announce`, `POST /operator/fees/prepare` | Announces a Platform Fee or Creator Fee change, effective no sooner than `FEE_CHANGE_LEAD_SECONDS` ahead (a day on mainnet), and once due prepares the `update_platform_config` transaction for the cold admin key (ADR 0004). The Indexer marks the announcement applied when the change lands. |
| `POST /operator/api-keys` and the rest | See API keys. |
