# Creators earn about 0.5% on the curve and after Graduation: half paid by the chain, the rest forwarded

Status: accepted by the owner on 2026-10-02 (#53, #42), implemented on the local chain.
Supersedes ADR 0001.

ADR 0001 gave the Creator 0.5% on the curve, all of it on-chain, and nothing after Graduation.
StonkFun promises its creators about 0.5% "on the curve and after graduation", and the owner decided to match that (#41) while keeping part of it trustless.
A trader still pays 1.25% on the curve, the same as at StonkFun.

## The split

On the curve the PlatformConfig sets `fee_rate` 7500 and `creator_fee_rate` 2500 (LaunchLab's 1e6 denominator): 0.25% to Raydium, 0.75% Platform Fee, 0.25% Creator Fee.
The Creator Fee is paid by the chain into the Creator's vault and claimed by the Creator, exactly as before.
StonkFun's on-chain split is 1.00% to the platform and 0% to the creator (`research/onchain/README.md`), so our Creators keep a share nobody can withhold.

After Graduation nothing changes on-chain from ADR 0001: the platform is every pool's creator (`platform_cp_creator`), collects the pool's creator fee (1% with the CPMM config the runbook picks) and holds every Fee Key.
Each pool's fee owner is fixed at migration, so this cannot be changed later for a coin that has graduated.

## The Creator Forward

The platform tops the Creator up from its own revenue, with nothing for the Creator to claim:

- On the curve it matches the on-chain Creator Fee of every trade, out of that trade's Platform Fee and never more than it: another 0.25% of curve volume, about 0.5% in total.
- After Graduation it forwards half of the pool creator fee it collects from the coin's pool: about 0.5% of pool volume with the 1% config.
- Fee Key collections are the platform's alone.

A Reward Launch's Creator earns the same as any other Creator.
The Creator is the wallet that launched the coin, for good.

The forward is paid in the Quote Asset the fee was earned in, SOL as plain SOL, by the `creator-forward` job, which runs every hour right after the Fee Collector.
A share counts as owed once the platform has collected the fee it comes from: a curve trade's share when a Platform Fee claim for its Quote Asset has landed at or after the trade's slot, a pool's share when its creator fee collection is on the Ledger.
So the platform never owes more than it has received, and what a Creator is owed is reproducible from indexed trades and the Ledger alone.
A Creator's owed amount in one asset is paid once it is worth at least `CREATOR_FORWARD_MIN_LAMPORTS` (0.01 SOL) at the Quote Registry's price; an asset without a price is paid whenever anything is owed, as the Fee Collector collects one.
The minimum is set in SOL, not dollars, so it moves with the SOL price rather than with a price feed (owner's decision on 2026-10-03: StonkFun's $5 per payout is a dollar rule it introduced after the fact; ours is public from launch and lower).

Every forward is one row of `creator_forwards`, written with its transaction's signature before the transaction is sent, and what a Creator is owed is what they earned less every forward that has landed or may still land.
A run that dies, or a transaction that is lost, therefore never pays twice: the next run settles the row first (landed, failed on-chain, or expired past its last valid block height) and only a failed or expired one is paid again.
A landed forward is a Ledger entry of kind `creator_forward` with its transaction.
A forward that fails or expires, or one the wallet cannot cover, fails the job, which raises the `job_failed` alert until a later run succeeds.

Money owed to Creators is not the platform's revenue.
The Fee Collector's sweep leaves it in the operations wallet, and the Burn and Flywheel budgets (ADR 0006) are shares of revenue net of it.

## Considered Options

- Keep ADR 0001 (0.5% on-chain, nothing after Graduation): fully trustless, but the owner wants parity with StonkFun's "on the curve and after graduation".
- StonkFun's own split (1.00% platform, 0% creator on-chain, everything forwarded): more revenue passes through us, and its forward broke for about three weeks in September 2026 (`research/social/telegram-group-insights.md` (private repo `imDev2023/Stoker-Markets-research`)). Keeping 0.25% on-chain means a broken job halves a Creator's curve earnings instead of ending them.
- Naming the Creator as the pool's creator, or giving the Creator the Fee Key: on-chain, but it cuts post-Graduation revenue by roughly 80% or pays about 0.2%, and ADR 0001 already rejected both.
- Always paying in SOL: one asset for the Creator, but it adds a swap with its cost, slippage and failure path, and a swap can only promise the least it delivers, not an exact amount (#64).
- Forwarding exactly 0.5% of indexed pool volume: it depends on the Indexer seeing every pool trade and could exceed what a transfer-fee Quote Asset actually delivered. Half of what was collected cannot.
- Reusing `job_transactions` and the Ledger alone to make a forward idempotent: the Ledger only knows a forward once it lands, so an in-flight one would need a second bookkeeping anyway. One table of forwards is the bookkeeping and the public history at once.

## Consequences

- Half of a Creator's curve earnings and all of their post-Graduation earnings now depend on a job of ours running. The Ledger, the Creator Fee page (earned, forwarded, pending) and the job alert make a stall visible within the hour, and the on-chain 0.25% never stops.
- The copy says "about 0.5%": the on-chain part is exact, the forward follows collection by up to an hour and waits for the minimum.
- A Quote Asset with a Token-2022 transfer fee withholds its fee on the way to the Creator, as on any transfer; the Ledger records what the platform sent.
- The operations wallet pays each forward's network fee and, the first time, the rent of the Creator's token account for that Quote Asset.
- A fee change (#22) changes the forward with it, since the curve match follows the on-chain Creator Fee; an announcement must say what Creators earn in total.
- What is owed is computed from all indexed trades on every run. That is fine at v1 volumes; if it gets slow, materialise accruals per Creator and asset.
- A curve trade indexed only after the fee it paid was swept is still owed; the job then reports the shortfall and the operator tops the wallet up.
