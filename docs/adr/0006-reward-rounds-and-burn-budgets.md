# Reward Rounds pay in the coin from the operations wallet; Burn and Flywheel budgets come from the Ledger

Status: implemented on the local chain (#17, #18).

A Reward Launch's coin is a Token-2022 mint whose transfer fee is the Reward Tax.
LaunchLab's own authority holds the fee-config authority until Graduation, and the migration hands it to the PlatformConfig's fee-extension authority, our operations wallet, which gives it up for good in the next minute (the `reward-tax-lock` job), so nobody can ever change a coin's tax.
The withdraw-withheld authority is the operations wallet from the launch, so the Reward Engine can harvest the tax at any time: it harvests withheld tax from the coin's accounts to the mint, withdraws it to the operations wallet's account of the coin, and once that holds the rules' threshold opens a Reward Round.
A round snapshots every wallet holding at least the rules' minimum (program-owned accounts such as the curve's and pool's vaults, and the operations wallet, never count), writes every payout before paying any, and pays holders in the coin itself with `transfer_checked`, a few per transaction, marking each payout as sent with its transaction before it goes out.
A run that dies mid-round leaves nothing the next run could pay twice: sent payouts are settled by their signature, expired ones go back to unpaid.
The rules are versioned and public; a new version takes effect no sooner than a lead time (a day on mainnet) after it is announced, and a round follows the version in force at its snapshot.

Burn and Flywheel budgets are shares of revenue as the Ledger records it: every Platform Fee, pool fee and Fee Key collection valued in SOL at the Quote Registry's latest prices, less what earlier runs spent, which the Ledger also records (kinds `burn` and `flywheel`, two entries per transaction: the SOL spent and the coins destroyed).
Each buy is an exact-output swap for what the budget buys at the current price less a 1% slippage allowance, followed by a burn of exactly that many coins in the same transaction, so a buy never spends more than its budget and the wallet never keeps any of the coin.
The Fee Collector's sweep leaves the unspent budgets in the operations wallet on top of its float.
The Platform Token is named by the operator (`PUT /v1/operator/platform-token`) once Launch #1 has landed; until then the Burn is idle.
The Flywheel rule is the top N graduated Launches by 24-hour trading volume valued in SOL, each bought with an equal share; a coin without a SOL route (paired with something else, and off Jupiter) is skipped and its share waits.

## Considered Options

- Paying Holder Rewards through a queue of per-holder jobs (Cloudflare Queues) with Durable Object locks: more moving parts than a resumable table of payouts and the job lease the other jobs already use; the table gives the same guarantee and is easier to read back.
- Selling the collected tax and paying holders in SOL: rejected by the PRD; holders complained about exactly that at StonkFun.
- Burning from a fixed percentage of each Fee Collector run rather than from the Ledger: a run that fails half way, or revenue collected while the burn is idle, would be lost or double counted; the Ledger makes the shares exact and reproducible.
- Exact-input buys: the burn instruction needs to know how many coins to burn, and leaving dust in the wallet breaks the "never keeps any" property.

## Consequences

- Reward Round payouts withhold the Reward Tax again on the way to the holder, as any transfer does; a payout of 100 coins on a 5% coin lands as 95.
- The operations wallet pays every payout's network fee and the rent of new coin accounts for holders who moved coins elsewhere; the rules' minimum holding keeps that bounded.
- Revenue in Quote Assets without a price counts for nothing in the budgets until the registry prices them; coins paid out by Fee Keys never count.
- Prices move between runs, so the budget is what the share is worth at run time; the Ledger shows the SOL actually spent.
- A Reward Launch paired with a taxed Quote Asset, or bought with SOL through a route, meets two transfer fees; the quotes allow for both.
