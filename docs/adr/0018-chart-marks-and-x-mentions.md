# Chart Marks: trades from the indexed trades, Mentions from twitterapi.io while a coin trades

Status: accepted (#160, the owner's ask of 2026-10-31, built in the relay's charts lane on 2026-11-08; the X-linked names of part 3 wait on #159).

The owner wants a coin's chart to tell its story the way Pump.fun's and Axiom's do: who bought at what market cap, and which post on X moved it, as circles on the candles with the trader's or the author's picture.
Advanced Charts (#126, ADR 0017) draws such marks from the datafeed's `getMarks`, at most ten on a bar, each a circle with a ring colour, an image and a tooltip.

## Decision

- Trade Marks come from the indexed trades on each request to `GET /v1/launches/:mint/marks`, grouped by candle, wallet and side, with the market cap right after the group's last trade (its price after, times the supply).
  Nothing is stored and nothing new is indexed, as with the candles and the trust figures (ADR 0013).
- By default the chart marks the key wallets alone: the visitor's own, the Creator's, the Snipers' (the Snipe Window of ADR 0013), the ten largest holders' by their trades and the Notable Wallets'.
  Every trade is a click away (`trades=all`), ten a candle at most with the key wallets kept first, so a busy candle never hides the wallets a buyer checks.
- A wallet's picture is its generated avatar (the two hues the site draws, `avatarHues` in the contract), served by the API as an SVG at `/avatars/wallet/:wallet`; a Notable Wallet's is the picture the operator gave, copied into the bucket once.
- Mentions come from twitterapi.io, a pay-per-request X data API (the owner's shared env holds its key).
  The `mentions` job runs on the ten-minute cron and searches, for each coin that traded in the last half hour (`MENTIONS_ACTIVE_SECONDS`), at most ten coins a run (`MENTIONS_COINS_MAX`), one page of the latest posts naming the mint address, the page's link or the ticker as a cashtag, since that coin's last search less two minutes.
  Each post is stored once per coin (`coin_mentions`) with the market cap when it was posted, and its author's picture is copied into the bucket, since X moves pictures whenever their owner changes them; the API serves it at `/avatars/x/:id`.
- The job runs only when `TWITTERAPI_API_KEY` is set, a Worker secret only the owner sets: without it nothing is called, on the cron or by hand, so no paid call ever starts on its own.
  A 429 or a server error is tried again twice; a 429 that persists ends the run early without failing it, and the next run searches the coins it missed first.
  A 402 (credits gone), 401 or 403 fails the run, so the operator is alerted rather than the job paying for nothing.
- A Notable Wallet is named by the operator (`POST /v1/operator/notable-wallets`: handle, name, picture), the way terminals list known traders, until sign-in links wallets to X accounts (#159).

## Cost

twitterapi.io charges about $0.15 per thousand posts returned and at least $0.00015 a request.
A run costs at most ten pages of twenty posts, about $0.03, and six runs an hour make at most about $0.18 an hour, $4.30 a day, reached only when ten coins trade all day and each is named by twenty new posts every ten minutes.
A quiet coin costs one empty request a run while it trades, and nothing once it stops.

## Alternatives not taken

- Searching every coin on every run, or every coin ever launched: the cost would follow the number of coins, not the activity.
- X's own API: its pay-per-use tiers cost far more per post, and its free tier cannot search.
- A ticker search without the cashtag (plain words): common words match everything; the cashtag is the convention for a coin, and the mint address and the link are exact.
  A popular cashtag can still name another chain's coin; if the owner sees such noise on the chart, the search drops the cashtag and keeps the address and the link.

## Consequences

- Every test and every job on the test stack searches the stand-in in `tools/stack/src/x.ts`, never twitterapi.io: the stack sets `TWITTERAPI_API_URL` to it, which the API refuses on mainnet.
- The local dev API has no key, so the dev site shows Trade Marks and no Mentions until someone sets a key on purpose.
- The chart's head has a "Trades" and a "Posts" toggle, and a legend under the plot says what the rings mean and whose trades are marked, with the switch to every trade.
