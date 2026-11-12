# Traps: the API, the Indexer, the jobs and the Ledger

Read before touching `apps/api`: a job, the Indexer, the Ledger, the Burn, a Quote Asset's data or an outside API the Worker calls.
Moved out of `CLAUDE.md` on 2026-11-12 so it is read on demand; `CLAUDE.md` keeps the index.
The text is the original's, one sentence a line.

## The Indexer and the data

- Decode Helius payloads as raw RPC `getTransaction` JSON (`accountKeys` strings); web3.js's parsed `getTransaction` object has a different shape.
- Write every trade row (curve or pool) through `insertTrade` in `apps/api/src/market.ts`, never `db.insert(trades)`: it also moves the Launch's `launch_markets` price, which the board's market caps and sorts read.
- Never classify a Quote Asset by its name: a pump.fun coin on mainnet calls itself "GoPro - Backpack Securities".
  Categories, and for a tokenized stock its issuer (`issuer` on a Quote Asset: xStocks, PreStocks, Tessera or Backpack, the board's "Paired with" chips), come from the mint address (SOL, stablecoins, Hylo's leveraged tokens, the collectibles) or the issuer's freeze authority or permanent delegate, in `apps/api/src/quotes/categories.ts`; a new issuer needs its authorities added there, read live from one of its mints, and a new leveraged token or collectible its mint address.
  "Sunrise" is not an issuer: it is the partner that brings Backpack Securities' stocks to Solana, the same 79 mints under the same authorities, so our Backpack chip is that set (owner, 2026-10-07).
- Drizzle `sql` templates with a `Date` parameter fail under our `postgres` client settings; pass `toISOString()` and cast `::timestamptz`.
- A Helius webhook's new address takes minutes to take effect: a pool trade made about a minute after its pool was added never arrived, and one made a few minutes later arrived in 2 seconds.
  The site's own trades are covered by the fast path (`POST /v1/transactions/:signature`), and the graduation watch backfills the rest: for `POOL_BACKFILL_SECONDS` (900 in production, 8 on the test stack) after a Graduation is indexed it reads the pool's history every run from `graduations.backfilled_until`, then closes the backfill (`backfill_closed_at`).
  A backend test that wants a pool trade to stay unindexed must make it after that window has closed.
  The webhook never watches quote mints (owner, 2026-10-04): a busy mint such as wrapped SOL would deliver every transaction that names it, so Quote Risk Labels follow an issuer's change at the five-minute Quote Registry refresh.

## The Ledger, the fees and the Burn

- `ledger_entries` is append-only in Postgres itself (a trigger rejects UPDATE, DELETE and TRUNCATE): fix a wrong entry with a new one, never an edit.
  A `metadata_upload` entry is keyed by the launch transaction at event index 900 (image) and 901 (metadata JSON), clear of any revenue index; an `arweave_top_up` by the transfer's own signature.
- A `sweep` Ledger entry is what left the operations wallet, not what reached the treasury: for a coin with a Reward Tax the two differ, and counting the arrival made every later sweep take the difference out of the holders' harvested tax, which shares the wallet's coin account with the pool fees collected in the coin.
  Revenue coming in is recorded as what arrived.
- The Ledger orders entries newest first by slot, then by when it recorded them (`recorded_at`, carried in the page cursor as epoch microseconds): a job's claims often share a slot, and ordered by signature alone, which is random, the revenue page's rows came out in a different order on one stack in six (2026-10-27).
- A burn transaction that closes the operations wallet's coin account gets that rent back; the Ledger's "SOL spent" adds the refund back, or a tiny buy shows as negative.
- The Burn buys only in the coin's own graduated pool, never the curve and never a coin through Jupiter: a SOL-paired coin directly, a coin paired with another Quote Asset in two steps in one transaction (the route source swaps SOL into the Quote Asset in the operations wallet's account, then `swap_base_output` buys an exact number of coins).
  The Quote Asset the swap delivers beyond what the pool took stays in the operations wallet, outside the Ledger.
  Until the Platform Token has graduated every run skips it with "no SOL route to the Platform Token".
  A Reward Launch's coin account in the operations wallet holds the tax harvested for holders and the buy's own withheld tax, so a burn of a coin with a transfer fee leaves the account open, and the rent of one it opens is kept out of the Ledger's spend (found on devnet).
- What a Creator earns after Graduation is shown from the chain too: `creatorForward.poolBps` on `GET /v1/platform` is half the creator fee of the CPMM config the PlatformConfig names.
  Since 2026-10-25 the local chain's PlatformConfig names a clone of mainnet's chosen config (`CRRS5i...`'s data at `DHHEU8...`, the devnet-derived address for its index, 1%), so the local site reads mainnet's one figure for both venues (owner: never show the 0.125% that devnet's 0.25% config gives); the devnet rehearsal still reads "~0.5% on the curve and ~0.125% after graduation" (`apps/web/src/lib/fees.ts`).

## Jobs and outside APIs

- Job summaries are stored and logged as JSON: never put a `bigint` in one (`Do not know how to serialize a BigInt` kills the whole scheduled run); convert to strings, as `budgetsView` does.
- A job that sends many transactions from a Worker must send a few at a time, each batch with a fresh blockhash and confirmed before the next: the first mainnet Quote Registry runs (2026-10-14) sent ten at once with one blockhash for the whole run, the Helius free plan's throttling (10 requests and 1 `sendTransaction` a second, retried by web3.js) stretched the sends past the blockhash's validity, 281 writes were rejected with "Blockhash not found", 114 fetches were cancelled by the Worker's six-connection cap, and the summary still said `ruleWrites: 120` because it counted intent.
  `sendInstructionGroups` in `apps/api/src/quotes/registry.ts` now sends four at a time and reports `ruleWrites` (landed) and `ruleWriteFailures`.
  Every band move is its own transaction (one asset's two rule groups are 772 bytes, two don't fit 1,232), so the fee per move is fixed and the only saving is fewer moves: the band re-centres at 5% of drift since 2026-10-24 (ADR 0005 amended; at 2.5% mainnet rewrote 4,000 to 5,900 rules a day, 0.03 SOL, 541 of 586 priced assets in one day).
  The test stack's prices are static (`PRICE_SOURCE=static`), so `quotes.test.ts` proves a move by writing a band off-centre with the operations key and refreshing.
- Jupiter's free plan is a window of 10 requests (about ten seconds; `x-ratelimit-remaining`, `x-ratelimit-reset`), and a Quote Registry refresh of mainnet's 605 assets makes about thirty calls: the first mainnet refresh died in a second with `Jupiter /price/v3 failed: 429` (2026-10-14).
  `jupiterMarket` in `apps/api/src/quotes/pricing.ts` now paces itself from the headers and retries a 429 after the window, and the stand-in in `tools/stack/src/market.ts` keeps the same window and refuses its very first price request, so every stack start proves the retry; on the free plan a full refresh takes about half a minute.
- Turbo's free tier (items up to 107,520 bytes, 10 MiB per wallet and per IP for life) makes small images free, so a test that wants to see a top-up and a `metadata_upload` entry must send an image larger than that (the API only sniffs an image's first bytes); `arweave.test.ts` appends random bytes to the 1x1 PNG.
  The WebCrypto and fetch calls in `packages/arweave` want ArrayBuffer-backed views; `plainBytes` is the one cast, never a copy.
