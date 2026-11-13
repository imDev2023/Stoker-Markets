# The Creator Lock: coins the chain holds for the Creator, taken out of the curve's sale

Status: accepted by the owner on 2026-11-13 (#186), for the chain's side, which is built; the launch form, the coin page's mark, the claim from the page and the Indexer's listing are the issue's second half and are not.
It amends ADR 0005: a curve rule no longer pins the sale and "no vesting" exactly where a Quote Asset allows a lock, and the Indexer holds a coin with a lock to the launch shape instead.

#186 asks for the Creator's share to be locked and vested through LaunchLab itself, so that the one objection to rewarding Creators, the dump, is answered by something the chain enforces and the page shows.
LaunchLab has the mechanism (`vesting_param` at launch, `create_vesting_account`, `claim_vested_token`), and until now every launch of ours set it to zero.
What it really does was proven on a private local chain on 2026-11-13 before anything was built, and three questions that the proof raised went to the owner the same day:

1. How the on-chain rule admits a lock: by a range for the lock and for the sale in the two rule groups a Quote Asset already has, with the Indexer holding a coin to the exact shape.
2. The largest lock: a fifth of the supply.
3. The shortest lock: asked to choose among a 30-day floor, no floor and a 90-day floor, the owner answered "can we start by giving options of 7 days, 30 days etc?".
   Read here as: the form offers lock times that start at 7 days, so 7 days is the shortest lock we launch or list, and the steps above it (30 days and longer) are chosen with the form.

## What LaunchLab does with a lock

All of it is asserted by `tests/backend/src/creator-lock.test.ts` on the local chain, which runs Raydium's own program.

- A launch names an amount to lock, a cliff and an unlock time, in seconds.
  The coins stay in the curve's own vault, which LaunchLab's authority owns, and are not for sale on the curve.
- The curve's creator, and nobody else, then gives shares of the locked coins to wallets (`create_vesting_account`): one share per wallet, never changed, and the shares cannot pass what was locked.
  The program still takes a share after the curve has sold out and after the migration, until the cliff ends.
  Coins nobody was given stay in the vault for ever.
- The clock starts at the buy that sells the curve out: the program stamps that block's time plus the cliff, and the migration leaves it alone.
  Nothing is claimable before the cliff ends; from then the share unlocks in proportion to the unlock time gone by, rounded down, and all of it once that time has passed or when there is none.
- A claim (`claim_vested_token`) is signed by the wallet that holds the share and pays what has unlocked and was not claimed, from the vault to the wallet's own account of the coin.
  It fails before the migration (6015), while the cliff runs (6012) and when nothing new has unlocked (6009).
  So a coin that never sells out never unlocks, and a stalled migration delays a claim but not the clock.
- At the migration the pool gets the supply less the sale and the lock, and the vault keeps exactly the lock; the mint's supply never changes.
- A Reward Launch's coin pays its Reward Tax on a claim like on any transfer: with a 5% tax, 95% of the claimed coins reach the Creator and 5% sit withheld for the holders.
- LaunchLab refuses a cliff or an unlock time on a launch that locks nothing.

## The lock comes out of the sale

A coin with a Creator Lock has the launch shape's supply, and its sale and its lock add up to the shape's sale: 793.1 billion coins of 1 trillion.
The pool's share stays 206.9 billion, 20.69%.

- The Graduation Target raises the same amount and the coin graduates at the same market cap as a coin without a lock, so every figure the site derives from the shape holds.
- Raydium's GlobalConfigs want at least 15% of the supply to reach the pool (every one of mainnet's 571 on 2026-09-26), so a lock taken out of the pool's share could be 5.69% at most.
- The buyers pay for it, and the page must say so: the same raise buys fewer coins.
  With a 10% lock the curve opens 31% higher and the average price over the whole curve is 14% higher; with 20%, the cap, it opens 79% higher and the average is 34% higher.
  The price at Graduation is the same.

## The limits

`CREATOR_LOCK` in `packages/chain/src/shape.ts`, checked by `creatorLockProblem`:

