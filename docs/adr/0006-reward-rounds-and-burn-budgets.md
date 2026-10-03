# Reward Rounds pay in the coin or the Quote Asset from the operations wallet; Burn and Flywheel budgets come from the Ledger

Status: implemented on the local chain (#17, #18); amended on 2026-10-03 by the owner's decision in #43 (the Payout Asset, below).

A Reward Launch's coin is a Token-2022 mint whose transfer fee is the Reward Tax.
LaunchLab's own authority holds the fee-config authority until Graduation, and the migration hands it to the PlatformConfig's fee-extension authority, our operations wallet, which gives it up for good in the next minute (the `reward-tax-lock` job), so nobody can ever change a coin's tax.
The withdraw-withheld authority is the operations wallet from the launch, so the Reward Engine can harvest the tax at any time: it harvests withheld tax from the coin's accounts to the mint, withdraws it to the operations wallet's account of the coin, and once that holds the rules' threshold opens a Reward Round.
A round snapshots every wallet holding at least the rules' minimum (program-owned accounts such as the curve's and pool's vaults, and the operations wallet, never count), writes every payout before paying any, and pays holders in the coin itself with `transfer_checked`, a few per transaction, marking each payout as sent with its transaction before it goes out.
(That is a coin-payout Reward Launch; the amendment below adds the other Payout Asset.)
A run that dies mid-round leaves nothing the next run could pay twice: sent payouts are settled by their signature, expired ones go back to unpaid.
The rules are versioned and public; a new version takes effect no sooner than a lead time (a day on mainnet) after it is announced, and a round follows the version in force at its snapshot.

Burn and Flywheel budgets are shares of revenue as the Ledger records it: every Platform Fee, pool fee and Fee Key collection valued in SOL at the Quote Registry's latest prices, less what earlier runs spent, which the Ledger also records (kinds `burn` and `flywheel`, two entries per transaction: the SOL spent and the coins destroyed).
Each buy is an exact-output swap for what the budget buys at the current price less a 1% slippage allowance, followed by a burn of exactly that many coins in the same transaction, so a buy never spends more than its budget and the wallet never keeps any of the coin.
The Fee Collector's sweep leaves the unspent budgets in the operations wallet on top of its float.
The Platform Token is named by the operator (`PUT /v1/operator/platform-token`) once Launch #1 has landed; until then the Burn is idle.
The Flywheel rule is the top N graduated Launches by 24-hour trading volume valued in SOL, each bought with an equal share; a coin without a SOL route (paired with something else, and off Jupiter) is skipped and its share waits.

## Considered Options

- Paying Holder Rewards through a queue of per-holder jobs (Cloudflare Queues) with Durable Object locks: more moving parts than a resumable table of payouts and the job lease the other jobs already use; the table gives the same guarantee and is easier to read back.
- Selling the collected tax and paying holders in SOL as the only model: rejected by the PRD; holders complained about exactly that at StonkFun.
  The amendment below lets the Creator choose it per Launch, with the selling bounded and published, because the demand for "hold a meme, earn a stock" is the main reason people hold reward coins there (`research/social/x-gap-analysis.md`, gap 1).
- Burning from a fixed percentage of each Fee Collector run rather than from the Ledger: a run that fails half way, or revenue collected while the burn is idle, would be lost or double counted; the Ledger makes the shares exact and reproducible.
- Exact-input buys: the burn instruction needs to know how many coins to burn, and leaving dust in the wallet breaks the "never keeps any" property.

## Consequences

- Reward Round payouts withhold the Reward Tax again on the way to the holder, as any transfer does; a payout of 100 coins on a 5% coin lands as 95.
- The operations wallet pays every payout's network fee and the rent of new coin accounts for holders who moved coins elsewhere; the rules' minimum holding keeps that bounded.
- Revenue in Quote Assets without a price counts for nothing in the budgets until the registry prices them; coins paid out by Fee Keys never count.
- Prices move between runs, so the budget is what the share is worth at run time; the Ledger shows the SOL actually spent.
- A Reward Launch paired with a taxed Quote Asset, or bought with SOL through a route, meets two transfer fees; the quotes allow for both.

## Amendment (2026-10-03, #43): the Payout Asset

A Reward Launch fixes its Payout Asset at launch, and it can never change: the coin itself (everything above, unchanged), or the paired Quote Asset, as StonkFun pays NVDAx to the holders of a coin paired with NVDAx.
The choice is stored with the launch draft and copied to the Launch by the Indexer; no endpoint ever updates it, the retry of a launch rebuilds it unchanged, and a Reward Launch created on our PlatformConfig without our API (there is no draft) pays in the coin.
It is shown on the launch form, in the review, on the coin page and on every round page.

### Reward Sales

For a Quote Asset payout the Reward Engine turns the collected Reward Tax into the Quote Asset by selling it into the coin's own market, the curve before Graduation and the Raydium pool after it (nothing while Raydium is moving the coin), one slice per run, on the engine's schedule of one run every ten minutes.
A slice is bounded, and the bound is published with the rules:

- At most 0.5% of the coins the market holds against the Quote Asset (`REWARD_SALE_MAX_RESERVE_BPS`, 50): the curve's constant-product base reserve, or the pool's coin vault.
  On a constant-product market a sale of that size lowers the price by about 1%, so a slice is never the large, unpredictable sell holders complained about at StonkFun.
- One slice per coin per run, so at most 144 a day; what the slice does not sell waits for the next run.
- A sale is a sell like any other, server-built with a slippage limit of 1% under its quote (`REWARD_SALE_SLIPPAGE_BPS`, 100), so a sale that would fill worse fails whole and nothing is sold cheaply.
  It pays Raydium's fee, the Platform Fee and the Creator Fee like any sell, and the coin's own Reward Tax is withheld from the coins going in, back into the pot.

Every sale is written down with its signature before it is sent (`reward_sales`), settled by its signature on the next run if the run dies, recorded on the Ledger as two `reward_sale` entries (the coins sold out of the operations wallet into the market, and the Quote Asset received), and indexed as a trade of the coin, so the sale shows in the coin's trade history like anyone else's.
The pot a Quote Asset payout pays from is what the landed sales brought in, less every payout that was paid or is in flight; it is held in the operations wallet, and the Fee Collector's sweep leaves it behind (in SOL on top of the float and the Burn's budgets; in any other token the sweep only ever moves Ledger revenue).

