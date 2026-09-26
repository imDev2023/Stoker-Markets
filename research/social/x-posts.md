# StonkFun on X (@LaunchOnSF)

Collected 2026-09-26.
Raw data is in `x-posts.json`.

## Profile

| Field | Value |
|---|---|
| Handle | [@LaunchOnSF](https://x.com/LaunchOnSF) (user id 1668095655905046529) |
| Display name | Stonk |
| Bio | "Launch coins paired with anything / Powered by $STONK" |
| Website | http://stonkfun.xyz/ (t.co/LCcwPSMSIa) |
| Joined | 2023-06-12 |
| Followers | 54,102 |
| Following | 69 |
| Posts (incl. replies) | 1,209 |
| Verification | Blue check |
| Profile image | https://pbs.twimg.com/profile_images/2089109995379912704/flmLVouk_400x400.jpg |
| Banner | https://pbs.twimg.com/profile_banners/1668095655905046529/1786917612/1500x500 |
| Pinned post | [2091622537968955815](https://x.com/LaunchOnSF/status/2091622537968955815) (2026-08-23, 1.5K likes, 580K views) |

The account was created in June 2023, but every post we could find is from 2026-08-02 onward.
It was probably renamed or repurposed for StonkFun; the earlier history is not visible logged-out.

Pinned post text:

> Introducing stonkfun.xyz!
> The launchpad to create coins / paired with anything.
> Launch coins paired with stocks, commodities, currencies, memes, leveraged assets & more.
> Trade, create, reward holders, or earn.
> Powered by @Raydium
> Telegram: t.me/StonkFunXyz
> Launchpad: stonkfun.xyz
> $STONK

## Coverage and method

- We collected 70 posts, dated 2026-08-02 to 2026-09-26: 64 original posts, 3 self-thread replies, 2 replies to other accounts and 1 X-article share.
- The account shows 1,209 posts in total, and most of the rest are probably replies.
- Bright Data's "discover posts by profile" returned only 3 posts, because X shows very little to logged-out visitors.
- We found the other post URLs through Tavily search limited to x.com, Bright Data Google SERP and a Jina Reader render of the logged-out profile.
- All 70 URLs were then collected with the Bright Data X posts dataset, which gave 70 of 70 records with full metrics.
- Metrics are a snapshot as of 2026-09-26.
- Some older original posts and most replies are probably missing.
- Collecting the full timeline needs a logged-in X session (cookies) or the official X API.

## What the account says StonkFun is

- A Solana token launchpad where any coin can be "paired with anything": tokenized stocks and ETFs, commodities, currencies, pre-IPO shares, leveraged tokens, other memecoins and other StonkFun coins.
- The first framing (2026-08-02) was "The RWA platform on Solana", where every token is paired to an underlying xStocks asset.
- By 2026-08-12 this had become "Launch coins / paired with anything".
- $STONK is the platform token, which they call "the first ever stock paired token on solana".
- $STONK mint (as rendered by X in cashtags): `6GmAFSYs4gk3FDao5FzzySQpPZaWsa4rUJHacpMpUNgx`.
- It started with its own one-sided Raydium CLMM pools instead of a bonding curve (2026-08-11 and 2026-08-16 posts).
- It moved new launches to Raydium LaunchLab (bonding curve with a custom quote asset, then a CPMM pool) on 2026-09-05.
- Its core hook is "reward coins": a transfer tax is converted into the quote asset and paid to holders.

## Features announced

| Date | Feature | Post |
|---|---|---|
| 2026-08-03 | Reward token pairs: 4/4 taxes/LP fees on a Raydium CLMM pool, 85% distributed to holders in xStocks (an earlier quoted post said 3/3) | [2084330305796599918](https://x.com/LaunchOnSF/status/2084330305796599918) |
| 2026-08-05 | Pre-IPO pairings, starting with $ANTHROPIC via @PreStocks | [2085099910924251338](https://x.com/LaunchOnSF/status/2085099910924251338) |
| 2026-08-07 | Public developer API (data endpoints, launch endpoint, docs at stonkfun.xyz/developers) | [2085665517461811542](https://x.com/LaunchOnSF/status/2085665517461811542) |
| 2026-08-07 | Redesigned rewards: hold more than $20 of a reward coin to qualify; rent paid from the pot; pot thresholds by market cap | [2085874861738496456](https://x.com/LaunchOnSF/status/2085874861738496456) |
| 2026-08-10 | Rewards V3: Token-2022 transfer tax, creator buys capped at 2.5%, atomic launch bundles, ecosystem flywheel | [2086856725538185246](https://x.com/LaunchOnSF/status/2086856725538185246) |
| 2026-08-16 | Rebrand (new logo and banner) | [2089116661051793515](https://x.com/LaunchOnSF/status/2089116661051793515) |
| 2026-08-18 | Airdrop Mode: send up to 50% of a reward coin's supply to the top 100, 1,000 or 5,000 holders of the paired token | [2089572281487941742](https://x.com/LaunchOnSF/status/2089572281487941742) |
| 2026-09-05 | Live on Raydium LaunchLab: cheaper deploys, fewer snipers, compounding liquidity after bonding | [2096315023731675202](https://x.com/LaunchOnSF/status/2096315023731675202) |
| 2026-09-24 | "Million Dollar Club" of coins that paid more than $1M in rewards | [2103159830769017061](https://x.com/LaunchOnSF/status/2103159830769017061) |
| 2026-09-26 | Rewards pipeline upgrade: continuous harvesting and distribution, with a fallback of paying in the coin itself; live for LaunchLab coins, legacy CLMM coins to follow | [2103735185229369744](https://x.com/LaunchOnSF/status/2103735185229369744) |

Items on the roadmap but not confirmed as shipped in the posts we collected:
- An on-chain Merkle distributor for rewards.
- A Gitbook with user docs.
- A mobile and frontend redesign.
- Automated listing of new Sunrise assets.

## Fee and tokenomics claims

From the Rewards V3 post (2026-08-10):
- The total tax on reward coins is 4%.
- Holders get 2.785% under V2 and 2.925% under V3.
- The platform fee is 0.504% under V2 and 0.756% under V3.
- V3 coins launch as Token-2022 tokens with a transfer fee, so every transfer is taxed, including wallet-to-wallet transfers.
- The platform fee now comes from a 1% Raydium CLMM pool; before, it was 15% of the 4% CLMM pool.
- 0.084% of pool fees go to the "ecosystem flywheel", which buys back and burns the top 10 platform tokens, weighted by market cap.
- The launch fee dropped from 0.342 SOL to 0.29 SOL.
- Creator buys are capped at 2.5%. This cap was raised on 2026-09-02 to discourage snipers.

Pot thresholds (2026-08-07), meaning how much a coin's pot must hold before a distribution:

| Coin market cap | Pot size before distribution |
|---|---|
| under $50k | $50 |
| $50k to $100k | $200 |
| $100k to $125k | $250 |
| $125k to $25M | 0.1% of market cap |
| $50M and up | $50,000 cap |

From the LaunchLab posts (2026-08-22 and 2026-08-31):
- Deploy cost falls to 0.02-0.03 SOL, down from 0.29-0.3 SOL.
- Each creator uses their own deployer wallet instead of a single operator wallet.
- Coins get a bonding curve with a custom quote asset, then a CPMM pool with compounding LP fees.
- Deployments are permissionless.

Creator fees are mentioned only in general terms ("Earn via Creator fees", 2026-08-02).
Third-party guides describe a 0.5% or 1% creator fee on standard coins, but we did not see that number in the collected posts.

## Metrics the account claimed

| Date | Claim |
|---|---|
| 2026-08-14 | Daily revenue $71,758, buybacks $42,091, 4.12M $STONK burned |
| 2026-08-19 | Listed on DefiLlama, ranked #44 by 7-day revenue |
| 2026-08-31 | $1,214,778 revenue in total, $705,398 of STONK bought back and burned, 105.06M STONK burned, $219.1M Raydium volume, $392.6M total volume, $68,199 of top-10 coins burned, $5.35M rewards paid |
| 2026-09-06 | Daily revenue $1,141,551, buybacks $676,157 |
| 2026-09-08 | $1.2B total trading volume |
| 2026-09-11 | More than $40M of STONK burned, 14.4% of supply |
| 2026-09-14 | $2.6B total trading volume |
| 2026-09-16 | 15% of supply burned, 1M combined reward-coin holders, STONK perps on Lighter and Phoenix, STONK listed on Gate, StonkFun Launchpad Screener live on Jupiter |
| 2026-09-17 / 09-21 / 09-24 | 16% / 17% / 18% of STONK supply burned |
| 2026-09-21 | 2M combined holders across reward coins |
| 2026-09-23 | Sept 22: revenue $1,507,870, buybacks $717,397, 2.4M STONK burned |
| 2026-09-24 | Sept 23: revenue $1,487,685, buybacks $1,130,389, 3.67M STONK burned |
| 2026-09-26 | Sept 25: revenue $965,731, buybacks $580,495, 1.9M STONK burned |

Cumulative rewards paid, as claimed: $5.35M (Aug 31), $7.5M (Sep 5), $15M (Sep 7), $21M and $25M (Sep 8-9), $40M (Sep 14), $50M (Sep 17), $55M (Sep 18), $85M (Sep 26).

## Partners, integrations and linked accounts

| Account or product | Role as stated in posts |
|---|---|
| @Raydium | Liquidity venue (CLMM pools, then LaunchLab and CPMM); "Powered by @Raydium" |
| @Sunrise and @Backpack | Bring tokenized stocks and ETFs to Solana (Backpack Securities issues them); credited on almost every new listing |
| xStocks | The original quote assets (2026-08-02 and 2026-08-03) |
| @PreStocks | Pre-IPO pairings; added $25k of liquidity to the Anthropic/Butthole pair (2026-08-17) |
| @AxiomExchange | Trading terminal integration (2026-08-13) |
| @TradingTerminal, @JupiterExchange, @fomo | Listed as places where coins trade (2026-08-18); a StonkFun screener is live on Jupiter; StonkFun is live on fomo (2026-09-08) |
| @DefiLlama | Revenue listing (2026-08-19); Dune is used to price custom quotes |
| @Gate, Lighter, Phoenix | STONK spot listing (Gate) and perps (Lighter, Phoenix) |
| @hylo_so, @ethena, @zama, @IREN_Ltd, @CoreWeave, @Arm, @BlackBerry, @ripcarsio | Quote assets announced for new listings |
| @solana | Tagged in the launch framing; @solana replied "We stand behind Stonk Tokens" on 2026-09-04 (found in search, not collected as a post here) |
| Injective | X article "How to launch and find INJ tokens through StonkFun on Solana" (2026-09-21) |

Meteora is not mentioned in any post we collected.
Third parties link StonkFun tokens with Meteora (for example, "INJ integrated into Pump.fun, LaunchOnSF and Meteora").

Team members: no named people or team accounts appear in the collected posts.
One third-party page (polymart.app) calls the operator pseudonymous.

## Quote assets announced for pairing

- Pre-IPO: $ANTHROPIC (2026-08-05).
- Sunrise and Backpack tokenized equities and ETFs: $NBIS (08-11), $LLY (announced for 08-20), $GPRO (09-01), $NKE (09-08), $RDDT, $BABA, $COST, $DELL, $UPS, $RBLX, $BULL, $SHOP, $HIMS, $LULU (09-09), $DNUT (09-10), $SCHH (09-14), $BB (09-19), $URA (09-21), $COPX (09-21), $ARM (09-22), $CRWV (09-23), $IREN (09-24), $SQQQ (09-25), $EWY (09-26).
- Crypto: $PEAQ (09-08), INJ (09-21), 3x leveraged $HYPE from Hylo (`7ga6rtE9qSb3wdEiDCpTu2kHqoGVfT52jD8ign1rYTvx`, 09-23), Ethena `0x57e114b691db790c35207b2e685d4a43181e6061` (09-23), Zama `0xa12cc123ba206d4031d1c7f6223d1c2ec249f4f3` (09-24), $CARS from Rip Cars (09-26).

## Addresses found in posts

| Address | Chain | What it is | First seen |
|---|---|---|---|
| `6GmAFSYs4gk3FDao5FzzySQpPZaWsa4rUJHacpMpUNgx` | Solana | $STONK mint (X renders the $STONK cashtag with this address) | 2026-08-31 |
| `7ga6rtE9qSb3wdEiDCpTu2kHqoGVfT52jD8ign1rYTvx` | Solana | 3x leveraged HYPE token from Hylo | 2026-09-23 |
| `0x57e114b691db790c35207b2e685d4a43181e6061` | Ethereum | Ethena token as tagged by X (ENA) | 2026-09-23 |
| `0xa12cc123ba206d4031d1c7f6223d1c2ec249f4f3` | Ethereum | Zama token as tagged by X (ZAMA) | 2026-09-24 |

## Launch timeline (from X and Telegram)

- 2023-06-12: X account created.
- 2026-07-24: Telegram channel @StonkFunXyz created.
- 2026-08-02: First visible post introduces stonkfun.xyz as "The RWA platform on Solana", with coins paired to xStocks and $STONK.
- 2026-08-03 to 08-10: Reward tokens ship, then rewards V2 and V3 (Token-2022 transfer tax).
- 2026-08-05: Pre-IPO pairings ($ANTHROPIC).
- 2026-08-07: Public developer API.
- 2026-08-12 and 08-23: Relaunch posts as "launch coins paired with anything"; the 08-23 post is pinned.
- 2026-08-13: Axiom integration.
- 2026-08-16: Rebrand.
- 2026-08-18: Airdrop Mode.
- 2026-08-19: DefiLlama listing; LaunchLab migration announced.
- 2026-09-02: Raydium ships the last program upgrade StonkFun needs.
- 2026-09-05: All new deployments go through Raydium LaunchLab.
- 2026-09-08: Total volume passes $1.2B; StonkFun is live on fomo.
- 2026-09-16: STONK perps on Lighter and Phoenix; Gate listing; Jupiter screener.
- 2026-09-26: Rewards pipeline upgrade; claimed rewards paid pass $85M.

## Full post log (chronological)

Post text is quoted verbatim, except that em and en dashes have been replaced with "-".
Quoted text keeps the source's own line breaks.

### 2026-08-02 22:38 UTC - [2084046149359477077](https://x.com/LaunchOnSF/status/2084046149359477077)

Type: post.
Metrics: 449 likes, 49 reposts, 114 replies, 30 quotes, 118422 views.
Media: https://pbs.twimg.com/media/HOwE2JJWQAA0O6l.jpg.
Links: https://t.co/LCcwPSMSIa -> https://stonkfun.xyz/, https://t.co/J4oTyvZDi7 -> https://t.me/StonkFunXyz.

> Introducing https://t.co/LCcwPSMSIa!
>
> The RWA platform on @solana 
> Launch tokens backed by stocks, every token is paired to an underlying xStocks asset.    
>
> Trade, Create and Earn via Creator fees, while your token is backed by an underlying equity.
>
> Memes & Stocks
>
> Powered by $STONK - The first ever stock paired token on solana.
>
> Telegram: https://t.co/J4oTyvZDi7
>
> Launchpad:

### 2026-08-03 17:27 UTC - [2084330305796599918](https://x.com/LaunchOnSF/status/2084330305796599918)

Type: post.
Metrics: 32 likes, 10 reposts, 10 replies, 1 quotes, 18502 views.
Links: https://t.co/LCcwPSMSIa -> https://stonkfun.xyz/.

> We will be releasing new updates today!
>
> Reward token pairs are next.
>
> 4/4 taxes/lp fees on Raydium CLMM which 85% is used to distribute holders xStocks.
>
> Tokens are paired with xStocks as normal as well, rewarding holders will incentivize communities being built around tokens launched on https://t.co/LCcwPSMSIa
>
> More information will follow, alongside other updates.

Quoted post [2084131321459143069](https://x.com/LaunchOnSF/status/2084131321459143069) by @LaunchOnSF (2026-08-03):

>> Reward tokens are coming shortly.
>>
>> The launch functionality will be the same, but it will be 3/3 taxes for reward tokens, majority going towards rewards to holders while being paired with stocks, while the rest benefits our platform token.
>>
>> The next update will include this

### 2026-08-05 20:25 UTC - [2085099910924251338](https://x.com/LaunchOnSF/status/2085099910924251338)

Type: post.
Metrics: 232 likes, 34 reposts, 29 replies, 11 quotes, 49097 views.
Media: https://pbs.twimg.com/media/HO-957YXEAMAf-C.jpg.
Links: https://t.co/tscuFhIHFd -> https://www.stonkfun.xyz/launch.

> You can now launch coins paired with $ANTHROPIC! 
>
> Stonkfun is the first platform to ever allow tokens to be paired with Pre IPO companies, powered by @PreStocks! 
>
> Memecoins backed by AI companies!
>
> https://t.co/tscuFhIHFd

### 2026-08-06 01:29 UTC - [2085176365372805320](https://x.com/LaunchOnSF/status/2085176365372805320)

Type: post.
Metrics: 133 likes, 14 reposts, 19 replies, 1 quotes, 10711 views.

> To support developers building on Stonkfun, we are going to be releasing a public API with documentation soon as well for integrations.
>
> - Platform docs OTW
> - Unique new use cases
> - New stock pairs
> - + more

### 2026-08-07 09:53 UTC - [2085665517461811542](https://x.com/LaunchOnSF/status/2085665517461811542)

Type: post.
Metrics: 154 likes, 20 reposts, 27 replies, 4 quotes, 10721 views.

> Our developer API is now public!
>
> You can launch coins programmatically, and build tooling on top of Stonkfun.
>
> - Data endpoints
> - Launch endpoint
> - Documentation 
>
> If you have any issues or need support join our telegram.

### 2026-08-07 23:44 UTC - [2085874861738496456](https://x.com/LaunchOnSF/status/2085874861738496456)

Type: post.
Metrics: 159 likes, 25 reposts, 23 replies, 6 quotes, 35653 views.
Links: https://t.co/LCcwPSMSIa -> https://stonkfun.xyz/.

> Introducing our redesigned reward mechanics! 
>
> https://t.co/LCcwPSMSIa
>
> Now live for all launches on the platform 
> (existing ones as well)
>
> Completely simplified, no more guessing if you will get rewards on any pair based on previous variable thresholds.
>
> - Hold over $20 worth of any reward coin and get rewards
> - Rent is paid VIA the pot fee
>
> This now makes it so a large majority of holders of reward tokens will receive rewards, not only whales if the coin is large!
>
> Pot Thresholds:
> (amount needed to accumulate before distributing)
> < $50k- $50
> $50k - $100k - $200
> $100k - $125k - $250 
> $125k - $25M - 0.1% of market cap 
> $50M +  $50,000 pot cap

### 2026-08-10 16:46 UTC - [2086856725538185246](https://x.com/LaunchOnSF/status/2086856725538185246)

Type: post.
Metrics: 286 likes, 49 reposts, 47 replies, 25 quotes, 48604 views.
Media: https://pbs.twimg.com/media/HPX-BJAWQAAw7P0.jpg.

> StonkFun Update!
>
> Rewards V3:
>
> Rewards increase
> Platform revenue increases
>
> 4% Tax (stays the same)
>
> Rewards V2: 2.785% fees to holders 
> Rewards V3: 2.925% fees to holders 
>
> We now use transfer tax, please note if you transfer tokens to another wallet you are also taxed. 
>
> Coins now launch as token2022 tokens with transfer tax, this solves for pool fee undercutting that has been happening and causing decaying rewards on some pools. 
> Instead of collecting the reward tax via a 4% Raydium CLMM pool, the tax is collected via a transfer fee for rewards
>
> Meaning no matter where someone trades the token, the trade is taxed.
>
> Designed similar to any other EVM reward tokens.
> Platform Fees:
>
> Rewards V2: 0.504%
> Rewards V3: 0.756% 
>
> Increased Revenue & $STONK buybacks
>
> Previously platform fees were derived from 15% of the 4% Raydium CLMM pool
>
> Now platform fees come from a 1% Raydium CLMM pool
>
> As previously stated, there is no change in the total 4% tax. Total fees are saved by using transfer tax vs Raydium CLMM 4% pools, on the protocol fees.
>
> Creators:
>
> As highly requested, we added creator buys capped at 2.5%
>
> We also completely rebuilt the launch logic, launches happen through a atomic transaction bundle, solving for failed launches & safety.
>
> Launch speeds are also much faster.
>
> Launch fees reduced from 0.342 SOL to 0.29 SOL
>
> Ecosystem Flywheel:
>
> To support communities building, 0.084% of pool fees go towards buying back and burning the top 10 tokens on the platform, market cap weighted.
>
> This benefits all V1, V2 & V3 tokens!
>
> All swaps route directly through the Raydium CLMM pools to support reward distributions on current pairs.
>
> We built this feature to incentivize communities to grow projects, and support existing communities 
>
> Developer API: 
>
> We have updated the API to handle creator buys & Atomic deploy transaction submissions
>
> Frontend Updates:
>
> All new pairs should be near instant now on the frontend, volume, market cap, & price data streams instantly.
>
> All of these updates solve for current issues, further support ecosystem tokens, $STONK

### 2026-08-11 11:54 UTC - [2087145513141322052](https://x.com/LaunchOnSF/status/2087145513141322052)

Type: post.
Metrics: 275 likes, 41 reposts, 56 replies, 10 quotes, 16498 views.

> StonkFun's focus is to be the launchpad on Solana to launch coins paired with anything. 
>
> Solana has always been the home for memecoins, and memecoins have been long overdue for unique innovation. Instead of traditional bonding curves, we use a one-sided @Raydium  CLMM pool. This opens the opportunity to do so many things that were not possible before, and never done before on Solana.
>
> You can launch coins paired with any custom quote, RWAs, currencies, pre-IPO shares, and more interesting things coming.
>
> We have a lot of great things coming. Our focus is also to support existing communities on the platform, and build for what people really want.
>
> What's coming?
>
> Over the next few days, we will be integrating with trading terminals & deployers. Making StonkFun tradeable anywhere. Platforms are building out their backends to support custom quotes and any token launched on our platform.
>
> We are going to be working on a complete frontend redesign, improving our backend for scale and growth.
>
> New categories, unique assets, and interesting new concepts we have been working on without diluting any of the ecosystem, and always putting community first.
>
> New assets that list on Sunrise will be listed on StonkFun as well, to help support growth of RWAs on Solana, such as $NBIS today and many more to come.
>
> Overall branding improvments
>
> Further partnerships are in the works.
>
> Regarding bugs:
>
> We fixed v1 & v2 reward distributions that were down for a bit. We are looking into moving all the reward functionality to a Merkle distributor so it lives on-chain.
>
> Deploys were made into atomic transaction bundles, meaning there is no risk of some of the transactions failing (such as positions, LP locks, etc.). It's all handled in one submission.
>
> The speed of V3 reward coin claiming and tax swaps is being improved, so you should see tokens distribute a lot quicker now on V3.
>
> We are also working on adjusting the thresholds for pot distributions so they happen more frequently on higher market cap coins.
>
> More TBA

### 2026-08-12 03:30 UTC - [2087381200318968312](https://x.com/LaunchOnSF/status/2087381200318968312)

Type: post.
Metrics: 408 likes, 40 reposts, 47 replies, 14 quotes, 72538 views.
Media: https://pbs.twimg.com/media/HPfdf7OWcAAiIsJ.jpg.
Links: https://t.co/LCcwPSMSIa -> https://stonkfun.xyz/, https://t.co/J4oTyvZDi7 -> https://t.me/StonkFunXyz, https://t.co/H4LZ8dIKJw -> https://stonkfun.xyz/.

> Introducing https://t.co/LCcwPSMSIa!
>
> The launchpad to create coins / paired with anything.
>
> Launch coins paired with stocks, commodities, currencies, memes, leveraged assets & more.
>
> Trade, create, reward holders, or earn. 
>
> Powered by @Raydium 
>
> Telegram: https://t.co/J4oTyvZDi7
>
> Launchpad: https://t.co/H4LZ8dIKJw
>
> $STONK

### 2026-08-13 17:51 UTC - [2087960282794545453](https://x.com/LaunchOnSF/status/2087960282794545453)

Type: post.
Metrics: 261 likes, 35 reposts, 41 replies, 11 quotes, 17976 views.
Media: https://pbs.twimg.com/media/HPnsFenWUAAjkns.jpg.
Links: https://t.co/RyZMZAmZet -> https://stonkfun.xyz/.

> StonkFun has now been integrated into @AxiomExchange! 
>
> Trade coins paired with anything, directly on Axiom.
>
> You can view the quote tokens that you are trading against, such as stocks, currencies, commodities, Pre-IPO shares and more! 
>
> https://t.co/RyZMZAmZet

### 2026-08-14 23:08 UTC - [2088402362536804691](https://x.com/LaunchOnSF/status/2088402362536804691)

Type: post.
Metrics: 321 likes, 45 reposts, 38 replies, 18 quotes, 50618 views.
Media: https://pbs.twimg.com/media/HPt9PH4XkAAh8-4.jpg.

> StonkFun Daily Revenue
>
> Revenue: $71,758
>
> Buybacks: $42,091
>
> Burned: 4.12M $STONK

### 2026-08-16 16:52 UTC - [2089032567299223696](https://x.com/LaunchOnSF/status/2089032567299223696)

Type: post.
Metrics: 284 likes, 52 reposts, 56 replies, 8 quotes, 32224 views.

> Memecoins / Paired With Anything
>
> In the past, memecoins were created primarily with SOL and stablecoin pairings.
>
> StonkFun changes the way coins can be created while helping support existing communities and quote assets.
>
> Instead of using traditional bonding curves, StonkFun uses @Raydium CLMM pools, which allow for custom quote assets and other unique features that aren't currently possible with traditional bonding curves.
>
> Imagine being able to support an existing community or quote asset while driving volume and holder growth.
>
> Anyone can launch a coin and pair it with anything - including RWAs, memecoins, commodities, currencies, and more.
>
> Launching coins paired with anything, outside of traditional bonding curves, is an innovation StonkFun brought to Solana.
>
> We believe this introduces a plethora of new possibilities beyond traditional bonding curves through the use of custom quote assets.

### 2026-08-16 22:26 UTC - [2089116661051793515](https://x.com/LaunchOnSF/status/2089116661051793515)

Type: post.
Metrics: 306 likes, 43 reposts, 47 replies, 6 quotes, 19964 views.
Media: https://pbs.twimg.com/media/HP4D5wdX0AArmj8.jpg, https://pbs.twimg.com/media/HP4EHWkXAAAesRD.png, https://pbs.twimg.com/media/HP4EsJCXwAAEeIn.jpg.

> StonkFun has a new look! 
>
> Here is our new logo, banner & redesign of overall branding.
>
> Launch coins / Paired with anything

### 2026-08-17 17:48 UTC - [2089409062249124146](https://x.com/LaunchOnSF/status/2089409062249124146)

Type: post.
Metrics: 240 likes, 49 reposts, 31 replies, 6 quotes, 12990 views.
Media: https://pbs.twimg.com/media/HP8Q9NSWgAAG2yx.jpg.

> PreStocks has now added $25,000 of liquidity to Butthole
>
> We have partnered with @PreStocks to support Pre-IPO pairings on StonkFun!
>
> Liquidity was added through @Raydium on the Anthropic/Butthole pair
>
> Launch coins / Paired with anything

### 2026-08-18 04:37 UTC - [2089572281487941742](https://x.com/LaunchOnSF/status/2089572281487941742)

Type: post.
Metrics: 408 likes, 67 reposts, 88 replies, 29 quotes, 54423 views.
Media: https://pbs.twimg.com/media/HP-g6oOWAAAVkyv.jpg.

> Introducing Airdrop Mode!
>
> You can now launch reward coins, select airdrop mode and distribute supply to the holders of the token paired.
>
> StonkFun is all about rewarding holders.
>
> Instead of having to buy supply of a coin to airdrop, all you have to pay is transaction fees! Holders of the quote token are automatically distributed to.
>
> You can choose to distribute up to 50% of the supply of a reward coin to holders of the token you paired it with. 
>
> - Top 100
> - Top 1000
> - Top 5000
>
> Imagine airdropping holders of memecoins, onboarding RWA holders to memecoins, and much more that is now possible!
>
> One of the key reasons for Solana's success during 2023-2024 was airdrops, such as BONK leading the way and airdropping the Solana community. Now anyone can execute a airdrop on our platform! 
>
> All airdrop coins continue to benefit the ecosystem flywheel, where a portion of the platform fees programmatically buyback and burn the top 10 coins on the platform.
>
> Only possible on StonkFun
>
> Instantly tradeable on all platforms: @AxiomExchange @TradingTerminal @fomo @Raydium @JupiterExchange & more

### 2026-08-19 03:07 UTC - [2089912120670343468](https://x.com/LaunchOnSF/status/2089912120670343468)

Type: post.
Metrics: 257 likes, 47 reposts, 35 replies, 6 quotes, 12597 views.
Media: https://pbs.twimg.com/media/HQDb5HjWEAAC8pP.jpg.
Links: https://t.co/Cu2MAKFrhe -> https://defillama.com/protocol/stonkfun, https://t.co/Qz3vWQhVUZ -> https://defillama.com/revenue.

> StonkFun is now listed on @DefiLlama!   
>
> https://t.co/Cu2MAKFrhe 
>
> Ranked #44 among all revenue-generating applications over the past 7 days.  
>
> https://t.co/Qz3vWQhVUZ

### 2026-08-19 18:39 UTC - [2090146753467294012](https://x.com/LaunchOnSF/status/2090146753467294012)

Type: post.
Metrics: 247 likes, 46 reposts, 35 replies, 8 quotes, 35811 views.
Media: https://pbs.twimg.com/media/HQGwCmEXEAAGTAp.jpg.

> Updates:
>
> 1. Working on migrating to LaunchLab, this would solve for snipers on new pairs, increase volume, and incentivize more deployers. It would mean cheaper deploys, fully permissionless and traditional bonding curves which people are used to. 
>
> This would overall help to increase volume across new token deployments. While benefiting $STONK and our ecosystem from the ecosystem flywheel.
>
> 2. We are looking into ways to handle distributions on-chain, which would reduce centralization risks, such as through a Merkle Distributor.
>
> 3. Working on UI improvements to the site overall and mobile.
>
> 4. New listings are coming, been working with Sunrise directly to get new assets listed. Such as $LLY coming tmr
>
> 5. Solving for further improvements around Standard tokens to incentivize deployments outside of just rewards.
>
> We believe StonkFun has brought something truly unique to Solana, coins paired with anything. 
> We are the only platform that offers it, and it is very difficult for other platforms to compete.
>
> StonkFun also handled the integration into terminals for custom quotes, routing and more.
>
> Memecoins / Paired with anything.

### 2026-08-22 00:52 UTC - [2090965215416311994](https://x.com/LaunchOnSF/status/2090965215416311994)

Type: post.
Metrics: 268 likes, 50 reposts, 41 replies, 14 quotes, 33139 views.

> StonkFun Updates:
>
> Here is some information on what is coming over the next week and being worked on.
>
> LaunchLab integration: 
>
> As previously stated this will solve for many issues, increase potential volume and more.
>
> - Low deployment fees (0.02-0.03 SOL vs 0.3)
> - Your own deployer wallets
> - Heavily reduced risk of snipers as we have faced on new pairs on the operator wallet. It can't be done the same way with unique deployer wallets
> - Bonding curves with custom quotes, that users are used to
> - Integrated into platforms
> - Permissionless
>
> Frontend Updates:
>
> We will be focusing on improving our desktop and mobile UI after we are finished with the LaunchLab integration. We understand this has not been a large focus for us thus far, as we have focused on improving our backend for scale across rewards, deployments, and more. 
>
> New Listings:
>
> We will be continuing to work with Sunrise to support new assets, and have a automated solution to them being listed the moment liquidity is added to the pools.
>
> We also are looking into incentives around new listings, to reward creators & traders.
>
> User Docs: 
>
> We are working on our full user docs, which will be a Gitbook with all the information you need to know about the platform.
> As we currently offer a developer docs, but no user docs. That will be completed after the LaunchLab integration as well.
>
> Rewards:
>
> Looking into further ways to move our reward distributions on chain, to make StonkFun even more decentralized.
> This is will be a focus for us after we complete the LaunchLab update.
>
> As discussed before, there is potential around using a Merkle Distributor.
>
> Social presence: 
>
> Improving our overall social presence is a focus as well as we grow, improving on the quality of our posts, while driving further growth.
>
> We appreciate all the support thus far.
>
> More TBA!

### 2026-08-23 20:24 UTC - [2091622537968955815](https://x.com/LaunchOnSF/status/2091622537968955815)

Type: post.
Metrics: 1544 likes, 197 reposts, 252 replies, 75 quotes, 580096 views.
Media: https://pbs.twimg.com/media/HQbvIlFXsAAjR1s.jpg.
Links: https://t.co/LCcwPSMSIa -> https://stonkfun.xyz/, https://t.co/gbYo3DPu62 -> https://t.me/StonkFunXyz.

> Introducing https://t.co/LCcwPSMSIa!
>
> The launchpad to create coins / paired with anything.
>
> Launch coins paired with stocks, commodities, currencies, memes, leveraged assets & more.
>
> Trade, create, reward holders, or earn. 
>
> Powered by @Raydium 
>
> Telegram: https://t.co/gbYo3DPu62 
>
> Launchpad: https://t.co/LCcwPSMSIa
>
> $STONK

### 2026-08-31 09:10 UTC - [2094352080618053837](https://x.com/LaunchOnSF/status/2094352080618053837)

Type: post.
Metrics: 375 likes, 82 reposts, 50 replies, 13 quotes, 48404 views.
Media: https://pbs.twimg.com/media/HRCg6c1XUAA0aM-.jpg.
Addresses: `6GmAFSYs4gk3FDao5FzzySQpPZaWsa4rUJHacpMpUNgx`.

> StonkFun Updates:
>
> We are finalizing some things regarding our LaunchLab integration and looking to get it out to everyone as soon as possible.
>
> Our full focus over the last week has been on this integration, and it has required a lot of work, such as:
>
> - Raydium program updates to support custom quotes & reward coins
> - Aggregator & terminal support for LaunchLab custom quotes and routing
> - Handling pre-bonding rewards and distributions
> And more
>
> In simple terms: Every aggregator, terminal, and Raydium itself had to make changes just to support what StonkFun is building.
>
> LaunchLab will allow for:
> - Permissionless deployments 
> - Deploy fees of 0.03 SOL compared to 0.29 SOL
> - Bonding curves
> - CPMM pools (traditional AMM)
> - LP fees for compounding liquidity
> - Increased deployments, potential volume and more.
>
> We have also spent a lot of time improving our backend and infra for further scale.
>
> Once we finish this integration, the focus will be on:
>
> - Reward distributions through an on-chain distributor
> - New listings
> - Mobile & frontend redesign + docs
> - New features and more
>
> Key Metrics:
>
> - $1,214,778 revenue
> - $705,398 of solana:6GmAFSYs4gk3FDao5FzzySQpPZaWsa4rUJHacpMpUNgx buybacks & burns
> - 105.06M solana:6GmAFSYs4gk3FDao5FzzySQpPZaWsa4rUJHacpMpUNgx burned 
> - $219,148,690 @Raydium  volume
> - $392,624,403 total volume
> - $68,199 bought back & burned of the top 10 ecosystem coins
> - $5,352,990 in rewards distributed 
>
> Launch coins. Paired with anything.

### 2026-09-01 07:25 UTC - [2094688008280703375](https://x.com/LaunchOnSF/status/2094688008280703375)

Type: post.
Metrics: 483 likes, 61 reposts, 35 replies, 23 quotes, 111956 views.

> $GPRO is coming to StonkFun today
>
> Which will allow for coins to be paired with GoPro.
>
> MemeFi on Solana.
>
> Powered by @sunrise & @Backpack

### 2026-09-02 08:37 UTC - [2095068565476933690](https://x.com/LaunchOnSF/status/2095068565476933690)

Type: post.
Metrics: 371 likes, 68 reposts, 47 replies, 10 quotes, 33771 views.

> StonkFun Updates:
>
> Raydium shipped the last program upgrade we need today to finish our LaunchLab integration
>
> New listings are coming this week only possible on Solana and StonkFun. 
>
> Looking to further support communities already building on StonkFun as well, which is a key part of growing a healthy ecosystem.
>
> We understand the issues around snipers and are hoping to ship our LaunchLab update to solve this ASAP.
>
> The biggest issues and user concerns will be solved for:
>
> - Snipers
> - Completely permissionless deployments & no single-wallet launches
> - Low deployment costs
> - Launchers will not have to go through our API and can construct their own transactions
> - CPMM with a compounding LP fee and further improvements
>
> Everything discussed previously around frontend/mobile updates, distributor programs and more will be worked on after.
>
> Max dev-buys are now increased to disincentivize snipers on new coins until LaunchLab.
>
> Working with Sunrise to not have "hyped" pairings pre-announced for future listings, as it leads to people finding ways to take advantage of a situation.
>
> StonkFun is the home for launching anything paired with anything on @solana.

### 2026-09-03 09:37 UTC - [2095446054065852626](https://x.com/LaunchOnSF/status/2095446054065852626)

Type: post.
Metrics: 296 likes, 42 reposts, 30 replies, 6 quotes, 21284 views.
Media: https://pbs.twimg.com/media/HRSD5KUW4AMlztL.jpg.

> StonkFun is the home for pairing anything with anything.
>
> Powered by @Raydium

### 2026-09-03 09:37 UTC - [2095446056066576627](https://x.com/LaunchOnSF/status/2095446056066576627)

Type: self-thread reply (to @LaunchOnSF, post 2095446054065852626).
Metrics: 101 likes, 12 reposts, 10 replies, 2 quotes, 10920 views.

> Platform updates are coming shortly

### 2026-09-03 13:37 UTC - [2095506377447792995](https://x.com/LaunchOnSF/status/2095506377447792995)

Type: reply (to @lylepratt, post 2095504233747349621).
Metrics: 129 likes, 14 reposts, 0 replies, 0 quotes, 2563 views.

> @lylepratt A new way for companies to build communities.
>
> Only possible on StonkFun

### 2026-09-05 19:10 UTC - [2096315023731675202](https://x.com/LaunchOnSF/status/2096315023731675202)

Type: post.
Metrics: 997 likes, 176 reposts, 118 replies, 50 quotes, 192246 views.
Video: {'video_url': 'https://video.twimg.com/amplify_video/2096314991515213827/vid/avc1/1920x1080/kVJV1RK7tnjAwcWU.mp4?tag=29', 'duration': 16512}.
Links: https://t.co/Lq5IOclcO9 -> https://stonkfun.xyz/launch.

> StonkFun is now live on @Raydium LaunchLab.
>
> All new StonkFun deployments now launch through LaunchLab, with cheaper deployment costs, reduced sniper risk, and compounding liquidity after bonding.
>
> https://t.co/Lq5IOclcO9

### 2026-09-05 20:33 UTC - [2096336049240985732](https://x.com/LaunchOnSF/status/2096336049240985732)

Type: post.
Metrics: 495 likes, 78 reposts, 48 replies, 13 quotes, 40659 views.
Media: https://pbs.twimg.com/media/HReuhwhbwAAgmyJ.jpg.

> Over $7.5M in rewards have now been distributed to StonkFun ecosystem holders.
>
> Pair it. Launch it. Trade it. Hold it.

### 2026-09-06 19:25 UTC - [2096681319040184643](https://x.com/LaunchOnSF/status/2096681319040184643)

Type: post.
Metrics: 827 likes, 105 reposts, 91 replies, 23 quotes, 48140 views.
Links: https://t.co/8R23fMR5Gi -> https://stonkfun.xyz/revenue.

> StonkFun Updates:
>
> We have upgraded all of our infrastructure, and downtime issues should now be resolved.
>
> Optimizations were made this morning around reward distributions, operator functions, site loading times, and more.
>
> A patch is being worked on for DeFiLlama and will be merged shortly. This will resolve issues with misreported revenue on DeFiLlama caused by our LaunchLab integration yesterday and the pricing of custom quotes through Dune.
>
> We have new listings being worked on and will continue to support communities building on StonkFun.
>
> You can expect new TradFi asset listings after the market opens following the long weekend. We are also working on bridging more assets to Solana.
>
> Frontend design work has started, and we will be heavily improving our UI across both desktop and mobile.
>
> StonkFun has always focused on listening to users and addressing concerns in the space through innovation.
>
> Daily revenue thus far today:
>
> https://t.co/8R23fMR5Gi
>
> Revenue: $1,141,551
>
> Buybacks: $676,157
>
> More to be announced. We appreciate all the support thus far.

### 2026-09-07 06:42 UTC - [2096851613470314630](https://x.com/LaunchOnSF/status/2096851613470314630)

Type: post.
Metrics: 737 likes, 90 reposts, 118 replies, 23 quotes, 48716 views.
Media: https://pbs.twimg.com/media/HRmDbjxbwAAS3dk.jpg.

> Over $15 million in rewards distributed to StonkFun ecosystem token holders.
>
> Get rewarded for holding.

### 2026-09-08 14:29 UTC - [2097331618969194762](https://x.com/LaunchOnSF/status/2097331618969194762)

Type: post.
Metrics: 634 likes, 69 reposts, 79 replies, 20 quotes, 40598 views.
Media: https://pbs.twimg.com/media/HRs37O6a4AAZe0N.jpg.

> Every coin needs a good pair.
>
> You can now launch coins paired with $NKE on StonkFun.
>
> Tokenized Nike stock, issued by @Backpack Securities and brought to Solana through @sunrise.
>
> Just launch it.

### 2026-09-08 16:47 UTC - [2097366338952171970](https://x.com/LaunchOnSF/status/2097366338952171970)

Type: post.
Metrics: 464 likes, 52 reposts, 52 replies, 8 quotes, 30324 views.
Media: https://pbs.twimg.com/media/HRtXijKawAAmz9j.jpg.
Links: https://t.co/Lq5IOclKDH -> https://stonkfun.xyz/launch.

> Please remember this listing when the clankers take over.
>
> You can now launch coins paired with $PEAQ on StonkFun.
>
> https://t.co/Lq5IOclKDH

### 2026-09-08 18:05 UTC - [2097385874040533009](https://x.com/LaunchOnSF/status/2097385874040533009)

Type: post.
Metrics: 1109 likes, 160 reposts, 158 replies, 62 quotes, 180449 views.
Media: https://pbs.twimg.com/media/HRtn4LNbMAAQict.jpg.

> StonkFun has now crossed $1.2 billion in total trading volume.
>
> Stonk szn on Solana.

### 2026-09-08 21:13 UTC - [2097433092613140879](https://x.com/LaunchOnSF/status/2097433092613140879)

Type: post.
Metrics: 726 likes, 115 reposts, 128 replies, 35 quotes, 94069 views.
Video: {'video_url': 'https://video.twimg.com/amplify_video/2097432678903762944/vid/avc1/1080x1080/haX6dvW_1dMbLzPp.mp4?tag=29', 'duration': 10000}.

> Over $21 million in rewards distributed to StonkFun ecosystem token holders.  
>
> Get rewarded for holding.

### 2026-09-08 22:47 UTC - [2097456768356126934](https://x.com/LaunchOnSF/status/2097456768356126934)

Type: post.
Metrics: 801 likes, 80 reposts, 85 replies, 12 quotes, 41299 views.
Media: https://pbs.twimg.com/media/HRum2OdbsAA0E5h.jpg.

> StonkFun is live on @fomo.
>
> Follow along for launches, announcements, and the latest from the Stonk market.

### 2026-09-09 18:16 UTC - [2097750973410390326](https://x.com/LaunchOnSF/status/2097750973410390326)

Type: post.
Metrics: 849 likes, 123 reposts, 133 replies, 45 quotes, 152229 views.
Media: https://pbs.twimg.com/media/HRy1ZMYbYAAYBey.jpg.

> New Stonk listings are live.
>
> You can now launch coins paired with $RDDT, $BABA, $COST, $DELL, $UPS, $RBLX, $BULL, $SHOP, $HIMS, $LULU and more.
>
> Powered by @Sunrise and @Backpack.

### 2026-09-09 20:31 UTC - [2097784964075192386](https://x.com/LaunchOnSF/status/2097784964075192386)

Type: post.
Metrics: 753 likes, 130 reposts, 93 replies, 29 quotes, 78307 views.
Media: https://pbs.twimg.com/media/HRzUTshacAAgRtr.jpg.

> Over $25M in rewards have now been distributed to StonkFun ecosystem holders.
>
> This is what putting holders first looks like.

### 2026-09-10 19:53 UTC - [2098137782187389080](https://x.com/LaunchOnSF/status/2098137782187389080)

Type: post.
Metrics: 529 likes, 60 reposts, 76 replies, 28 quotes, 68367 views.
Media: https://pbs.twimg.com/media/HR4VMarbUAAZr6q.jpg.
Links: https://t.co/Lq5IOclKDH -> https://stonkfun.xyz/launch.

> For once, the glazing is justified.
>
> You can now launch coins paired with $DNUT, tokenized Krispy Kreme stock on StonkFun.
>
> https://t.co/Lq5IOclKDH
>
> Powered by @Sunrise and @Backpack

### 2026-09-11 06:38 UTC - [2098300010815508662](https://x.com/LaunchOnSF/status/2098300010815508662)

Type: post.
Metrics: 1082 likes, 163 reposts, 160 replies, 31 quotes, 80292 views.
Media: https://pbs.twimg.com/media/HR6m-SVbQAA9kiM.jpg.
Addresses: `6GmAFSYs4gk3FDao5FzzySQpPZaWsa4rUJHacpMpUNgx`.

> More than $40M worth of the total solana:6GmAFSYs4gk3FDao5FzzySQpPZaWsa4rUJHacpMpUNgx supply (at current value) has been burned.
>
> That’s 14.4% of the supply, gone forever.

### 2026-09-14 15:00 UTC - [2099513529535771022](https://x.com/LaunchOnSF/status/2099513529535771022)

Type: post.
Metrics: 461 likes, 56 reposts, 62 replies, 12 quotes, 36548 views.
Media: https://pbs.twimg.com/media/HSL4W8GboAADE50.jpg.
Links: https://t.co/Lq5IOclKDH -> https://stonkfun.xyz/launch.

> The trenches were prime real estate all along.
>
> You can now launch coins paired with tokenized real estate through $SCHH, the Schwab U.S. REIT ETF, on StonkFun.
>
> https://t.co/Lq5IOclKDH
>
> Powered by @Sunrise and @Backpack

### 2026-09-14 19:06 UTC - [2099575479175102910](https://x.com/LaunchOnSF/status/2099575479175102910)

Type: post.
Metrics: 804 likes, 108 reposts, 123 replies, 29 quotes, 53699 views.
Media: https://pbs.twimg.com/media/HSMwqOGb0AAYElu.jpg.

> Over $40M in rewards have now been distributed to StonkFun ecosystem holders.
>
> Fun to hold, paid to hold.

### 2026-09-14 21:42 UTC - [2099614882958299596](https://x.com/LaunchOnSF/status/2099614882958299596)

Type: post.
Metrics: 799 likes, 121 reposts, 120 replies, 29 quotes, 45616 views.
Media: https://pbs.twimg.com/media/HSNUnBxbwAA2hpC.jpg.

> StonkFun has now crossed $2.6 billion in total trading volume.
>
> Stonk Capital Markets.

### 2026-09-16 02:05 UTC - [2100043332990972230](https://x.com/LaunchOnSF/status/2100043332990972230)

Type: post.
Metrics: 676 likes, 117 reposts, 96 replies, 18 quotes, 42176 views.
Media: https://pbs.twimg.com/media/HSTaSElbAAAhtvq.jpg.
Addresses: `6GmAFSYs4gk3FDao5FzzySQpPZaWsa4rUJHacpMpUNgx`.

> The past week on StonkFun:
>
> • Crossed $2.6B in total trading volume
> • Surpassed $40M in total rewards distributed
> • Reached 15% of the original solana:6GmAFSYs4gk3FDao5FzzySQpPZaWsa4rUJHacpMpUNgx supply burned
> • Passed 1M combined holders across reward coins
> • solana:6GmAFSYs4gk3FDao5FzzySQpPZaWsa4rUJHacpMpUNgx perpetuals listed on Lighter and Phoenix
> • solana:6GmAFSYs4gk3FDao5FzzySQpPZaWsa4rUJHacpMpUNgx listed on @Gate 
> • StonkFun Launchpad Screener went live on Jupiter
> • StonkFun updates went live on @fomo 
>
> Development update below.

### 2026-09-17 19:33 UTC - [2100669437942837490](https://x.com/LaunchOnSF/status/2100669437942837490)

Type: post.
Metrics: 669 likes, 105 reposts, 86 replies, 16 quotes, 37209 views.
Media: https://pbs.twimg.com/media/HScTsAZb0AA4HuP.jpg.

> 16% of the total $STONK supply has now been burned.

### 2026-09-17 20:58 UTC - [2100690938377191476](https://x.com/LaunchOnSF/status/2100690938377191476)

Type: post.
Metrics: 603 likes, 95 reposts, 102 replies, 19 quotes, 29321 views.
Media: https://pbs.twimg.com/media/HScmOQcacAAKd4s.jpg.

> $50,000,000 in rewards have now been distributed to holders of StonkFun reward coins.
>
> Fun to hold, paid to hold.

### 2026-09-18 18:22 UTC - [2101013953883291755](https://x.com/LaunchOnSF/status/2101013953883291755)

Type: post.
Metrics: 588 likes, 85 reposts, 106 replies, 35 quotes, 59286 views.
Media: https://pbs.twimg.com/media/HShMmv9aYAA9DR2.jpg.

> $55,000,000 in rewards have now been distributed to holders of StonkFun reward coins.
>
> Holders 🤝 Rewards

### 2026-09-19 16:02 UTC - [2101341071313883630](https://x.com/LaunchOnSF/status/2101341071313883630)

Type: post.
Metrics: 300 likes, 24 reposts, 72 replies, 8 quotes, 50016 views.
Media: https://pbs.twimg.com/media/HSl2UUQa8AEdhgm.png.
Links: https://t.co/Lq5IOclKDH -> https://stonkfun.xyz/launch.

> BlackBerry is back in the group chat.
>
> You can now launch coins paired with $BB from @BlackBerry on StonkFun.
>
> https://t.co/Lq5IOclKDH
>
> Powered by @Sunrise and @Backpack.

### 2026-09-21 14:59 UTC - [2102050015061700825](https://x.com/LaunchOnSF/status/2102050015061700825)

Type: post.
Metrics: 351 likes, 46 reposts, 84 replies, 17 quotes, 44176 views.
Media: https://pbs.twimg.com/media/HSv6LbpaMAAPwa-.jpg.
Links: https://t.co/Lq5IOclKDH -> https://stonkfun.xyz/launch.

> Your next meme could go nuclear.
>
> You can now launch coins paired with $URA, the Global X Uranium ETF, on StonkFun.
>
> https://t.co/Lq5IOclKDH
>
> Powered by @Sunrise and @Backpack.

### 2026-09-21 14:59 UTC - [2102050016609362321](https://x.com/LaunchOnSF/status/2102050016609362321)

Type: self-thread reply (to @LaunchOnSF, post 2102050015061700825).
Metrics: 17 likes, 3 reposts, 8 replies, 0 quotes, 5502 views.
Media: https://pbs.twimg.com/media/HSv7Cn_aUAAiVaj.jpg.

> (no text, image only)

### 2026-09-21 15:39 UTC - [2102060115729981702](https://x.com/LaunchOnSF/status/2102060115729981702)

Type: post.
Metrics: 942 likes, 111 reposts, 113 replies, 33 quotes, 71042 views.
Media: https://pbs.twimg.com/media/HSwDzJzaAAA812a.jpg.
Addresses: `6GmAFSYs4gk3FDao5FzzySQpPZaWsa4rUJHacpMpUNgx`.

> 17% of the total solana:6GmAFSYs4gk3FDao5FzzySQpPZaWsa4rUJHacpMpUNgx supply has now been burned.

### 2026-09-21 16:43 UTC - [2102076256393281766](https://x.com/LaunchOnSF/status/2102076256393281766)

Type: self-thread reply (to @Stonk, post 2102073646600568962).
Metrics: 476 likes, 90 reposts, 58 replies, 0 quotes, 4363 views.

> How to launch and find INJ tokens through StonkFun on Solana

### 2026-09-21 20:06 UTC - [2102127337685082622](https://x.com/LaunchOnSF/status/2102127337685082622)

Type: self-thread reply (to @LaunchOnSF, post 2102127335789199544).
Metrics: 16 likes, 4 reposts, 8 replies, 0 quotes, 6894 views.
Media: https://pbs.twimg.com/media/HSxBoJJaAAAfTBK.jpg.

> (no text, image only)

### 2026-09-21 20:06 UTC - [2102127335789199544](https://x.com/LaunchOnSF/status/2102127335789199544)

Type: post.
Metrics: 376 likes, 41 reposts, 120 replies, 26 quotes, 66889 views.
Media: https://pbs.twimg.com/media/HSxBh11bsAAJ5Uq.png.
Links: https://t.co/Lq5IOclKDH -> https://stonkfun.xyz/launch.

> The trenches just struck copper.
>
> You can now launch coins paired with $COPX, the Global X Copper Miners ETF, on StonkFun.
>
> https://t.co/Lq5IOclKDH
>
> Powered by @Sunrise and @Backpack.

### 2026-09-21 23:10 UTC - [2102173626405630011](https://x.com/LaunchOnSF/status/2102173626405630011)

Type: post.
Metrics: 579 likes, 71 reposts, 120 replies, 18 quotes, 31712 views.
Media: https://pbs.twimg.com/media/HSxrehOagAAw_Qr.jpg.

> 2M combined holders across StonkFun reward coins.
>
> StonkFun is for holders.

### 2026-09-22 20:26 UTC - [2102494801149215208](https://x.com/LaunchOnSF/status/2102494801149215208)

Type: post.
Metrics: 242 likes, 31 reposts, 75 replies, 3 quotes, 21361 views.
Media: https://pbs.twimg.com/media/HS2Ps7PbMAANKQO.jpg.
Links: https://t.co/Lq5IOclKDH -> https://stonkfun.xyz/launch.

> Meet the tech behind your doomscrolling.
>
> You can now launch coins paired with $ARM from @Arm, on StonkFun.
>
> https://t.co/Lq5IOclKDH
>
> Powered by @Sunrise and @Backpack.

### 2026-09-23 01:13 UTC - [2102567078469452198](https://x.com/LaunchOnSF/status/2102567078469452198)

Type: post.
Metrics: 724 likes, 109 reposts, 132 replies, 24 quotes, 55115 views.
Media: https://pbs.twimg.com/media/HS3Q4K5agAAadKK.jpg.
Links: https://t.co/vKy5UJFK4W -> https://stonkfun.xyz/revenue.

> StonkFun Revenue
> (Sept 22nd)
>
> Revenue: $1,507,870
> Buybacks: $717,397
> Burned: 2.4M $STONK
>
> https://t.co/vKy5UJFK4W

### 2026-09-23 15:02 UTC - [2102775629192274216](https://x.com/LaunchOnSF/status/2102775629192274216)

Type: post.
Metrics: 251 likes, 26 reposts, 62 replies, 3 quotes, 19088 views.
Media: https://pbs.twimg.com/media/HS6PHjgaMAAEnP0.jpg.
Links: https://t.co/Lq5IOclKDH -> https://stonkfun.xyz/launch.

> Cloud services, meet the Stonk market.
>
> You can now launch coins paired with $CRWV, from @CoreWeave, on StonkFun.
>
> https://t.co/Lq5IOclKDH
>
> Powered by @Sunrise and @Backpack.

### 2026-09-23 17:31 UTC - [2102813181500657879](https://x.com/LaunchOnSF/status/2102813181500657879)

Type: post.
Metrics: 444 likes, 42 reposts, 112 replies, 13 quotes, 59703 views.
Media: https://pbs.twimg.com/media/HS6xTqtaAAAdjrZ.jpg.
Links: https://t.co/Lq5IOclKDH -> https://stonkfun.xyz/launch.
Addresses: `7ga6rtE9qSb3wdEiDCpTu2kHqoGVfT52jD8ign1rYTvx`.

> For those who can never get enough HYPE.
>
> You can now launch coins paired with solana:7ga6rtE9qSb3wdEiDCpTu2kHqoGVfT52jD8ign1rYTvx, the 3x leveraged $HYPE token from @hylo_so, on StonkFun.
>
> https://t.co/Lq5IOclKDH

### 2026-09-23 20:06 UTC - [2102852030490624228](https://x.com/LaunchOnSF/status/2102852030490624228)

Type: post.
Metrics: 339 likes, 38 reposts, 75 replies, 10 quotes, 43155 views.
Media: https://pbs.twimg.com/media/HS7URNmbkAEg2Yr.jpg.
Links: https://t.co/Lq5IOclKDH -> https://stonkfun.xyz/launch.
Addresses: `0x57e114b691db790c35207b2e685d4a43181e6061`.

> Internet money meets memes.
>
> You can now launch coins paired with ethereum:0x57e114b691db790c35207b2e685d4a43181e6061 from @ethena, on StonkFun.
>
> https://t.co/Lq5IOclKDH
>
> Powered by @Sunrise.

### 2026-09-24 00:19 UTC - [2102915711278702923](https://x.com/LaunchOnSF/status/2102915711278702923)

Type: post.
Metrics: 859 likes, 141 reposts, 153 replies, 67 quotes, 127005 views.
Media: https://pbs.twimg.com/media/HS8OQFPa0AAtT3v.jpg.
Links: https://t.co/vKy5UJFK4W -> https://stonkfun.xyz/revenue.
Addresses: `6GmAFSYs4gk3FDao5FzzySQpPZaWsa4rUJHacpMpUNgx`.

> StonkFun Revenue
> (Sept 23rd)
>
> Revenue: $1,487,685
> Buybacks: $1,130,389
> Burned: 3.67M solana:6GmAFSYs4gk3FDao5FzzySQpPZaWsa4rUJHacpMpUNgx 
>
> https://t.co/vKy5UJFK4W

### 2026-09-24 14:58 UTC - [2103137003554635785](https://x.com/LaunchOnSF/status/2103137003554635785)

Type: post.
Metrics: 266 likes, 28 reposts, 57 replies, 5 quotes, 19602 views.
Media: https://pbs.twimg.com/media/HS_Xvata4AAL8cs.jpg.
Links: https://t.co/Lq5IOclKDH -> https://stonkfun.xyz/launch.
Addresses: `0xa12cc123ba206d4031d1c7f6223d1c2ec249f4f3`.

> Private finance, meets public memes.
>
> You can now launch coins paired with ethereum:0xa12cc123ba206d4031d1c7f6223d1c2ec249f4f3 from @zama on StonkFun.
>
> https://t.co/Lq5IOclKDH
>
> Powered by @Sunrise.

### 2026-09-24 16:29 UTC - [2103159830769017061](https://x.com/LaunchOnSF/status/2103159830769017061)

Type: post.
Metrics: 1377 likes, 185 reposts, 425 replies, 68 quotes, 97533 views.
Media: https://pbs.twimg.com/media/HS_ryaQasAAfE4L.jpg.

> Introducing the Million Dollar Club.
>
> Each of these coins has distributed $1M+ in rewards to holders.
>
> Who’s next?

### 2026-09-24 20:05 UTC - [2103214239750250923](https://x.com/LaunchOnSF/status/2103214239750250923)

Type: post.
Metrics: 205 likes, 23 reposts, 57 replies, 4 quotes, 17443 views.
Media: https://pbs.twimg.com/media/HTAeD7JaEAAvtuP.jpg.
Links: https://t.co/Lq5IOclKDH -> https://stonkfun.xyz/launch.

> More power to the memes.
>
> You can now launch coins paired with $IREN from @IREN_Ltd on StonkFun.
>
> https://t.co/Lq5IOclKDH
>
> Powered by @Sunrise and @Backpack.

### 2026-09-24 20:47 UTC - [2103224807815016485](https://x.com/LaunchOnSF/status/2103224807815016485)

Type: post.
Metrics: 772 likes, 113 reposts, 96 replies, 19 quotes, 35396 views.
Media: https://pbs.twimg.com/media/HTAnpf2bcAAGYkr.png.
Addresses: `6GmAFSYs4gk3FDao5FzzySQpPZaWsa4rUJHacpMpUNgx`.

> 18% of the total solana:6GmAFSYs4gk3FDao5FzzySQpPZaWsa4rUJHacpMpUNgx supply has now been burned.

### 2026-09-25 14:38 UTC - [2103494280614641842](https://x.com/LaunchOnSF/status/2103494280614641842)

Type: post.
Metrics: 337 likes, 37 reposts, 69 replies, 13 quotes, 28416 views.
Media: https://pbs.twimg.com/media/HTEcMwbb0AAqe3X.jpg.
Links: https://t.co/Lq5IOclKDH -> https://stonkfun.xyz/launch.

> Short the Nasdaq. Long the memes.
>
> You can now launch coins paired with $SQQQ on StonkFun.
>
> https://t.co/Lq5IOclKDH
>
> Powered by @Sunrise and @Backpack.

### 2026-09-25 16:10 UTC - [2103517504232669190](https://x.com/LaunchOnSF/status/2103517504232669190)

Type: reply (to @EcosystemCall, post 2103515370049151296).
Metrics: 67 likes, 6 reposts, 20 replies, 5 quotes, 7127 views.

> @EcosystemCall @hylo_so Leverage the memes.

### 2026-09-26 00:23 UTC - [2103641678393532626](https://x.com/LaunchOnSF/status/2103641678393532626)

Type: post.
Metrics: 550 likes, 74 reposts, 59 replies, 6 quotes, 24746 views.
Media: https://pbs.twimg.com/media/HTGhzn-bQAA9Ftq.jpg.
Links: https://t.co/vKy5UJFK4W -> https://stonkfun.xyz/revenue.

> StonkFun Revenue
> (September 25)
>
> Revenue: $965,731
> Buybacks: $580,495
> Burned: 1.9M $STONK
>
> https://t.co/vKy5UJFK4W

### 2026-09-26 01:33 UTC - [2103659250228871405](https://x.com/LaunchOnSF/status/2103659250228871405)

Type: post.
Metrics: 538 likes, 77 reposts, 73 replies, 10 quotes, 22078 views.
Media: https://pbs.twimg.com/media/HTGvxHjawAAdEn9.jpg.

> Over $85,000,000 in rewards have been sent to holders of StonkFun reward coins.

### 2026-09-26 06:35 UTC - [2103735185229369744](https://x.com/LaunchOnSF/status/2103735185229369744)

Type: post.
Metrics: 1660 likes, 320 reposts, 295 replies, 105 quotes, 135695 views.
Media: https://pbs.twimg.com/media/HTH0VYSWMAAMreP.jpg.

> Rewards update.
>
> The StonkFun rewards pipeline has been upgraded.
>
> Rewards no longer wait for a large pot to accumulate before harvesting transfer tax. Fees are converted and distributed continuously.
>
> The upgrade allows for separate horizontal scaling at each stage. There are also distinct thresholds for each stage:
>
> • Harvesting
> • Claiming & swapping
> • Planning and funding distributions
> • Sending distributions to holders
>
> If a conversion ever lags behind volume, rewards can be distributed in the coin itself so payouts keep flowing without delay or excessive harvesting.
>
> Live for new and existing coins launched on LaunchLab, with the upgrade rolling out to legacy coins (CLMM) soon.
>
> The pipeline is still being tuned for optimal performance, further concurrency and prioritization algorithms are being worked on.

### 2026-09-26 15:10 UTC - [2103864852318142520](https://x.com/LaunchOnSF/status/2103864852318142520)

Type: post.
Metrics: 275 likes, 26 reposts, 40 replies, 4 quotes, 12842 views.
Media: https://pbs.twimg.com/media/HTJtul7bMAABbyu.jpg.
Links: https://t.co/Lq5IOclKDH -> https://stonkfun.xyz/launch.

> From Seoul to Solana.
>
> You can now launch coins paired with $EWY, the tokenized iShares MSCI South Korea ETF, on StonkFun.
>
> https://t.co/Lq5IOclKDH
>
> Powered by @Sunrise and @Backpack.

### 2026-09-26 18:00 UTC - [2103907488638840936](https://x.com/LaunchOnSF/status/2103907488638840936)

Type: post.
Metrics: 205 likes, 31 reposts, 52 replies, 9 quotes, 16883 views.
Media: https://pbs.twimg.com/media/HTKTLb9bwAAvvei.png.
Links: https://t.co/Lq5IOclKDH -> https://stonkfun.xyz/launch.

> You’re never too old for Hot Wheels.
>
> You can now launch coins paired with $CARS from @ripcarsio on StonkFun.
>
> https://t.co/Lq5IOclKDH
