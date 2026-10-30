# A Creator points their earnings at a wallet, their holders or a buyback, fixed at launch

Status: accepted by the owner on 2026-10-25 (#113), after a look at PonsVault's vault templates (the Robinhood Chain knowledge base, `launchpads/pons/`).
The choice itself landed first (the form field, the draft, the Launch, the API); the holder dividend and the buyback follow in their own slices.
Amends ADR 0009, which stays the rule for what a Creator earns.

## The decision

A Creator chooses, on the launch form, where their share of the platform's revenue on their coin goes, and the choice never changes:

1. **Wallet**: today's behaviour. The Creator Forward pays the share to the Creator's wallet (ADR 0009).
2. **Holders**: the share is paid pro rata to the coin's holders in the Quote Asset, reusing the Reward Engine's snapshots, rounds, eligibility and returned payouts (ADR 0006): the treasury counts, the curve's and the pool's own accounts never, and nobody stakes anything. Paired with a tokenized stock this is PonsVault's RWA Dividend on any Quote Asset rather than three stocks.
3. **Burn**: the share buys the coin in its own market and burns what it buys, reusing the Burn's two-step buy (a SOL route into the Quote Asset, then the buy). Unlike the platform's own Burn, which buys only in graduated pools, this buys on the curve too (owner, 2026-10-25, as Pons does). A curve buy leaves a Platform Fee in the vault, half of which is the Creator's again, so the rule compounds; what is burned each run is bounded by the share collected, never by the treasury or the liquidity.

Any coin may choose, a Reward Launch included: the Reward Tax pays holders out of transfers, the destination pays them out of platform revenue, and the two are separate pots.

## How it is kept

`earnings_destination` on `launch_drafts` is written when the launch is first prepared, read back by a retry and copied to `launches` by the Indexer, like the Payout Asset (#43); a coin launched on our PlatformConfig without our API has no draft and pays the wallet.
`GET /v1/launches/:mint` carries it as `earningsDestination`; `POST /v1/launches/prepare` takes it as a form field and refuses any value but the three.

## How the two rules will run

The Creator Forward job applies the rule on its cron, right after the Fee Collector, so what a rule spends is owed the same way a wallet forward is: a share is owed only once its fee is collected, and what is owed counts every row that is `sending` or `paid`.

- Every run of a rule is a `creator_forwards` row with its kind (`wallet`, `holders` or `burn`) and, for the holders, the Reward Round it opened, written with its transaction before the transaction is sent; a landed one is a `creator_forward` Ledger entry, so what a rule spent is reproducible from the indexed trades like a forward is.
- Holders: one Reward Round per run per coin, its pot the share collected and not yet paid, paid in the Quote Asset like a Quote Asset payout (SOL as plain SOL, a payout under the rent minimum returned to the pot).
- Burn: one transaction per run per coin for the share collected, bought exactly for the burn's sake as the Burn does; on the curve `buy_exact_in` with the Platform Fee like any trade, in the pool `swap_base_output`; a coin whose Quote Asset has a transfer fee is bought in the Quote Asset held, never routed.
- Both wait for the share to be worth `CREATOR_FORWARD_MIN_LAMPORTS`, like a wallet forward.

## Where it shows

The launch form, beside the launch type; the coin page, in a "Creator earnings" card naming the rule and listing its runs with their transactions; `GET /v1/creators/:address/earnings` and the Creator page, as what went to the rule instead of the wallet.

## Trust model, said plainly

PonsVault enforces its rules in contracts anyone can trigger.
We have no on-chain program (ADR 0003), so a rule is applied by our job on the cron, every action on the public Ledger: accountable and reproducible, not trustless, and the coin page's card says so in our words.

## Not in scope

PonsVault's Staking (unneeded: holder snapshots pay by balance), Lottery (no fair randomness without a program), Fee Share to an X handle, Vault Seats, and a creator tax (ADR 0009 settled 0% on-chain).
