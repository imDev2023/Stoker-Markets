# Trust figures: computed from the indexed trades and the chain on request, labels only

Status: accepted (the coin-page unit of #41, lane A of the parallel plan on #37, 2026-10-27; the design note on anti-sniper defences of 2026-10-26, recorded on #120).

Traders check a coin's bundles, snipers and dev holdings in a terminal before they buy, and a launchpad whose coin page lacks those figures loses the buyer to the terminal (the owner's market research, 2026-10-26).
Honest Creators get called bundlers on every launch, so a flag has to carry its evidence.
LaunchLab has one platform-wide fee and no time-decaying sniper tax, so Stoker cannot stop a sniper; it can say who sniped.

## Decision

- The coin page carries a "Before you buy" card under the trade panel with four lines: what the Creator holds now, their First Buy at launch and their record here (coins launched, coins graduated), Bundle Radar's snipers, and what the ten largest wallets hold with the curve's and the pool's coins aside.
  The holders list marks each sniper, and the coin's head links to the explorer, DEX Screener and Jupiter.
- A sniper is a wallet other than the Creator that bought in the Snipe Window: the launch's own slot and `SNIPE_WINDOW_SLOTS` after it, five (about two seconds) unless set.
  What a sniper holds is bought less sold by its trades here since launch; a transfer out is not a trade, and the card says "by their trades here".
  Snipers that paid exactly the same amount, or landed in the launch's own slot, are counted as a bundle's marks, since that is how one bot's wallets buy.
- Everything is computed from the indexed trades and launches on each request to `GET /v1/launches/:mint/trust`, and the holding from the chain through `GET /v1/launches/:mint/holders`.
  Nothing is stored and no job runs, so anyone can recompute every figure from the public API, as with the Ledger.
- Labels only: no figure refuses a trade or a launch, like Quote Risk Labels and the Copy Protection label after its window.

## Alternatives not taken

- A funder graph (clustering snipers by the wallet that first funded them) and a lookup of Jito's bundle API would catch bundles that vary their amounts.
  Both need RPC history reads per wallet or a third-party API, so they are a job with stored results, not a request-time figure; they follow once mainnet launches show what the slot-and-amount marks miss.
- A holder count of the whole supply needs every token account of the mint (`getProgramAccounts`), too heavy for a public endpoint read every twelve seconds per viewer; it belongs to the same later job.
- A sniper tax or a humans-first window: LaunchLab cannot do the first, and bots trade the pool directly, so the second protects nobody.

## Consequences

- The test stack's window is 40 slots for the backend suite (a buy can be made inside it, then one outside it after a wait of about sixteen seconds) and 100,000 slots for the UI suite, so every seeded trade is a snipe and the shots never depend on how long the seed took.
- The card's copy carries the window in slots and about how long that is, so a deployed page reads "the launch's first 5 slots (about 2 seconds)" and the test stack's reads its own figure.