### Rounds for either Payout Asset

The rules are the same for both, in coins: a wallet must hold at least the minimum holding at the snapshot, and a round opens once the threshold of tax has collected.
For a coin payout "collected" is the tax withdrawn to the operations wallet; for a Quote Asset payout it is the coins sold since the last round, since the pot's size in the Quote Asset says nothing about how much tax it came from.
A round records its Payout Asset and, for a Quote Asset payout, the coins that were sold for its pot; payouts are pro rata of the snapshot holdings as before, in the Payout Asset: SOL as plain SOL, any other Quote Asset into the holder's token account, opened by the operations wallet if need be.
A SOL payout under an account's rent-exempt minimum to a wallet that holds no SOL cannot land: such a payout is marked `returned`, its amount stays in the pot for the next round, and the round finishes without it rather than stalling every later round on one empty wallet.

### What holders are told

The launch form says, beside the Reward Tax, in which asset the tax is paid out, and the review repeats it before anything is signed.
The coin page states the Payout Asset in the coin's facts, and its Holder Rewards card shows, for a Quote Asset payout, the sale bounds above, the coins waiting to be sold, what has been sold and for how much, the pot for the next round, and each sale with its transaction.
Round pages show every amount in the Payout Asset, and the rewards page explains both models.

### Consequences of the amendment

- A Quote Asset payout sells into the coin's own chart; the bound makes each slice small and the schedule makes it predictable, and both are public.
- The sales pay trading fees, so holders of a Quote Asset payout receive less than the tax's face value, and the Creator and the platform earn from the sales as from any trade.
- A Reward Launch paired with a taxed Quote Asset loses that asset's transfer fee twice: on the sale's proceeds and again on each payout.
- A Quote Asset payout's first round waits for the sales to reach the threshold, which on a coin with little tax takes several runs.
