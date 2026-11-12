# Volume rebates: the rebates row paid back to traders, week by week, by the fees their trading paid

Status: accepted by the owner on 2026-11-12 (#196), implemented on the local chain.
The first trader program of ADR 0019; it adds nothing to that ADR's rules and spends its `rebates` row.

ADR 0019 gave the Budget Table a `rebates` row at 0% and left the program to its own issue, which asked the owner seven questions.
The owner answered them on 2026-11-12, each from a short list:

1. Every trade earns: on the curve and in the pool, buys and sells, each counted by the fee it paid the platform.
2. The measure is a share of the period's pot: the row's budget for the period is split among traders in proportion to the fees their trades paid.
3. The period is a UTC week, Monday 00:00 to the next Monday, paid in the hours after it closes.
4. A rebate is paid in SOL.
5. The minimum payout is 0.01 SOL, and a share under it waits: a trader's rebates add up week over week and are paid once they reach it.
6. Nothing else is left out to guard against wash trading. The platform's own wallets earn nothing, a coin's Creator earns like anyone, and a cap holds a rebate under the fees paid.
7. The first share to propose for the row is 10%, taken from the Burn: Burn 50%, Flywheel 5%, rebates 10%, treasury 35%. Announcing it stays the operator's step.

## The Rebate Week

A Rebate Week runs from Monday 00:00 UTC to the next Monday, counted from the epoch's first Monday (1970-01-05).
A trade belongs to the week its block time falls in.
A week is settled once, after it has ended for the wall clock and for the chain's clock, which is the one that dates trades.
The rebates job runs on the Fee Collector's schedule (every hour at :15), right after the Fee Collector and the Creator Forward, so a week that ended at midnight is settled at 00:15 on what was collected a moment before.
`REBATE_WEEK_SECONDS` shortens the week on a test stack; mainnet refuses any other length.

## What earns

Every indexed trade of a coin launched here: on its curve and in its pool after Graduation, a buy or a sell.
A trade counts by the Platform Fee it paid, in its coin's Quote Asset: on the curve LaunchLab's Platform Fee, in the pool the creator fee, which is the platform's (ADR 0001).
What a trade paid Raydium, a referrer or the network is not counted, and neither is the Fee Key's share, which no single trade is charged.
A wallet's fees for the week are summed per Quote Asset and valued in SOL at the Quote Registry's prices at the settlement, SOL at par; an asset without a price counts for nothing, as it does in the Platform Net (ADR 0019).

A trade earns only while the `rebates` row has a share: under a Budget Table version that gives it one, from the moment the version takes effect until the next one does.
That is ADR 0019's own rule read from the trader's side: a version's shares apply only to the net collected while it is in force, so nothing was set aside on a trade made before the row had a share.
A week that holds no such time is not settled at all, and the program leaves no rows behind while it is off.

The platform's own wallets earn nothing: the operations wallet, which trades for the Burn, the Flywheel, the Reward Sales and the Creators' buybacks, the treasury and the admin.
A rebate to any of them would only move the row's money back to the platform.

## The pot

A week's budget is what the `rebates` row has left when the week is settled (its allotment less what the Ledger shows it spent, `budget.ts`), less the rebates of earlier weeks that are still to be paid.
The pot is the budget, or the cap's share of the week's fees where that is less.
The cap is the largest share the row had in force during the week: with the row at 10%, a week's pot is never more than 10% of the fees its trades paid.

A trader's Volume Rebate is the pot times their part of the week's fees, rounded down to the lamport.
What rounding and the cap leave stays in the row, for the next week.

In an ordinary week the cap does not bind.
The row's share of the Platform Net is its share of what is left of the fees after the Creators' share, so a 10% row gives back about 5% of the fees paid on the curve and a little more after Graduation.
The cap matters when the budget has piled up: in the first week after the job was down, after a week nobody traded, or when collections arrive late.
Then one week's traders would otherwise be handed several weeks' budget.

## Why it cannot be farmed

A wallet trading with itself pays the whole fee to earn a small part of it back.
The most a rebate can be is the row's share of the fees paid (10% of them with the row at 10%, 20% at the ceiling of ADR 0019).
A Creator trading their own coin also earns the Creator's share of the fee, at most 70% of the pool creator fee on the top Creator Tier (ADR 0020), and still pays Raydium's trade fee in full.
On the curve that is at most 0.50% and 0.20% back of 1.25% paid; on the top tier about 0.67% and 0.20% back of 1.25% paid.
So the owner's answer to question 6 holds by arithmetic, for any share ADR 0019 allows, without a list of wallets to leave out.

A rebate is not a reason to trade against oneself, and it does not pay for volume that pays no fee.

## Waiting and paying

A Volume Rebate is one row: the week, the wallet, the fees it paid and the amount.
It waits until the wallet's waiting rebates together reach the minimum payout (`REBATE_MIN_LAMPORTS`, 0.01 SOL on mainnet), and then all of them are paid in one SOL transfer.
Nothing a trader was given is ever taken back or returned to the row.
The minimum is never set under what an empty wallet must hold to exist (890,880 lamports), so a payment can always land.

Payments follow the Reward Rounds' payouts (ADR 0006).
A few wallets go in one transaction, the largest sums first.
The rebates are marked `sending` with the transaction's signature before it is sent, so a run that dies never lets the next one pay them twice.
A landed transaction goes on the Ledger first, one `rebate` entry per wallet it paid, from the operations wallet to the trader, and its rebates are then marked `paid`.
A transaction that fails or expires puts its rebates back to waiting.
A batch the node refuses is sent again wallet by wallet, so one wallet that cannot be paid never holds up the others.

`rebate` is the row's entry in `SPENT_KIND` (`budget.ts`): the Ledger's `rebate` entries are what the row has spent.
Rebates given and not yet paid are not spending yet.
They are part of what the row has left, which the sweep leaves in the operations wallet, and a later week's budget takes them off first.
Should falling prices ever value the row under what it owes, the sweep leaves the owed lamports behind all the same.

## Where it shows

- `GET /v1/rebates`: the program (the row's share in force and any announced, the week's length, the minimum payout, the week being traded now as it would be settled at this moment, what was paid and what waits) and the settled weeks.
- `GET /v1/wallets/:address/rebates`: what a wallet is waiting for and was paid, its fees and estimate for the week being traded, and each of its rebates with its status and payment.
- `GET /v1/ledger?kind=rebate`: every payment.
- `GET /v1/budgets`: the row's allotment, spending and remainder, as for every row.
- The Rewards page shows the program, the settled weeks and the connected wallet's own rebates; the Fees page, the one page with a fee figure, shows the row's share, the week, the minimum and the cap.

## Considered Options

- Tiers by a trader's own volume, at a fixed rate each: predictable and easy to advertise, but the rates would have to be scaled down in any week the row could not cover them, so the advertised rate would not be the paid one.
  Offered to the owner, who chose the pot.
- Tier weights inside the pot, so that a larger trader's fees weigh more: it pays whales out of small traders' part.
  Offered and not chosen.
- Curve trades only, pool trades only, or buys only: offered and not chosen; every trade that paid a fee earns on it.
- A UTC day or a calendar month as the period: a day leaves most rebates under the minimum, a month makes a trader wait a month.
  Offered and not chosen.
- Paying each fee back in the Quote Asset it was paid in: several transfers per trader, token accounts to open, and a budget counted in SOL valued asset by asset at moving prices.
  Offered and not chosen.
- A rebate under the minimum returned to the row rather than waiting: simpler books, but a small trader would rarely be paid.
  Offered and not chosen.
- Leaving a Creator's trades in their own coin out: offered and not chosen; the arithmetic above is the guard.
- A week's pot fixed as the row's allotment from that week's collections alone: it needs no cap, but the Ledger dates revenue by its collection, not by the trade that paid it, and what a week left over would have no week to go to.
- Rebates valued by trading volume instead of by the fee paid: the two differ only where the fee differs, and the fee is what the row is made of.
- The week, the minimum and the cap as a versioned, announced rule like the Reward Rounds' rules: the one figure that moves money, the row's share, already is.
  The week is fixed by this ADR, and the minimum is a setting that only decides when a payment is worth its network fee.

## Consequences

- Each database needs migration `0028_rebates` before the API that follows it is deployed; it adds two tables and moves nothing.
- The program runs from the deploy and gives nothing until the operator announces a Budget Table version with a share for the row (runbook section 17).
- A trade the Indexer records after its week was settled earns nothing.
  The job settles a week no sooner than a quarter of an hour after it ended, and the webhook delivers within seconds, so only an outage of the Indexer across midnight on a Monday can cost a trader a rebate.
- A rebate under the minimum waits for as long as its wallet earns no more; lowering `REBATE_MIN_LAMPORTS` pays out everything above the new minimum on the next run.
- The row's budget is counted in SOL at the latest prices, while revenue in other Quote Assets is not SOL in the operations wallet.
  A run that cannot fund a payment sends none it cannot cover, leaves the rebates waiting and fails with its summary, which raises the operator's alert; the Burn has the same exposure.
- After a version takes the row's share away, what the row was allotted and did not give stays in it, in the operations wallet, until a later version gives the row a share again.
- The `current` week on both read routes sums the week's trades on every request, as the board's trending sort sums a day's; it is the first thing to cache if the Rewards page is slow.
