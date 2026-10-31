# Stoker

A Solana launchpad where anyone launches a coin paired with any Quote Asset, with no gatekeeper choosing which assets are allowed, and a Creator earns from every trade: half of what the platform collects on their coin, forwarded by us on a public Ledger, where what is owed can be checked against the indexed trades.

## Language

### Launching

**Launch**:
A new coin created on our platform together with its bonding curve, from creation until it graduates or dies.
_Avoid_: Token, pool, project

**Creator**:
The wallet that launched a coin and is entitled to its Creator Earnings.
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

**Swap** (the section):
Jupiter's swap widget on `/swap` (owner, 2026-10-30), any Solana token for any other on mainnet through Jupiter, with a referral fee to the platform; Stoker coins trade on their own pages, never here.
_Avoid_: trade section (parked, #123), exchange

**Copy Protection**:
The window after a Launch, seven days unless the operator sets another, during which nobody else may launch a coin here with its name, ticker or image; afterwards anyone may, and a coin that does carries a label naming the original.
_Avoid_: Anti-vamp (the feature's working name), ticker registry, blacklist

**Quote Risk Label**:
A fact about a Quote Asset that a Creator or trader should know before using it, such as an unverified issuer, an issuer's power to freeze or move tokens, a transfer fee, or no reliable price.
Labels inform rather than block, and are shown as further information (the asset's page, the launch form, a coin's page), never beside the asset's name (owner, 2026-10-10).
_Avoid_: Warning, verification status, badge

**Asset category**:
What kind of asset a Quote Asset is, one of ten (SOL, stablecoin, tokenized stock, real-world asset, wrapped, DeFi, leveraged, collectible, meme, community), read from its mint's address and authorities and from Jupiter's token tags, never from its name (ADR 0010).
The board filters by it and the assets page groups by it; a tokenized stock also carries its issuer.
_Avoid_: Type, sector, class

**Market behind an asset**:
The market TradingView charts for a Quote Asset: the stock or fund a tokenized stock tracks, the coin a wrapped coin wraps, or the coin's own market (#124).
Known from the issuer's ticker or the mint address, never from a name, and absent for an asset with no public market (a private company's token, a collectible); the asset's page charts it.
_Avoid_: Underlying (on its own), real price, reference price

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
Our share of every trade on a Launch, collected by the platform.
On the curve LaunchLab pays it into one vault per Quote Asset; after Graduation it is the CPMM pool's creator fee, since the platform is every graduated pool's creator, less the share of it Raydium keeps at collection (the config's `creator_fee_share_rate`, 5% on mainnet).
Half of it is the Creator's, paid on as the Creator Forward (ADR 0009).
_Avoid_: Protocol fee (that is Raydium's cut)

**Fee Key**:
The NFT Raydium mints at Graduation that entitles its holder to the trading fees earned by the pool's locked liquidity; the platform holds every one.
_Avoid_: LP NFT, position NFT

**Creator Fee**:
LaunchLab's on-chain creator share of curve trades, set per platform: 0 on ours (ADR 0009), so nothing ever collects in a Creator's LaunchLab vault and there is nothing to claim.
The term stays because the chain, the fee-change flow and the announcements name it.
_Avoid_: using it for what a Creator earns (that is Creator Earnings)

**Creator Forward**:
What the platform pays a Creator out of what it has collected on their Launch's trades, straight to the Creator's wallet in the Quote Asset: half of each curve trade's Platform Fee, and half of each pool creator fee collection after Graduation (ADR 0009).
Also one such payment.
_Avoid_: Creator Fee (that is LaunchLab's on-chain term), payout, rebate, revenue share, claim

**Creator Earnings**:
What a Creator's Launches have earned them, the sum of their Creator Forwards: earned, sent and still to be sent, per Quote Asset and per Launch on their own page (`/creator`), which only the connected wallet sees and is offered once it has launched a coin; there is no public creator page (owner, 2026-10-08).
_Avoid_: Creator Fee, claimable, rewards (those are for holders)

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
The scheduled job that claims every Platform Fee and Fee Key into the Operations Wallet and sweeps it to the Treasury, less what is owed to Creators.
_Avoid_: Fee cron, claimer

**Ledger**:
The append-only public record of every movement of platform revenue, each tied to its transaction signature; Creator Forwards, Burns, Flywheel buys and what permanent metadata costs are on it too.
_Avoid_: History, log, audit trail

**Permanent Metadata**:
A coin's image and metadata JSON on Arweave, posted through ArDrive Turbo, where the coin's on-chain metadata URI points and nobody can change them.
_Avoid_: IPFS, pinned metadata, hosted metadata

**Metadata Upload**:
The scheduled job that posts every launched coin's Permanent Metadata to Arweave, buying Turbo credits with SOL from the Operations Wallet when needed.
_Avoid_: Arweave cron, uploader

### Rewards

**Reward Launch**:
A Launch whose coin charges a Reward Tax on every transfer, collected for its holders.
_Avoid_: Tax token, reward token, reflection token

**Reward Tax**:
The percentage withheld from every transfer of a Reward Launch's coin, in that same coin.
_Avoid_: Transfer fee (the chain's mechanism), tax

**Holder Reward**:
A holder's pro-rata share of collected Reward Tax, paid in the Launch's Payout Asset.
_Avoid_: Dividend, yield, airdrop, reflection

**Payout Asset**:
What a Reward Launch pays its Holder Rewards in, fixed at launch and never changed: the coin itself, never sold, or the paired Quote Asset, bought with the tax through Reward Sales.
_Avoid_: Reward token, reflection asset, payout mode

**Reward Sale**:
One bounded sale of collected Reward Tax into the coin's own market for the Quote Asset, made by the Reward Engine on its schedule for a Launch whose Payout Asset is the Quote Asset, and public down to its transaction.
_Avoid_: Dump, conversion, swap (on its own)

**Reward Round**:
One published cycle of collecting Reward Tax and paying Holder Rewards, with its snapshot, rules version and payout transactions public.
_Avoid_: Distribution, epoch, cycle

**Region gate**:
The table that removes a feature from the visitors of one country once someone has asked for its removal there (owner, 2026-10-29: nothing is withheld upfront, every feature works everywhere and the disclosure does its job): the API reads the visitor's country from Cloudflare and answers which features are withheld there; the web hides a withheld feature. The table starts empty (ADR 0014).
_Avoid_: Geoblock, ban

### Platform Token

**Platform Token**:
Our own coin, fair-launched as the first Launch on our platform with no presale or team allocation.
_Avoid_: Governance token, utility token, our coin

**Curated Launch**:
a coin the platform has approved and works on with its team, launched by the platform itself (owner, 2026-10-25, #118).
Only a wallet that stakes STOKER can buy one, and the more it stakes, the larger its allocation of that launch.
The header's "Curated" section lists them; none exists before the Platform Token does.

**Burn**:
Using platform revenue to buy the Platform Token on the market and destroy it, on a public schedule.
_Avoid_: Buyback (on its own), revenue share, dividend

**Flywheel**:
Using platform revenue to buy the top Launches by an announced rule and burn them.
_Avoid_: Top-10 buyback, support buys
