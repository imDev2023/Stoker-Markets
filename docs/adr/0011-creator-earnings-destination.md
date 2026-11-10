# A Creator points their earnings at a wallet, their holders, a burn or liquidity, fixed at launch

Status: accepted by the owner on 2026-10-25 (#113), after a look at PonsVault's vault templates (the Robinhood Chain knowledge base, `launchpads/pons/`); the liquidity destination added on 2026-11-09 (#184, from Stross's StonkFun article); built on 2026-11-10.
Amends ADR 0009, which stays the rule for what a Creator earns, and ADR 0006, whose Reward Rounds gain a second source.
A first draft of this record sat on the unmerged PR #116 with three destinations; this one replaces it.

## The decision

A Creator chooses, on the launch form, where their share of the platform's revenue on their coin goes, and the choice never changes.
This is the coin's Creator Earnings Destination:

1. **Wallet** (`wallet`): today's behaviour and the default.
The Creator Forward pays the share to the Creator's wallet (ADR 0009).
2. **Holders** (`holders`): the share is paid pro rata to the coin's holders in the Quote Asset, through Reward Rounds (ADR 0006): the same snapshots, eligibility, returned payouts and public pages.
Nobody stakes anything, and the coin carries no Reward Tax unless it is also a Reward Launch.
Paired with a tokenized stock this is PonsVault's RWA Dividend on any Quote Asset rather than three stocks.
3. **Burn** (`burn`): the share buys the coin in its own market and burns what it buys.
Unlike the platform's own Burn, which buys only in graduated pools, this buys on the curve too (owner, 2026-10-25, as Pons does).
4. **Liquidity** (`liquidity`): once the coin has graduated, the share buys the coin in its pool, pairs what it bought with the Quote Asset and adds the pair to the pool, and the LP tokens are locked for good with Raydium's lock program; the operations wallet keeps the position's Fee Key (#184).

Any coin may choose any of them, a Reward Launch included: the Reward Tax pays holders out of transfers, the destination applies platform revenue, and the two are separate pots.
The share itself is unchanged: half of what the platform collects on the coin's trades, more of its pool fees as it climbs the Creator Ladder (ADR 0020).

## How it is kept

`earnings_destination` on `launch_drafts` is written when the launch is first prepared, read back by a retry and copied to `launches` by the Indexer, like the Payout Asset (#43).
A coin launched on our PlatformConfig without our API has no draft and pays the wallet.
`POST /v1/launches/prepare` takes `earningsDestination` and refuses any value but the four; `GET /v1/launches/:mint` carries it.

## The pot of a coin with a rule

Creator Forwards are counted per Creator and Quote Asset across all of a Creator's coins.
A coin with a rule (any destination but the wallet) is counted on its own instead.
Its **pot**, in its Quote Asset, is:

- the Creator's share the platform has **collected** on this coin (a curve trade counts once a Platform Fee claim for its Quote Asset has landed at or after it; a pool fee collection counts at the tier's share the coin held then),
- less the coin's **Graduation Fee** withheld so far (ADR 0015), which comes out of the pot before the rule runs,
- less what the rule has **applied**: every payout of the coin's earnings rounds that is paid, in flight or still to be sent (a `returned` one stays in the pot), and what every landed buyback spent plus the most every buyback still in flight may spend.

So a share is owed to a rule only once its fee is collected, as a forward is, and a run that dies, or a retry, never applies the same share twice.
`rulePots` in `apps/api/src/fees/creatorShares.ts` is the one place a pot is computed; a wallet forward is owed only on the coins that pay the wallet.

The sweep and the Budget Table are unchanged in what they mean: what was collected for Creators and has not left the operations wallet stays there, whatever its destination.
What has left is read from the Ledger under four kinds, `creator_forward`, `holder_dividend`, `creator_burn` and `creator_liquidity`, counting the entries in the Quote Asset (a buyback's second entry records the coins and is no money out).

## How the rules run

The Creator Forward job applies every rule on its cron, right after the Fee Collector and after its own wallet forwards (`apps/api/src/fees/rules/`).
A coin's rule runs once its pot is worth `CREATOR_FORWARD_MIN_LAMPORTS` at the Quote Registry's price, like a forward; a smaller pot waits and grows.

### Holders

One Reward Round per run per coin, of source `earnings`, its pot the coin's pot, paid in the Quote Asset (SOL as plain SOL, a payout under the rent minimum to an empty wallet returned to the pot).
The round follows the Reward Round rules in force (the minimum holding; the tax threshold does not apply, the forward minimum does), snapshots every wallet that holds the coin, whichever token program the coin is under, and writes every payout in one database transaction.
The Creator Forward job opens the round; the Reward Engine pays it on its own ten-minute cron, with every other open round.
A coin has at most one earnings round paying at a time, and a Reward Launch may also have a tax round paying; the two never share a pot.
Each landed payout transaction is one `holder_dividend` entry on the Ledger: the Quote Asset it sent, from the operations wallet to the holders of the coin it names.

### Burn

One transaction per run per coin: it buys an exact number of coins (what the pot buys at the current price, less a 1% slippage allowance) with the Quote Asset the wallet already holds for the coin, and burns exactly that number.
On the curve that is LaunchLab's exact-out buy, with the Platform Fee like any trade; in the pool, the CPMM's exact-out swap.
No SOL route is involved, since the pot is already in the coin's Quote Asset.
A curve buy leaves a Platform Fee in the vault, half of which is the Creator's again, so the rule compounds; what a run spends is bounded by the pot, never by the treasury or the liquidity.
Nothing is bought while Raydium is moving the coin to its pool, or while the pool is paused or not open.

### Liquidity

Before Graduation there is no pool, so the share waits in the pot: it is not spent on the curve, and the coin's page says it is waiting.
After Graduation, one transaction per run per coin:

1. it buys the coin in the pool with about half of what it uses,
2. deposits the coins it bought with the matching Quote Asset (the CPMM's `deposit`, for an exact number of LP tokens),
3. locks those LP tokens with Raydium's lock program (`lock_cp_liquidity`), which opens a new locked position and mints its Fee Key to the operations wallet.

The position can never be withdrawn; its trading fees are collected by the Fee Collector with the Fee Key and are platform revenue (`fee_key` on the Ledger, never shared, as for the position Raydium's migration locks).
The platform pays the position's rent and network fees; in return it earns the position's fees.
Because every addition is a position of its own, with rent and a collection of its own, a pot is only added once it is worth `LIQUIDITY_ADD_MIN_LAMPORTS` (0.25 SOL on mainnet), and the Fee Collector looks at a bounded number of positions a run, the ones it has not looked at for longest.
Coins the deposit could not take (the pool moved between the plan and the transaction) stay in an account of the rule's own, apart from the wallet's coin account, and go into the coin's next addition.

### What a buyback records

Every buyback is a `creator_buybacks` row written with its transaction's signature and the most it may spend before the transaction is sent, and settled by that transaction.
A landed one is two Ledger entries (`creator_burn` or `creator_liquidity`): the Quote Asset that left the wallet, then the coins burned or added; and it is indexed as the trade of the coin it is.
The Quote Asset a buyback spent is read from the chain: for SOL, what the market's own accounts gained in wrapped SOL; for any other asset, what left the wallet's accounts of it.

## Where it shows

- The launch form: a "Creator earnings" choice of the four, each with one line on what it does; the summary names it.
The "Holder rewards, coming soon" launch type of 2026-10-30 is gone: it is the Holders destination, and the launch type keeps to the Reward Tax.
- The coin page: the About block names where the Creator's earnings go, and a "Creator earnings" card on a coin with a rule shows the pot and lists its rounds or buybacks with their transactions (`GET /v1/launches/:mint/earnings`).
- `GET /v1/creators/:address/earnings` and the creator page: per coin its destination and what its rule has applied, and per Quote Asset what went to rules instead of the wallet.
- The Ledger, under its four kinds.

## Trust model, said plainly

PonsVault enforces its rules in contracts anyone can trigger.
We have no on-chain program (ADR 0003), so a rule is applied by our job on the cron, every action on the public Ledger: accountable and reproducible, not trustless, and the coin page's card says so in our words.
The choice is fixed in our database, not on-chain; nothing in the API changes it after the launch is indexed.

## Considered and not done

- **Burning the LP tokens instead of locking them.**
Simpler and with no positions to keep, but the position's fees would stay in the pool for nobody; the owner's decision (2026-11-09) is locked liquidity with the Fee Key.
The minimum per addition and the bounded collection are what keep the positions affordable.
- **Spending the liquidity share on the curve before Graduation** (buying and burning, or buying and holding the coins for the pool).
The first is another rule under this one's name; the second leaves the platform holding a coin inventory per launch.
The share waits instead.
- **A row per run in `creator_forwards`**, as the first draft had it.
A forward is one payment to one wallet per Creator and asset; a round has many payouts and a buyback has a budget before it has an amount, so each keeps its own rows.
- PonsVault's Staking (unneeded: holder snapshots pay by balance), Lottery (no fair randomness without a program), Fee Share to an X handle, Vault Seats, and a creator tax (ADR 0009 settled 0% on-chain).
- #184's other half, the Burn's and the Flywheel's budgets pointed at liquidity by an operator setting, is its own unit.
