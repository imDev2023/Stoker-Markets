# The Creator Ladder: a coin's tier, climbed by Active Days, sets the Creator's share of its pool fees

Status: accepted by the owner on 2026-11-10 (#188), implemented on the local chain.
Amends ADR 0009: its one rule (half to the Creator on either venue) is the ladder's first tier, and after Graduation the share of the pool creator fee climbs.
Supersedes the tier table in ADR 0019, whose Graduated tier paid 60% from the Graduation itself.

ADR 0019 recorded that the Creator's share would climb in a ladder with a floor of 50% and left three questions to this issue.
The owner answered them on 2026-11-10:

- "Staying power" is measured in Active Days, not in holders or in total volume.
- The ladder itself changed: 50% on the curve and after Graduation, 60% after 15 days, 70% after 30.
  Graduation alone no longer raises the share.
- A tier belongs to the coin, never to the Creator across their coins.
- Coins that graduated before the ladder are on the same ladder as any other.

The owner's days were given as a count beside the choice of Active Days as the measure, so the 15 and the 30 are read as Active Days.
If calendar days since Graduation were meant instead, that is a new version of the ladder's rule and a change of the count in `ladder.ts`, not of the model.

## The ladder

| Creator Tier | Reached | Creator's share of what the platform collects on the coin | Creator earns | Platform Net |
| --- | --- | --- | --- | --- |
| First | From the launch, on the curve and after Graduation | 50% of the Platform Fee on the curve, 50% of the pool creator fee that arrives | 0.50% of curve volume, about 0.48% of pool volume | 0.50% on the curve, about 0.69% in the pool |
| Second | 15 Active Days | 60% of the pool creator fee that arrives | 0.57% of pool volume | about 0.59% |
| Top | 30 Active Days | 70% | about 0.67% | about 0.50% |

The figures are mainnet's, as in ADR 0019: 0.95% of a pool trade arrives as the pool creator fee after Raydium's 5%, and about 0.21% through the Fee Key, which stays the platform's alone at every tier.
The first tier's share is the floor, `CREATOR_SHARE_FLOOR_BPS` (5000), the half of ADR 0009; on the curve it is the only share there is.

## Active Days

An Active Day is a UTC day on which the indexed trades in a graduated coin's pool came to at least 1% of the coin's own Graduation Target, in its Quote Asset (`activeDayFloorBps`, 100).

- The floor is a part of the coin's own Graduation Target, which the launch fixed in the Quote Asset's units, so it needs no price and no price history and reads the same for a coin paired with SOL, a stablecoin or a tokenized stock: about 0.85 SOL a day at mainnet's 85 SOL target.
- Days need not follow one another, and the count only grows: a coin that goes quiet and comes back keeps the days it had.
- A day counts as soon as its volume passes the floor, the current day included.
- Only pool trades count, so the count starts at Graduation.
- The Fee Collector counts them, every hour before it collects, and keeps each coin's count on its `graduations` row (`active_days`).
  Every page reads that stored count: a coin's page asks for its coin every few seconds, and a count over all its pool trades would be paid on each read.
- A coin on the top tier is no longer counted; its count stays the one that reached the tier.
- Anyone can recount it from `GET /v1/launches/:mint/trades` or the day candles.

Faking a day costs a day's floor in real trades and their fees, on thirty separate days for the top tier.
What the top tier buys is a larger share of fees that only exist if the coin really trades, so a count padded on a dead coin earns nothing.

## A tier is recorded, once

The Fee Collector, before it collects, counts the Active Days of every graduated coin below the top tier under the ladder in force and writes one `creator_tiers` row for each tier a coin has newly reached, with the chain's confirmed slot.
A pool creator fee collection is shared at the tier its coin held when it landed: the highest tier recorded in an earlier slot, the first without one.
The collections of the same run land in later slots, so they already earn the new tier.

- Nothing collected before a tier was recorded moves, so what a Creator has been paid never changes after the fact.
- A row is never changed or removed, so a coin's tier only ever climbs, whatever a later version of the ladder asks of coins that have not reached it yet.
- What a Creator is owed stays a sum anyone can redo: the Ledger's `pool_fee` entries, the published ladder versions and the coin's recorded tiers (`creatorTier` on `GET /v1/launches/:mint`).
- A coin's count and tier follow its trades by up to an hour, the Fee Collector's period; no fee is collected in between, so no share is lost.

A tier derived from the trades at every read was rejected: a trade indexed late would have moved a tier's date into the past and with it shares already paid.

## Versions

The ladder is versioned like the Budget Table (ADR 0019) and the Reward Round rules (ADR 0006).

- A version is the second and the top tier's share and Active Days and the floor of an Active Day.
  The shares climb (above the first tier's half, the top above the second, never past the whole fee) and so do the days; the API refuses any other, and so does Postgres, with check constraints on `creator_ladders`.
- Version 1 is the owner's ladder, written by migration `0026_creator_ladder` and in force from the first lamport.
  That backdates nothing: a higher tier's share applies only after its row is written, and no coin had a row.
- The operator announces the next version with `POST /v1/operator/creator-ladder`.
  It takes effect no sooner than the fee change's lead time (`FEE_CHANGE_LEAD_SECONDS`) and later than every version before it, and is never edited or withdrawn.
- A collection is shared under the version in force at its block time.
  A coin keeps the tier it was recorded on through every version; only the tier's share is the new version's.
- The floor in force now is applied to every day since Graduation when Active Days are counted.

A fourth tier would be a migration, as a seventh row of the Budget Table would.

## Earlier coins

A coin that graduated before the ladder is counted like any other: its Active Days since Graduation, its tier recorded by the first Fee Collector run that finds it has reached one, and the tier's share on what is collected from then on.
Mainnet had no Launch when the ladder was written; the devnet rehearsal's three graduated coins start with the days they have.

## Where it shows

- `GET /v1/platform` carries the ladder under `creatorForward.ladder`: the version in force and any announced for later.
- `GET /v1/creator-ladder` carries every version.
- `GET /v1/launches/:mint` carries a graduated coin's `creatorTier`; `GET /v1/creators/:address/earnings` carries each Launch's `tier`.
- The Fees page shows the tiers with their shares, the one page with a fee figure (owner, 2026-10-30).
- The coin page and the Creator's own page name the tier and count the Active Days, in words.
- `/announcements` lists every version after the first.

## Considered Options

- 60% from the Graduation itself, ADR 0019's table: replaced by the owner on 2026-11-10 with 15 Active Days, which keeps the busy days after a Graduation at half.
- A count of holders held over a period: cheap to fake with dust wallets, and the indexed holder count comes from trades, so it misses transfers.
- Days since Graduation with a total volume: exact from the Ledger alone, but a coin that did its volume in two days and died would still reach the top tier.
- A tier per Creator across their coins: one success would carry any number of weak coins, and a wallet's rank can be farmed.
- Counting a coin's days from its trades at every read: the coin page reads its coin every four seconds, and the cost would grow with every trade the coin ever had.
- A daily volume table written with each trade: a second write on the indexing path for every pool trade, and a figure that could drift from the trades it sums.
- The floor in SOL at the Quote Registry's price: there is no price history to value a past day with.
- The ladder as constants in the code: a changed share would apply to everything ever collected, and nothing would enforce a lead time (the reasons ADR 0019 gives for the Budget Table).
- A day's length as a rule: it is a setting, `ACTIVE_DAY_SECONDS`, that only a test stack may shorten; mainnet refuses any length but a UTC day.

## Consequences

- Each database needs migration `0026_creator_ladder` before the API that follows it is deployed; no share moves until a coin has 15 Active Days.
- A higher tier makes the Platform Net smaller on that coin, and every row of the Budget Table keeps its share of it (ADR 0019).
- An Active Day depends on the Indexer having seen the pool's trades; a trade it missed can only delay a tier, never grant one.
- Site copy outside the Fees page still says "half" where it speaks of what every coin starts with; the pitch's wording for the ladder is the owner's to pick.
