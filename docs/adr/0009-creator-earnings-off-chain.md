# Creators earn half of what the platform collects, all of it forwarded: 1.00% Platform Fee and 0% Creator Fee on the curve

Status: accepted by the owner on 2026-10-08 (#85), implemented on the local chain.
Supersedes ADR 0007.

ADR 0007 split the curve's 1.00% between a 0.75% Platform Fee and a 0.25% on-chain Creator Fee, and topped the Creator up to about 0.5% by forwarding a match of that fee out of the Platform Fee; after Graduation it forwarded half of the pool creator fee.
StonkFun sets `fee_rate` 10000 and `creator_fee_rate` 0 and pays its creators about 0.5% off-chain (`research/onchain/README.md`).
The owner's reasoning: StonkFun chose that split with its numbers in front of it, there must be a reason, and matching it keeps the two platforms comparable trade for trade.
A trader still pays 1.25% on the curve, the same as at StonkFun.

## The split

On the curve the PlatformConfig sets `fee_rate` 10000 and `creator_fee_rate` 0 (LaunchLab's 1e6 denominator): 0.25% to Raydium and a 1.00% Platform Fee, nothing on-chain for the Creator.
Every trade still names the Creator's LaunchLab vault, as the program requires, but nothing is ever paid into it, so there is nothing to claim.

After Graduation nothing changes on-chain from ADR 0001: the platform is every pool's creator (`platform_cp_creator`), collects the pool's creator fee (1% with the CPMM config the runbook picks) and holds every Fee Key.

## The Creator's share

One rule for both venues: half of what the platform collects on a coin's trades is its Creator's.

- On the curve, half of each trade's Platform Fee: about 0.5% of curve volume.
- After Graduation, half of each pool creator fee collection from the coin's pool: about 0.5% of pool volume with the 1% config.
- Fee Key collections are the platform's alone.

Each half is rounded down on its own, so a sum per Creator, per Launch or per Quote Asset comes out the same whichever way the fees are grouped.
A Reward Launch's Creator earns the same as any other Creator.
The Creator is the wallet that launched the coin, for good.

Everything else about the Creator Forward is as ADR 0007 set it: paid in the Quote Asset the fee was earned in, SOL as plain SOL, by the `creator-forward` job right after the Fee Collector; a share counts as owed once the platform has collected the fee it comes from (a curve trade's once a Platform Fee claim for its Quote Asset has landed at or after the trade's slot, a pool's once its collection is on the Ledger); paid once worth `CREATOR_FORWARD_MIN_LAMPORTS` at the Quote Registry's price; one `creator_forwards` row written before the transaction is sent, so a retry never pays twice; every landed forward a `creator_forward` Ledger entry; a failed one a `job_failed` alert.
Money owed to Creators is not the platform's revenue: the sweep leaves it in the operations wallet, and the Burn and Flywheel budgets (ADR 0006) are shares of revenue net of it.

`GET /v1/platform` carries the share as `creatorForward.shareBps` (5000) with `curveBps` and `poolBps` derived from the fees the chain has, so a fee change (#22) moves what Creators earn with it and the copy follows.

## What goes

The claim card, `POST /v1/creator-fees/prepare`, the "claim without this website" page and the footer link to it, the Indexer's claim tracking (`creator_fee_claims`) and the webhook's watch on the creator fee vault authority: there is nothing to claim.
The creator page keeps what each Quote Asset and each coin earned, what has been sent and what is still to come.
The user-facing term is Creator Earnings; "Creator Fee" stays LaunchLab's on-chain term, 0 on our platform, which the fee-change flow and the announcements still name.

## Considered Options

- Keep ADR 0007 (0.25% on-chain, the rest forwarded): a broken forward would halve a Creator's curve earnings instead of ending them, but the two platforms would not compare trade for trade, and the claim flow is a second payment path for Creators to learn.
- Forward exactly 0.5% of indexed volume: depends on the Indexer seeing every trade and could exceed what a transfer-fee Quote Asset actually delivered; half of what was collected cannot.
- Half per trade rather than half of each collection for pool fees: the Indexer would have to see every pool trade; a collection is what the Ledger knows.

## Consequences

- A Creator's whole earnings now depend on a job of ours running.
  The Ledger, the creator page (earned, sent, still to be sent) and the `job_failed` alert make a stall visible within the hour, and what is owed is reproducible from indexed trades and the Ledger alone.
- The copy says "about 0.5%": the forward follows collection by up to an hour and waits for the minimum, and after Graduation the figure is half of the CPMM config's creator fee (0.125% on the local chain, 0.5% on mainnet).
- The first trade that names a Creator's LaunchLab vault still has the program open it, so that trader pays its rent as before; nothing is ever paid into it.
- The devnet rehearsal's PlatformConfig, created under ADR 0007, moves to the new rates through the fee-change flow (#22) with its announcement, signed by its file admin key (`tools/mainnet/fee-change.ts`); the mainnet PlatformConfig is created with them from the start.
- Mainnet Postgres needs migration `0019_creator_earnings_offchain` (it drops `creator_fee_claims`) before the API that follows it is deployed.
