# The Platform Net is divided by one Budget Table, in versions announced ahead

Status: accepted by the owner on 2026-11-09 (#187), implemented on the local chain.
Amends ADR 0006: the Burn's and the Flywheel's shares are rows of the table, no longer two settings.
Records the tiers that ADR 0009's one rule (half to the Creator) grows into; the ladder itself (#188) and the trader programs are separate issues and are not built here.

On 2026-11-09, after Stross's article on StonkFun (https://x.com/0xStross/status/2119520800000897171), the owner decided that the Creator's share will climb in a ladder and that traders get programs of their own: volume rebates, referrals on every pair and an integrator share.
Every one of them is paid from the same pot, what the platform keeps of its revenue after the Creators' share.
Until now that pot was divided by two settings (`BURN_SHARE_BPS`, `FLYWHEEL_SHARE_BPS`) with the treasury taking whatever they left.
Each new program would have added a setting of its own, nothing would have kept their sum under 100%, and a changed setting would have been applied to everything ever collected.

## The Platform Net

The Platform Net is every revenue kind the Ledger records (`platform_fee`, `pool_fee`, `fee_key`) less the Creators' share of it, exactly as ADR 0009 and ADR 0015 compute it for the sweep: what was collected for Creators is theirs whether forwarded yet or not, and a Graduation Fee withheld out of a Creator's share is the platform's.
It is counted per Quote Asset in the asset's own units and valued in SOL at the Quote Registry's latest prices, SOL at par; an asset without a price, or a coin a Fee Key paid out, counts for nothing until it has one (ADR 0006).
Fee Key collections are the platform's alone: no Creator's share comes out of them at any tier, so they enter the net whole.
What a trader pays to anyone else (Raydium, a referrer through LaunchLab's on-chain share fee, Solana) never reaches the Ledger as revenue and is no part of the net.

## The Budget Table

One table divides the net.
A row is a budget, and its share is in basis points of the net.

| Row | What it pays for | Version 1 |
| --- | --- | --- |
| `burn` | The Burn: buys the Platform Token and burns it (ADR 0006) | 60% |
| `flywheel` | The Flywheel: buys the top graduated coins and burns them (ADR 0006) | 5% |
| `rebates` | Volume rebates to traders, when built | 0% |
| `referrals` | The off-chain referral program for every pair, when built (the on-chain share fee of #21 is paid by the trade and is not this row) | 0% |
| `integrators` | The integrator share, when built | 0% |
| `treasury` | The remainder, which the sweep moves to the Treasury | 35% |

- The shares of a version sum to exactly 100%, and none is negative.
  The API refuses any other table, and so does Postgres itself, with a check constraint on `budget_tables`.
  The treasury's share is written out rather than derived, so a typing mistake in another row fails the sum instead of quietly moving the treasury's share.
- The table is the only place a share is set: `apps/api/src/fees/budget.ts` reads it for the Burn, the Flywheel, the sweep and every page.
  `BURN_SHARE_BPS` and `FLYWHEEL_SHARE_BPS` are gone.
- The table is versioned like the Reward Round rules (ADR 0006).
  Version 1 is today's division and is in force from the first lamport.
  The operator announces the next version with `POST /v1/operator/budget-table`: every row's share, the time it takes effect and a note.
  A version takes effect no sooner than the fee change's lead time after it is announced (`FEE_CHANGE_LEAD_SECONDS`, a day on mainnet and never under an hour there, #22), and later than every version before it, so the versions are one line in time.
  A version is never edited or withdrawn; a mistake is corrected by the next version.
- A new program is one row and one announcement.
  A row beyond these six is a column added by a migration, with the program that spends it.

## Budgets by period

A version's shares apply to the net collected while it is in force, never to what was collected before it.
The Ledger decides when: a revenue entry belongs to the version in force at its block time, a curve trade's Creator's share to the Platform Fee claim that collected it, and a withheld Graduation Fee to its own entry.

With the versions in force so far taking effect at `e1 < e2 < ... < ek`, let `C(t)` be the net from Ledger entries before `t`, valued at the latest prices, and `C(now)` all of it.
A row's allotment is the sum over the versions of `(C(e[i+1]) - C(e[i])) * share[i]`, with `C(e1)` taken as zero so that version 1 covers everything before version 2, and `C(e[k+1])` as `C(now)`.
What a row has left is its allotment less what the Ledger shows it spent (`burn` and `flywheel` entries today; a program names its Ledger kind when it is built), never under zero.
While a row's share has never changed this is the formula ADR 0006 had: the row's share of the whole net.

Everything in it is a sum over the Ledger, the indexed trades and the published versions, so anyone can redo it; `GET /v1/budgets` carries every version, the net and each row's allotment, spending and remainder.
The sweep leaves in the operations wallet what every row but the treasury has not spent yet.

## The planned table (owner, 2026-11-09)

The trader programs are paid for by the Burn alone.
Once all three are live the table reads Burn 40%, Flywheel 5%, the trader programs 20% together and treasury 35%.

- A program's row stays at 0% until that program is built and running.
  A row with a share and no spender would only pile its budget up in the operations wallet, the one hot key (ADR 0004).
- Each program's own issue proposes its share inside the 20%, and going live is one announced version that moves that share from `burn` to the program's row.
  The Flywheel and the treasury keep their shares through it.
- The three together never take more than 20% (`TRADER_PROGRAMS_MAX_BPS`), which the API enforces on every version, so the Burn keeps 40% or more through all of them.
  A larger figure is a new decision of the owner's, recorded as an amendment here before it is a table.

## The Creator ladder's tiers

Superseded by ADR 0020 (owner, 2026-11-10): the ladder as built is 50% on the curve and after Graduation, 60% after 15 Active Days and 70% after 30, so Graduation alone no longer raises the share.
The table below is the plan as it stood on 2026-11-09; the two ends of the ladder, and so the rows' worth under it, are unchanged.

The ladder is built under #188; its tiers are recorded here because they set the size of the net.
The owner asked about a floor of 25% and picked 50% (2026-11-09): most coins never leave the curve, the curve is where a Creator compares platforms, 50% is today's rule (ADR 0009) and StonkFun's, and a floor under it would have cut what Creators earn now.
A coin's tier only ever climbs.

| Tier | Creator's share of what the platform collects on the coin | Creator earns | Platform Net |
| --- | --- | --- | --- |
| On the curve | 50% of the Platform Fee | 0.50% of volume | 0.50% of volume |
| Graduated, before the ladder (today) | 50% of the pool creator fee that arrives | about 0.48% | about 0.69% |
| Graduated | 60% | 0.57% | about 0.59% |
| Graduated, with staying power | 70% | about 0.67% | about 0.50% |

The figures are mainnet's: a 1.00% Platform Fee on the curve; after Graduation a 1% pool creator fee of which Raydium keeps 5% at collection, so 0.95% arrives and is shared, and about 0.21% of volume through the Fee Key (the liquidity providers' 84% of the 0.25% trade fee), which is never shared.
At the top tier the platform keeps 30% of the shared pool fee, 0.285% of volume, plus the Fee Key's 0.21%.

What the rows are worth at the two ends of the ladder, in percent of trading volume:

| Row | Curve, today's table | Curve, planned table | Top tier, today's table | Top tier, planned table |
| --- | --- | --- | --- | --- |
| Burn | 0.300% | 0.200% | 0.297% | 0.198% |
| Flywheel | 0.025% | 0.025% | 0.025% | 0.025% |
| Trader programs | 0 | 0.100% | 0 | 0.099% |
| Treasury | 0.175% | 0.175% | 0.173% | 0.173% |

What "staying power" means, and whether a tier is reached by a coin or by a Creator, is #188's to settle.
The on-chain split never moves for any of this (ADR 0004, ADR 0009): a tier changes what the Creator Forward sends.

## Where it shows

- `GET /v1/platform` carries `budgetTable`: the version in force and any announced for later.
- `GET /v1/budgets` carries every version, the net and each row's allotment, spending and remainder.
- `GET /v1/burns` keeps its shape; its `shares` are the `burn` and `flywheel` rows in force.
- The Fees page (`/fees`, the one page with a fee figure, owner 2026-10-30) shows the table in words and figures, names the Fee Key's share as the platform's alone, and shows an announced version with its date.
- `/announcements` lists every version after the first beside the fee changes.

## Considered Options

- One setting per program, as the Burn and the Flywheel had: nothing holds the sum under 100%, and a visitor reads the division from several places.
- The table as a constant in the code, changed by a deploy: nothing enforces a lead time, and the announcement would be a commit.
  The Reward Round rules already answer this with versions in the database and a lead time the API enforces.
- A new share applied to everything ever collected, the formula ADR 0006 had: a cut from 60% to 40% would leave the Burn overdrawn and idle until revenue caught up, and a new row would be owed its share of every lamport collected before it existed.
- Setting aside each run's collections by the table in force, in a table of allocations: ADR 0006 rejected the same for the Burn, since a run that fails half way loses or doubles what it was setting aside, and the Ledger already holds what is needed.
- Giving the program rows their shares now, so each program starts with a pot: the pot would sit in the operations wallet for as long as its program is unbuilt.
- The treasury, or the treasury and the Burn together, paying for the trader programs: offered to the owner on 2026-11-09, who chose the Burn alone, leaving the treasury's 35% as it is.
- A ladder floor of 25% or 40%: offered and declined, above.

## Consequences

- Each database needs migration `0025_budget_table` before the API that follows it is deployed; it writes version 1 as 60 / 5 / 0 / 0 / 0 / 35, which is what every deployment ran from its settings, so no budget moves.
- The remainders of the rows' divisions (a lamport here and there) fall to the treasury, which takes what the others leave.
- Prices move between runs and the net is valued at the latest ones, so a past period's worth in SOL moves with them, as the whole net's always did (ADR 0006).
- A budget change waits a day on mainnet like a fee change; there is no faster path, by design.
- A program built later adds its Ledger kind to `budget.ts` beside its row, or its spending is not counted against its allotment.
