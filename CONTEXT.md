# Launchpad

A Solana launchpad where anyone launches a coin paired with any Quote Asset, with no gatekeeper choosing which assets are allowed, and every fee a Creator earns is paid by the chain rather than promised by us.

## Language

### Launching

**Launch**:
A new coin created on our platform together with its bonding curve, from creation until it graduates or dies.
_Avoid_: Token, pool, project

**Creator**:
The wallet that launched a coin and is entitled to its Creator Fee.
_Avoid_: Dev, deployer, owner

**Graduation**:
The moment a Launch's curve sells out and its liquidity moves to a Raydium CPMM pool, after which it trades like any other coin.
_Avoid_: Migration (that is Raydium's mechanism), bonding, completion

**Graduation Target**:
The amount of Quote Asset a Launch's curve must raise to graduate, fixed once at launch as the equivalent of a set amount of SOL.
_Avoid_: Bonding target, market cap target, fund raising

**Quote Asset**:
The existing token a Launch is priced and traded against, such as SOL, a community token or a tokenized stock.
_Avoid_: Pair token, base, collateral

**Quote Risk Label**:
A fact shown next to a Quote Asset that a Creator or trader should know before using it, such as an unverified issuer, an issuer's power to freeze or move tokens, a transfer fee, or no reliable price.
Labels inform rather than block.
_Avoid_: Warning, verification status, badge

**First Buy**:
The Creator's own buy of their coin, made inside the launch transaction right after the curve is created, so no other trade can come before it.
_Avoid_: Dev buy, initial buy, snipe

**Airdrop**:
Part of a Creator's First Buy given to a list of wallets right after launch, paid from the Creator's wallet in as many transactions as the list needs.
_Avoid_: Holder Reward (paid from Reward Tax), distribution

**Asset Pairing**:
Letting a Creator choose any supported Quote Asset instead of only SOL.
_Avoid_: Pair with anything, multi-quote

### Fees

**Platform Fee**:
Our share of every trade on a Launch, earned by the platform.
On the curve LaunchLab pays it into one vault per Quote Asset; after Graduation it is the CPMM pool's creator fee, since the platform is every graduated pool's creator.
_Avoid_: Protocol fee (that is Raydium's cut)

**Fee Key**:
The NFT Raydium mints at Graduation that entitles its holder to the trading fees earned by the pool's locked liquidity; the platform holds every one.
_Avoid_: LP NFT, position NFT

**Creator Fee**:
The Creator's share of every trade on their Launch's curve before Graduation, paid and claimable on-chain with no action from us.
_Avoid_: Creator reward, dev fee, royalty

### Revenue

**Operations Wallet**:
The one hot wallet that signs every day-to-day job and receives all platform revenue first (ADR 0004).
_Avoid_: Fee wallet, hot wallet (on its own)

**Treasury**:
The cold wallet or multisig vault that platform revenue is swept to; no server ever holds its key.
_Avoid_: Vault (LaunchLab's fee vaults are something else), cold wallet (on its own)

**Sweep**:
Moving revenue from the Operations Wallet to the Treasury, so the hot wallet never holds much.
_Avoid_: Withdrawal, transfer (on its own)

**Fee Collector**:
The scheduled job that claims every Platform Fee and Fee Key into the Operations Wallet and sweeps it to the Treasury.
_Avoid_: Fee cron, claimer

**Ledger**:
The append-only public record of every movement of platform revenue, each tied to its transaction signature; Reward Rounds, Burns and Flywheel buys join it.
_Avoid_: History, log, audit trail

### Rewards

**Reward Launch**:
A Launch whose coin charges a Reward Tax on every transfer, collected for its holders.
_Avoid_: Tax token, reward token, reflection token

**Reward Tax**:
The percentage withheld from every transfer of a Reward Launch's coin, in that same coin.
_Avoid_: Transfer fee (the chain's mechanism), tax

**Holder Reward**:
A holder's pro-rata share of collected Reward Tax, paid in the same coin, never sold for anything else.
_Avoid_: Dividend, yield, airdrop, reflection

**Reward Round**:
One published cycle of collecting Reward Tax and paying Holder Rewards, with its snapshot, rules version and payout transactions public.
_Avoid_: Distribution, epoch, cycle

### Platform Token

**Platform Token**:
Our own coin, fair-launched as the first Launch on our platform with no presale or team allocation.
_Avoid_: Governance token, utility token, our coin

**Burn**:
Using platform revenue to buy the Platform Token on the market and destroy it, on a public schedule.
_Avoid_: Buyback (on its own), revenue share, dividend

**Flywheel**:
Using platform revenue to buy the top Launches by an announced rule and burn them.
_Avoid_: Top-10 buyback, support buys
