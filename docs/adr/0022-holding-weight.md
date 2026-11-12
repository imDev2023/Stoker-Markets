# Holding Weight: in a Reward Round a coin kept longer counts for more, coin by coin

Status: accepted by the owner on 2026-11-12 (#199).
It amends ADR 0006 (a round's payouts are no longer plainly pro rata of the snapshot) and ADR 0011 (Holder Dividends follow the same rule).
It moves no share of the Platform Net and adds no row to the Budget Table (ADR 0019): it only changes how a round's own pot is split among the coin's holders.

Until now a Reward Round paid every eligible wallet pro rata of what it held at the snapshot.
The rewards roadmap (owner, 2026-11-09) asked for a longer holder to take a larger share, and #199 asked the owner seven questions.
The owner answered them on 2026-11-12, each from a short list:

1. What counts as holding longer is each coin's own age: the coins a wallet has kept count for more the longer it has kept them, and coins bought today count once.
2. A coin kept 7 days counts 1.5 times and a coin kept 30 days twice, changeable by an announced rules version.
3. Only the coins sold are set back: a sell takes the newest coins first, and what the wallet keeps keeps its age.
4. Coins moved between wallets arrive as new coins.
5. Every Reward Round is weighted, Reward Tax rounds and Holder Dividends alike, from a rules version announced with the usual lead time.
6. The treasury stays an eligible holder (owner, 2026-10-04) and every coin it holds always counts once.
7. Holders see it called "Diamond Hands"; the term in the rules, the API, the code and `CONTEXT.md` is Holding Weight.

## The Holding Check

Nothing recorded how long a wallet had held: a round read the coin's accounts at its snapshot, and the Indexer keeps trades, never transfers between wallets.
So the Reward Engine now looks once a day.
A Holding Day is a UTC day (`HOLDING_DAY_SECONDS`, 86,400; a test stack alone may shorten it, and mainnet refuses the setting).
On its first run of a Holding Day for a coin, the engine reads every account of the coin from the chain, as a round's snapshot does, and brings the coin's Holding Lots in step with what each wallet holds.
That is the coin's Holding Check for the day, one `holding_checks` row (the coin, the day, the slot, the time, the wallets holding), written in the same database transaction as the lots it changed, so a day is checked once or not at all.

The coins checked are the ones that can ever have a round: every Reward Launch, and every coin whose Creator Earnings Destination is its holders.
Both are fixed at launch, so no other coin ever needs its history.
The wallets are the ones a round counts: owners on the ed25519 curve, never a program's vault and never the operations wallet.
A wallet under the rules' minimum holding is recorded too: the minimum decides who is paid in a round, not whose coins age.
A run checks a bounded number of coins and leaves the rest of the day's checks to its next runs, ten minutes apart.
The bound is 25 coins a run (`HOLDING_CHECKS_PER_RUN`), so 3,600 a day; the coins never checked come first, then the ones unchecked for longest.
A check's time, and so the `since` of the lots it opens, is the moment its run of the engine began, which is also the time a round opened in that run counts ages at.

## Holding Lots

A Holding Lot is an amount of a coin a wallet was first seen holding at one Holding Check, with that check's time (`holding_lots`: the coin, the wallet, `since`, the amount).
At a check, for each wallet:

- it holds more than its lots add up to: the difference becomes a new lot, `since` this check;
- it holds less: the newest lots are reduced first, and removed when nothing is left of them, until the lots add up to what it holds;
- it holds the same: nothing is written.

The lots older than any age therefore add up to the least the wallet held at every check over that time, which is the owner's answers 1 and 3 in one rule: a coin's age is how long it has been kept without a break, a sell costs the newest coins their place, and the rest keep theirs.
Answer 4 follows without a rule of its own, since the chain cannot tell a gift from a private sale: coins that arrive in a wallet are new there, however they came, and the sender's newest lots go.
Lots are never merged, so a later rules version may add a longer step and find the ages it needs; a wallet has at most one new lot a day.

## The weight

The Reward Round rules (ADR 0006) gain `holdingWeights`: steps of `afterDays` and `weightBps`, each step longer and heavier than the one before, at most six, none above five times.
A coin counts 10,000 (once) until its lot is `afterDays` Holding Days old by the clock (`afterDays * HOLDING_DAY_SECONDS` since the lot's `since`), then the step's `weightBps`.
An empty list is the rule as it was, and every version before this ADR has one.
The owner's first weights are 7 days at 15,000 and 30 days at 20,000; they arrive as an announced version, with the lead time, like any change of the rules (the operator's step, runbook section 18), and a round follows the version in force at its snapshot.
A version states all of its rules: the operator's announcement names `holdingWeights` every time, the empty list included, so no version drops the weights by leaving them out.

At a round's snapshot, of either source, each eligible wallet's Weighted Holding is counted from its balance at the snapshot and its lots as the last Holding Check left them:

- the lots are taken oldest first, up to the balance: what the wallet sold since the last check comes off its newest lots, for this round, without waiting for the next check;
- each lot taken counts its amount times its step's weight;
- whatever the wallet holds beyond its lots (bought since the last check) counts once.

A payout is `pot * weightedHolding / weightedTotal`, rounded down, as before; with no steps it is the earlier payout to the unit.
The treasury's Weighted Holding is always its balance counted once, whatever its lots say.
A snapshot writes nothing to the lots: only a Holding Check does.

## What is published

- `GET /v1/rewards/rules`: each version with its `holdingWeights`, and `holdingDaySeconds`, the length of a Holding Day on the deployment.
- Every payout carries `weightedHolding` beside `holding`, and a round its `weightedTotal`, so a payout can be recomputed from the round's own page. A round from before this ADR has no `weightedTotal`, and its payouts' weighted holdings are their holdings counted once.
- `GET /v1/launches/:mint/holdings/:wallet`: the wallet's lots of a coin as the latest Holding Check left them, each with its `since` and the weight it has under the rules in force, the wallet's Weighted Holding and its weight as one figure, and the check itself (time and slot).
  The treasury's lots are shown as they are, each at the weight of once, with `flat` set.
- The Rewards page explains the rule under the name Diamond Hands with the steps in force or announced, and says the four things a holder must know: a sell takes the newest coins first, coins sent to another wallet start again there, balances are looked at once a day, and the treasury always counts once. It shows nothing of it while no version with steps is in force or announced.
- A round's page shows each payout's weight once the round's version has steps; the coin page's rewards cards show the connected wallet's own.

## Considered Options

- The time since the wallet last fell under the minimum holding, the number of earlier rounds a wallet was paid in, the time since its first buy: the owner's other choices for answer 1. Each weighs the wallet, not the coins, so dust held for a month earns the top weight on a large late buy; the second also means minutes on a busy coin and months on a quiet one.
- Any sell resetting the wallet, a reset under the minimum, a step down per sell: the other choices for answer 3; the first punishes a small sell with a month's standing, the others leave the late buy rewarded.
- A check on every run of the engine, every ten minutes: finer ages, but a lot per wallet per run on a busy coin and every wallet's lots read 144 times a day, for a rule counted in days.
- Indexing every transfer of every coin (a webhook on the mint): exact times, but a busy mint delivers every transaction that names it, which is why the webhook never watches a mint (owner, 2026-10-04).
- The round's snapshot rewriting the lots: a round would then change what the next check finds, and two rounds of one coin (tax and earnings) would race; the snapshot reads, the check writes.
- A weight that grows every day in a straight line: nothing to announce as a table and harder to check by hand.
- The treasury left out of weighted rounds: it is an eligible holder by the owner's decision, and counting it once keeps that while the platform gains nothing from a rule it wrote.

## Consequences

- Nothing before a coin's first Holding Check counts: every holder's coins start their age there. Checks begin with the deploy, whatever the rules say, so ages have run for at least the lead time before the first weighted round.
- A coin's age runs from the check that first saw it, up to a day after it was bought.
- Between two checks nothing is seen: a wallet that sells and buys back inside a day keeps its lots, at the price of two trades' fees and, on a Reward Launch, the tax twice. A round in between still counts only what the wallet holds at its snapshot.
- A new buyer of an old coin takes less of a round per coin than its long holders, by at most the top step; the rule and the steps are on the Rewards page and the coin's card before anyone buys.
- A wallet's lots are published as they are now, not as they were at a past round: a round's page gives the result (`weightedHolding`), which later sells no longer let anyone rebuild from the lots.
- One read of a coin's accounts a day per coin with rounds, beside the reads the engine already makes, and at most one new lot per wallet per day.
- Three calls the session made, the owner's to overrule: balances are looked at once a day and not at every run; a wallet under the minimum holding keeps its coins' ages; a version may carry at most six steps and none above five times.
