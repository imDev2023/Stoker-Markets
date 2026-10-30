# The Graduation Fee: a set worth in SOL, withheld from the Creator's earnings once their coin graduates

Status: accepted by the owner on 2026-10-30 (#157), implemented on the local chain.
Amends ADR 0009 (the Creator Forward) and ADR 0006 (the Burn's budgets).

pump.fun charges 0.015 SOL per coin when it graduates (its fees page, read on 2026-10-30 as information only).
The owner wants the same charge, in our own mechanism: a Graduation is the moment a coin has proven itself, the Creator has by then earned half of the Platform Fee on the whole Graduation Target (about 0.4 SOL at mainnet's 85 SOL target), and a fee at that moment costs nobody a transaction.

## Decision

- When a coin graduates, the platform charges `GRADUATION_FEE_LAMPORTS` (0.015 SOL on mainnet; a setting, `0` for none) by withholding its worth in the coin's Quote Asset from the Creator's earnings on that coin.
  Nothing is ever taken from the Creator's wallet, and nothing moves on-chain for it: the Creator's share and the platform's revenue sit in the same operations wallet, and the withholding is a change of which is which.
- The fee is fixed on the `graduations` row as the migration is indexed (`fee_lamports`), so a later change to the setting never touches a coin already graduated, and a coin graduated before the fee existed carries `0` and is never charged.
- It is taken out of what the Creator is owed on that coin at the time (their collected, not yet forwarded, not yet withheld share, capped by the coin's own earnings), before the Fee Collector's sweep and again before the Creator Forward, until paid.
  A share smaller than what is still owed is taken whole and the rest waits for the next collection; a forward is never negative.
  The holders' Reward Tax is never touched: it is not the Creator's.
- The worth in the Quote Asset is read at the Quote Registry's price at each withholding, the same pricing the forward's minimum uses, rounded up on the last piece so the fee is covered; SOL at par.
  A Quote Asset the registry cannot price waits.
- Each withholding is a `graduation_fee` entry on the Ledger, keyed by the graduation's own signature from event index 1000 up, in the Quote Asset, with the Creator as its source, the operations wallet as its destination and the coin as its launch.
  It is a revenue kind named positively, but the money it names was already counted when it arrived as a `platform_fee` or `pool_fee`, so it is never added to a revenue total: `GET /v1/revenue` carries it beside each asset as `graduationFee`, and the Burn's budgets take it in by subtracting a Creators' share that is net of it.
- `GET /v1/platform` carries `graduationFeeLamports`; `GET /v1/creators/:address/earnings` carries what was withheld per Quote Asset (`withheld`, with `pending` net of it) and each graduated coin's fee (`graduationFee`: the fee, what has been withheld toward it and its worth, and when it was settled); `GET /v1/launches/:mint` carries the same under `graduation.fee`.
  The coin's page shows it as a fact, the Creator's own page shows what was kept, the launch form's review says the fee is coming, and the Fees page is where its figure is read from the chain.

## Considered Options

- A transfer out of the Creator's wallet at Graduation: needs the Creator's signature, which nobody gives for a fee, or a program of our own, which ADR 0003 and the PRD rule out.
- A larger Platform Fee instead: it would move the comparison with StonkFun trade for trade (ADR 0009's reason for the split), and charge every coin rather than the ones that graduate.
- Withholding from the Creator's share across all their coins: simpler to compute, but the fee is the coin's, and a Creator with two coins on one Quote Asset would see the wrong coin pay; the cap by the coin's own earnings keeps it honest at no cost.

## Consequences

- A Creator's first forward after a Graduation is smaller by the fee; the coin's page and their own say so before and after.
- Mainnet Postgres needs migration `0022_graduation_fee` (four columns on `graduations`) before the API that follows it is deployed; the test stack charges 0.001 SOL so a graduated coin still forwards most of its Creator's share.
- The Ledger's `graduation_fee` entries are the only ones that name a wallet as source without a transfer; a reader summing "in" entries must leave them out, as the Stats page does.