- At most 2,000 basis points of the supply (owner, 2026-11-13).
- At least 7 days from the curve selling out until the last coin unlocks, cliff and unlock time together (the owner's answer, as read above).
- A cliff and an unlock time of at most four years each, which is what the rule admits; mine, and the owner's to change.
- Per Quote Asset the cap is the least of ours, Raydium's own `max_lock_rate`, and what the sale can give up before it falls under Raydium's `min_base_sell_rate` (`creatorLockCapBps`).
  On mainnet that is the full 20% for SOL and nearly every other asset, and no lock at all for the one config that allows none.

The form's steps inside these (which sizes, which lock times, a cliff or a linear unlock or both) are the second half's, with the owner.

## The curve rule gets ranges, and the Indexer holds the shape

A curve rule compares each launch parameter with a constant.
It cannot say that the sale and the lock add up to 793.1 billion.

Where a Quote Asset allows a lock, each of its two rule groups therefore gives the sale a range (from the shape's sale less the cap, up to the shape's sale), the lock a ceiling (the cap) and the cliff and the unlock time a ceiling (four years), and pins everything else as before: one constraint more than today's group, no new group, no extra transaction when a band moves.
Where it allows none, the group is today's, constraint for constraint, so nothing is rewritten for it (`standardLaunchConstraints` and `rewardLaunchConstraints` with `maxLockBps`).

A launch sent straight to the chain can then have a sale and a lock that do not add up (a tenth less sold and nothing locked, say), or a lock shorter than seven days.
The decoder says so (`standardShape` is true only for the exact shape with no lock, or with a lock within our limits whose coins come out of the sale), and the Indexer ignores such a coin, as it already ignores a Token-2022 coin taxed at a rate we do not offer.
It never reaches the board.

## The whole lock is the Creator's, in the launch transaction

`prepareLaunch` puts `create_vesting_account` for the Creator's own wallet, for the whole locked amount, right after the launch instruction.
Nothing is then left to give, so no share can go to a second wallet later, and no coin is stranded in the vault.
The launch still fits one transaction through the Platform Lookup Table with the longest name, a metadata address as long as Arweave's and a First Buy paid in SOL.

A locked supply for a second wallet (a community treasury the Creator names) stays out of scope, as in #186.

## Claiming

The Creator's wallet signs and pays for its own claim (`prepareCreatorLockClaim`, ADR 0003); nothing goes through the operations key.
`readCreatorLock` reads the lock and a wallet's share from the chain, and `unlockedAmount` counts what has unlocked as the program does, so a page can show the schedule and what is claimable without an index of its own.

## What is built, and what waits for the second half

Built (2026-11-13, `packages/chain`): the limits, the rule constraints, the launch and its First Buy quote with a lock, the two instructions, the reader, the claim, the decoder's `lock` on a launch and its shape rule, and the GlobalConfig's own limits on `listGlobalConfigs`.

Not built, and nothing a visitor or a Creator can reach yet:

- The Quote Registry still writes the exact groups, so no rule of ours admits a lock on any cluster; the test opens two groups of its own on the local chain and closes them.
- The API prepares no lock (no field on the launch form or the contract, no migration), and the Indexer leaves a coin with a lock unlisted, saying so in its log.
- The claim has no endpoint and no button.

Before the Indexer lists such a coin, the second half must deal with what a lock changes after Graduation:

- LaunchLab's vault holds the locked coins after Graduation, under an owner that is a program's address.
  Holder counts, the trust figures, a Reward Round's snapshot and the Holding Check must go on leaving it out, as they leave out a curve's vault today, and say what share of the supply is locked.
- A coin with a lock sells fewer coins: every place that reads the shape's sale rather than the coin's own (`totalBaseSell` is on the launch's row) must read the coin's.
- The Creator pays the Reward Tax on a claim, which the holders receive; the page should say it before the Creator is surprised by it.

## Considered Options

- A pair of rule groups per lock size, so that the chain itself refuses every other shape.
  A rule holds ten groups, found on the local chain, so four sizes at most and none ever after; a group costs 0.0017 SOL of rent per Quote Asset (about 1 SOL across mainnet's assets, per group), and every band move would write five times the transactions it writes today (ADR 0005 counts them).
- Two extra groups for locked launches only, with an on-chain least lock time: about 2 SOL of rent and twice the rule transactions, and the sale and the lock would still need the Indexer to check their sum.
- The lock taken out of the pool's share: 5.69% at most under Raydium's 15% floor, and a different market cap at Graduation for every size.
- Jupiter Lock on coins the Creator buys (#141's first idea): a second program in the launch, and the Creator pays for the coins; LaunchLab's own vesting is enforced by the program that holds the curve and costs one small instruction.
- Any lock time, shown as it is: a lock claimable the moment a coin graduates would carry the same mark as a year's.

## Consequences

- Where a rule admits a lock, an off-shape coin can exist on our PlatformConfig on-chain, which ADR 0005's exact pins prevented.
  It pays the Platform Fee like any coin, is never listed, and on mainnet its pool share is bounded by the rule's ranges and Raydium's floor (between 15% and 40.69% of the supply).
- The limits are constants, so changing the cap or the least lock time is a deploy and, for the cap, one rewrite of each rule that allows a lock, as a shape change is (ADR 0005).
- The unlock starts at the sell-out and never at launch, so a lock cannot be dated when the coin launches: the page can only say "from Graduation" until the coin has graduated.
- The local chain's GlobalConfigs are devnet's loose ones (no floor on the sale or the pool's share), so mainnet's limits are checked by arithmetic (`creatorLockCapBps`) and not by a launch that fails locally.
