# The psychology of Stoker's audiences (issue #130, research unit, 2026-10-28)

Scope: who the platform must attract, why each of them comes, why they stay, what they fear, and what that means for a named part of the site.
Six audiences, each with its own findings, then an audience map, the conflicts between them, and the dark patterns the site refuses.
Saved page text is under `psychology-sources/` (one folder per site) beside this file, and the raw search results under `psychology-sources/_search/`.
Note on tools: Jina's account balance ran out after the first two reads (402 InsufficientBalanceError), so every later page was fetched with Tavily's extract endpoint instead; the owner should top Jina up before the next research unit.

## What I read

- https://www.iimb.ac.in/sites/default/files/inline-files/attention-induced-trading.pdf - Barber, Huang, Odean and Schwarz, "Attention-Induced Trading and Returns: Evidence from Robinhood Users" (Journal of Finance 2022), working-paper PDF.
- https://rpc.cfainstitute.org/research/cfa-digest/1999/05/are-investors-reluctant-to-realize-their-losses-digest-summary - CFA Institute's digest of Odean 1998 on the disposition effect.
- http://www.fca.org.uk/publication/research-notes/research-note-digital-engagement-practices-trading-apps-experiment.pdf - the FCA's 2024 research note on its trading-app experiment (flashing prices, push notifications, leaderboards, points).
- https://www.osc.ca/en/news-events/news/osc-study-finds-gamification-techniques-influence-retail-investors - the Ontario Securities Commission's 2022 gamification experiment.
- https://www.sec.gov/newsroom/press-releases/2021-167 - the SEC's 2021 request for comment on digital engagement practices.
- https://ideas.repec.org/a/inm/ormnsc/v72y2026i1p32-56.html - Chapkovski, Khapko and Zoican, "Trading Gamification and Investor Behavior" (Management Science 2026).
- https://www.cnbc.com/2021/03/31/robinhood-gets-rid-of-confetti-feature-amid-scrutiny-over-gamification.html and https://apnews.com/article/business-3c83ae69e7dbc4ddc825e9af308e9c78 - Robinhood retiring its confetti in March 2021 and what replaced it.
- https://yalelawjournal.org/essay/on-confetti-regulation-the-wrong-way-to-regulate-gamified-investing - the Yale Law Journal essay on "confetti regulation".
- https://arxiv.org/html/2607.02823v3 - survival analysis of 832,941 pump.fun launches and the social-presence effect (2026).
- https://arxiv.org/html/2609.10246v1 - "Meme Coin Factories: Uncovering Large-Scale Manipulations on pump.fun" (2026).
- https://arxiv.org/html/2602.14860v1 - "Predicting the success of new crypto-tokens: the Pump.fun case" (2026).
- https://arxiv.org/html/2507.01963v2 - "A Midsummer Meme's Dream: Investigating Market Manipulations in the Meme Coin Ecosystem" (2025).
- https://www.snappchart.app/blog/risk-psychology/exit-liquidity - a practitioner piece on exit liquidity that carries Nansen's LIBRA figures as reported by CoinDesk.
- https://axiompro.app/memecoin-sniper and https://gmgn.ai/blog/what-is-a-meme-coin-bundle - the signal tables and bundle definitions of two memecoin terminals.
- https://pepecashfun.com/pumpfun-mechanics/pump-fun-king-of-the-hill-explained and https://x.com/Pumpfun/status/1760103287397793933 - pump.fun's King of the Hill and how it is gamed.
- https://cryptorank.io/news/feed/8c1b7-pump-fun-introduces-50-revenue-sharing-for-solana-meme-coin-creators - pump.fun's 50% creator revenue share of May 2025.
- https://coinpaper.com/10869/pump-fun-creators-earn-2-1-m-in-24-hours-after-project-ascend-launch and https://finance.yahoo.com/news/pump-fun-creators-claim-over-123215972.html - Project Ascend's first day and first week, from Dune.
- https://www.tradingview.com/news/cointelegraph:41ebfb523094b:0-pump-fun-says-creator-fees-may-have-skewed-incentives-plans-revamp - pump.fun's co-founder on why creator fees "skewed" incentives.
- https://www.eugenewei.com/blog/2019/2/19/status-as-a-service - Eugene Wei, "Status as a Service".
- https://www.federalregister.gov/documents/2023/11/09/2023-24234/trade-regulation-rule-on-unfair-or-deceptive-fees - the FTC's fee rule and the drip-pricing studies it cites.
- https://support.google.com/youtube/answer/72902?hl=en - YouTube's own page on estimated versus finalized revenue.
- https://faculty.wharton.upenn.edu/wp-content/uploads/2012/04/Schmitt-Skiera-vandenBulte-2011-Referral-Programs-Customer-Value.pdf - Schmitt, Skiera and Van den Bulte, "Referral Programs and Customer Value" (Journal of Marketing 2011).
- https://getlaunchlist.com/blog/dropbox-referral-program-case-study - the Dropbox referral programme by the numbers.
- https://hyperliquid.gitbook.io/hyperliquid-docs/points - Hyperliquid's own points page.
- https://ankhlabs.co/articles/airdrop-marketing-strategy - a growth agency's summary of Delphi Digital's airdrop retention study.
- https://arxiv.org/html/2312.02752 - "Airdrops: Giving Money Away Is Harder Than It Seems" (Messias, Yaish and Livshits).
- https://memento.epfl.ch/public/upload/files/Xupaper.pdf - Xu and Livshits, "The Anatomy of a Cryptocurrency Pump-and-Dump Scheme" (USENIX Security 2019).
- https://www.ftc.gov/business-guidance/resources/ftcs-endorsement-guides-what-people-are-asking - the FTC's Endorsement Guides FAQ (2023 revision).
- https://www.cnbc.com/2022/10/03/kim-kardashian-settles-sec-charges-instagram-crypto-promotion.html - the SEC's EthereumMax order.
- https://jonahberger.com/wp-content/uploads/2013/02/ViralityB.pdf - Berger and Milkman, "What Makes Online Content Viral?" (Journal of Marketing Research 2012).
- https://buffer.com/resources/the-power-of-twitters-new-expanded-images-and-how-to-make-the-most-of-it and https://www.adweek.com/performance-marketing/twitter-images-study - Buffer's own image data and its summary.
- https://www.coindesk.com/research/pudgy-penguins-a-new-blueprint-for-tokenized-culture - CoinDesk Research on Pudgy Penguins' GIF and licensing strategy.
- https://www.deepdiveplatform.com/blogs/duolingos-unhinged-owl-marketing and https://finance.yahoo.com/news/duolingo-killed-cartoon-owl-mascot-075514046.html - Duolingo's owl, with the shareholder letter's own words.
- https://finance.yahoo.com/news/dogwifhat-knitted-hat-sells-800-110003887.html - dogwifhat's spread and peak.
- https://cryptorank.io/news/feed/f396d-from-pengu-to-zksync-pudgy-penguins-massive-airdrop-windfall-explained and https://www.kucoin.com/price/MILADYCULT - the PENGU and CULT airdrops.
- https://edoc.ku.de/id/eprint/34935/ - Brahmstaedt, "Community and Consumer Dynamics in NFTs" (Journal of Consumer Behaviour 2025), open-access PDF.
- https://credibility.stanford.edu/guidelines and https://simson.net/ref/2002/stanfordPTL.pdf - Stanford's web credibility guidelines and the 2002 study behind them.
- https://www.nngroup.com/articles/first-impressions-human-automaticity - NN/g on first impressions and Lindgaard's 50 ms finding.
- https://jakobnielsenphd.substack.com/p/progressive-disclosure - Jakob Nielsen on progressive disclosure (2025).
- https://www.sciencedirect.com/science/article/pii/S0890838923001270 - Bhambhwani et al., "Auditing decentralized finance" (316 protocols).
- https://tik-db.ee.ethz.ch/file/5918406b48ff5e07db534cb4775b6a1c/LNCS_DeFiAuditing.pdf - "DeFi Auditing: Mechanisms, Effectiveness, and User Perceptions" (ETH Zurich, 12 user interviews).
- `/Volumes/Farhan/Work Folder/Dev/AI/Stoker-Markets-research/research/social/telegram-group-insights.md` - the owner's analysis of StonkFun's private Telegram group (sections "Headline findings", 3, 7, 8 and 11).
- `/Volumes/Farhan/Work Folder/Dev/AI/Stoker-Markets-research/research/social/x-gap-analysis.md` - the owner's analysis of StonkFun's X timeline (sections "Their problems and complaints" and "Where we can do better").

## 1. Traders

### Attention lists move the herd, and the herd loses
Finding: Robinhood users concentrate 35% of their net buying in ten stocks against 24% for other retail investors, and the top 0.5% of stocks they buy each day lose about 4.7% over the following month, rising to 19.6% for the 45 most intense herding episodes.
The authors tie this to the app's "Top Movers" list of twenty stocks sorted on absolute return: stocks just above its $300 million cutoff get the buying and stocks just below it do not.
They also note Robinhood shows five charting indicators where TD Ameritrade shows 489, and conclude that "both complexity and simplicity can lead investors astray".
Source: https://www.iimb.ac.in/sites/default/files/inline-files/attention-induced-trading.pdf (Barber, Huang, Odean and Schwarz, Journal of Finance, 2022), evidence: research
For Stoker: the landing's Trending and the board's default sort are the site's "Top Movers" list.
Never sort by percentage change by default, name the sort in the heading ("Most traded in the last hour", "Newest", "Nearest Graduation") so the list is a fact and not a tip, and keep the asset rail's "Paired with" as the first axis, since a pair is a choice the trader can defend.
Audience: traders, and it protects newcomers.
Conflict: Creators and KOLs want a movers list because it is the stage that makes a coin run; see Conflicts.

### Traders sell winners and hold losers, and the display decides which
Finding: Odean's study of 10,000 discount-brokerage accounts (1987 to 1993) found "a significant preference for selling winners and holding losers", except in December when tax selling takes over, and the effect does not depend on commissions or dividends.
Barber et al. add that "changes in the display of price information affect investors' willingness to sell winners versus losers" (Frydman and Wang 2020).
Source: https://rpc.cfainstitute.org/research/cfa-digest/1999/05/are-investors-reluctant-to-realize-their-losses-digest-summary (CFA Institute digest of Odean 1998), evidence: research
For Stoker: the trade panel's position line shows the holding as a fact ("You hold 1.2M STK, worth 0.41 SOL, bought for 0.38 SOL") in the Quote Asset the coin is priced in, and never colours the whole panel red or green by the open position.
The sell presets (25%, 50%, 100%) stay, because they make a partial exit as easy as a full one.
Audience: traders.

### Notifications and points make people trade more, flicker and leaderboards hurt the least literate
Finding: in the FCA's experiment with trading-app features, push notifications raised the number of trades by 11% and points with a prize draw by 12%, flashing prices and a trader leaderboard did not raise trades overall but did for participants with low financial literacy, and 18 to 34 year olds ended with riskier portfolios under every feature but flashing prices.
The note also cites Moss (2022): Robinhood notifications about price moves of 5% or more raised trading by 25% right after they arrived.
The OSC's 2022 experiment found points of negligible value raised trades by 39% and a "top traded" list made participants 14% more likely to buy and sell what was on it.
Source: http://www.fca.org.uk/publication/research-notes/research-note-digital-engagement-practices-trading-apps-experiment.pdf (Financial Conduct Authority, 2024) and https://www.osc.ca/en/news-events/news/osc-study-finds-gamification-techniques-influence-retail-investors (Ontario Securities Commission, 2022), evidence: research
For Stoker: no points, streaks, prize draws, or trader leaderboards anywhere on the site, and no platform-sent price-move notifications.
Alerts exist only as something a trader sets on one coin (a price or a Graduation), and the board's price cells update without a red or green flash on every tick (a steady figure with "updated 4 s ago" in the row).
Audience: everyone, and it costs traders nothing they can defend.
Conflict: marketers want a referral leaderboard; see Conflicts.

### Confetti adds about 5% volume, mostly by self-selection, and the profit is the real reward
Finding: in a randomised experiment, confetti and achievement badges raised trading volume by 5.17%, but 70% of the gap between gamified and plain platforms was self-selection (participants with lower financial literacy chose the gamified one) and only 30% the features themselves.
Robinhood retired its confetti from 31 March 2021 under regulatory pressure and replaced it with animations the AP called "decidedly measured in pace", and Matt Levine's point, quoted by the Yale Law Journal essay, is that seeing profits, not confetti, is "the main dopamine payoff".
Source: https://ideas.repec.org/a/inm/ormnsc/v72y2026i1p32-56.html (Chapkovski, Khapko and Zoican, Management Science, 2026), https://apnews.com/article/business-3c83ae69e7dbc4ddc825e9af308e9c78 (AP, 2021) and https://yalelawjournal.org/essay/on-confetti-regulation-the-wrong-way-to-regulate-gamified-investing (Yale Law Journal, 2022), evidence: research and practice
For Stoker: the state after a trade is a receipt, not a celebration: the signature, what was paid, what arrived in the wallet after the Reward Tax, the fee and the Creator's half of it, and one share button.
The state after a launch is the coin page itself.
The character appears on the milestone cards (Graduation, a first Holder Reward) as a still, never as a shower over the trade panel.
Audience: everyone.

### Almost every coin dies, bots and wash trades run the ones that look alive, and traders know it
Finding: of 832,941 pump.fun launches (May to June 2026) 0.198% graduated within the study's six-minute window, 1.02% in the Meme Coin Factories sample and 0.63% of 655,770 September 2025 launches.
Wash trading raises a coin's graduation odds up to ten times and is the majority of transactions on coins with more than 10,000 of them, manipulators bypass the web interface and hit the chain directly, markets dominated by bot-like activity graduate less, and 82.8% of 707 high-return memecoins across four chains showed manipulation.
In the LIBRA case (February 2025) 86% of the 40,000 traders lost, $251 million in all, per Nansen.
Source: https://arxiv.org/html/2607.02823v3, https://arxiv.org/html/2609.10246v1, https://arxiv.org/html/2602.14860v1 and https://arxiv.org/html/2507.01963v2 (arXiv, 2025 and 2026), with https://www.snappchart.app/blog/risk-psychology/exit-liquidity carrying Nansen's LIBRA figures, evidence: research
For Stoker: the Stats section on the landing shows the platform's own base rate as a fact ("412 coins launched, 9 graduated"), and the coin page's "Before you buy" card (ADR 0013) adds one figure no terminal has: the share of the coin's trades made through Stoker's own site against those sent straight to the chain, since the Indexer knows which trades came through `POST /v1/transactions/:signature`.
A coin whose trades are mostly direct-to-chain is the bot-dominated market the Pump.fun study found graduates less.
Audience: traders.
Conflict: Creators do not want a 2% base rate beside their launch; see Conflicts.

### The pre-buy checklist is a known list, and each figure needs its definition
Finding: Axiom's Pulse filters are Age, Top 10 holders %, Dev holding %, Snipers %, Insiders %, Bundle % ("four or more buys in one block"), Holders, Pro traders, Liquidity, Volume, Market cap, Transactions, and Buys and sells, with maximums for dev, snipers, insiders and bundles and minimums for holders and liquidity.
GMGN's own definitions differ ("Bundle % reflects how much of the trading was bundled, not how much supply those wallets currently hold"), and it warns that "buying early only proves speed" while "multiple addresses appearing inside the same bundled buys points to coordination".
GMGN's beginner checks also include the creator's rug history, LP burnt %, mint disabled, and top ten under 30%.
Source: https://axiompro.app/memecoin-sniper (Axiom Pro, 2025) and https://gmgn.ai/blog/what-is-a-meme-coin-bundle (GMGN, 2026), evidence: practice
For Stoker: the coin page's "Before you buy" card carries the figures in the terminals' order and vocabulary (Creator holds, First Buy, snipers, bundle marks, top ten) and states under each what it measures and what it does not ("by their trades here", "a transfer out is not a trade"), plus the facts LaunchLab settles for every coin (mint closed, no freeze, liquidity locked after Graduation with the Fee Key held by the platform).
The Top holders tab marks the Creator and each sniper, and the Trades tab marks the Creator's sells, because "who is selling" is the question traders ask in chat.
Audience: traders.
Conflict: honest Creators get called bundlers; the card must carry the evidence, never a verdict.

### Speed is trust for a trader, and the first click of friction belongs before the buy
Finding: Axiom sells speed as the product ("Presets hold size, slippage, priority fee, bribe and MEV mode, hotkeys fire them without the mouse, and search results have their own quick buy"), and Barber et al. note that "the reduction of frictions increases trading" (Barber and Odean 2002).
Source: https://axiompro.app/memecoin-sniper (Axiom Pro, 2025) and https://www.iimb.ac.in/sites/default/files/inline-files/attention-induced-trading.pdf (Barber et al., 2022), evidence: practice and research
For Stoker: the trade panel keeps amount presets, a saved slippage, a quote that names the wallet-side minimum, and the receipt says how long the trade took to land.
The board's CoinRow never carries a buy button: the row opens the coin page, where the "Before you buy" card sits beside the panel, which is the one click of friction the site keeps on purpose.
Bots and terminals get the API and its keys, not hotkeys on the site.
Audience: traders, with the friction protecting newcomers.
Conflict: pro traders want row buys; the API serves them.

### A visibility slot that money can buy is a trap, and traders have learned it
Finding: pump.fun's King of the Hill gives the top of the front page to the curve with the highest market cap at that moment (about $30k when it launched in February 2024, "free marketing"), and the slot is taken by bundled launches that spike the cap, draw in the people who see the banner, and sell into them.
The OSC's "top traded" list lifted buying of the listed stocks by 14%.
Source: https://x.com/Pumpfun/status/1760103287397793933 (pump.fun, 2024) and https://pepecashfun.com/pumpfun-mechanics/pump-fun-king-of-the-hill-explained (practitioner, 2025), evidence: opinion, with https://www.osc.ca/en/news-events/news/osc-study-finds-gamification-techniques-influence-retail-investors (OSC, 2022), evidence: research
For Stoker: no King of the Hill.
The landing's Trending section and the board's top are lists with a named fact behind them, and the only coin the platform ever puts forward on its own is a Curated Launch, labelled as approved and bought by STOKER stakers.
Audience: traders and newcomers.
Conflict: tweeters and KOLs want a moment to post; the milestone cards give them one that cannot be bought.

### What StonkFun's traders asked for in their own chat
Finding: in StonkFun's group, "where are my rewards" led the questions (857 messages from 383 people), "why is the chart dumping, or who is selling" had 54, "is this legit, safe or a scam" 113, snipers and bundles drew 913 messages (a wallet launched about thirty coins through fresh wallets, 14.7% bundled at launch on one coin, 20% at $10K on another), a terminal that showed launch liquidity as unlocked "hurt trader trust", and the team's answer was "measures we won't explain".
Source: `/Volumes/Farhan/Work Folder/Dev/AI/Stoker-Markets-research/research/social/telegram-group-insights.md` (the owner's analysis, 2026), sections 3 and 7, evidence: research (a 3,351-poster group export)
For Stoker: the coin page answers each question without a chat: the RewardsCard for rewards, the Trades tab's marked Creator sells for "who is selling", the "Before you buy" card for bundles and snipers with the method stated, and the pair card's "liquidity locked" fact after Graduation.
Audience: traders.

### Bad routes and look-alike quotes cost StonkFun's traders real money
Finding: StonkFun's timeline carries "swapped 3 sol for 1$ worth", "lost 13 sol, routed to the wrong pool", a coin "paired to the pump one" instead of the real HTZ stock, a fake PEPE whitelisted as a quote, and a Solana co-founder asking whether a pair was real.
Source: `/Volumes/Farhan/Work Folder/Dev/AI/Stoker-Markets-research/research/social/x-gap-analysis.md` (the owner's analysis, 2026), section "Their problems and complaints", evidence: research (1,121 posts)
For Stoker: the trade panel shows the route a SOL buy takes and the least that reaches the wallet before the trader signs, and the pair card shows the Quote Asset's issuer and its Quote Risk Labels (cautions first) at the size of the coin's own name, since the pair is half of what the trader is buying.
Audience: traders.

## 2. Creators

### A visible creator share pulls creators in fast, and pump.fun then had to take it back
Finding: pump.fun began paying creators 50% of protocol fees (0.05% of each trade, in SOL) on 14 May 2025, Project Ascend's dynamic fees paid creators $2.1 million in their first 24 hours (2 September 2025) and over $16 million in the week to 11 September, and bonding-curve volume "more than doubled" for a few weeks.
Its co-founder later wrote "Creator fees need change": the model "encouraged low-risk token creation at the expense of high-risk trading" and became "a blunt incentive to mint tokens rather than build liquid markets", and the fix was fee sharing to up to ten wallets, transferable ownership, and fees that stay claimable and are never forfeited.
Source: https://cryptorank.io/news/feed/8c1b7-pump-fun-introduces-50-revenue-sharing-for-solana-meme-coin-creators (Coin Edition, 2025), https://coinpaper.com/10869/pump-fun-creators-earn-2-1-m-in-24-hours-after-project-ascend-launch (Coinpaper from Dune, 2025) and https://www.tradingview.com/news/cointelegraph:41ebfb523094b:0-pump-fun-says-creator-fees-may-have-skewed-incentives-plans-revamp (Cointelegraph, after Project Ascend), evidence: practice (platform data) and opinion (the co-founder's post)
For Stoker: the launch summary's "You earn" line stays tied to trades that happen ("about 0.5% of every trade, sent in SOL") and never shows a projected sum, the `/creator` page shows earnings per coin with the trades behind them, and Copy Protection plus the Creator's public record (coins launched, coins graduated) are the counterweight to the minting incentive pump.fun found.
Stoker's forward with nothing to claim removes the claim step pump.fun had to keep explaining.
Audience: creators.
Conflict: traders pay the share and want to see where their 1% goes; the launch summary's "the trader pays 1%, half of the platform's take comes to you" serves both.

### Status comes from proof of work, and Graduation is the proof
Finding: "Value is tied to scarcity, and scarcity on social networks derives from proof of work. Status isn't worth much if there's no skill and effort required to mine it."
Every successful network had "an early signature proof of work hurdle" (a witty status, a square photo, a 6-second video).
Source: https://www.eugenewei.com/blog/2019/2/19/status-as-a-service (Eugene Wei, 2019), evidence: opinion (a widely cited practitioner essay)
For Stoker: the proof of work is the pair choice and the Graduation.
The CoinRow and the coin page carry a "Graduated" mark that is a fact (date, pool), the Creator's record on the coin page and the `/creator` page counts launched and graduated coins, and the Curated section is the top rung of the ladder (approved, bought by STOKER stakers), so a Creator's status on Stoker is something they did, not something they bought.
Audience: creators, and the same marks serve traders as facts.
Conflict: a badge reads as an endorsement to a newcomer (the King of the Hill lesson), so every mark is a dated fact, never "hot" or "featured".

### All-in fees up front, because dripped fees are what makes people overpay
Finding: the FTC's fee rule cites studies in which dripped surcharges made people pick the pricier option and stay with it because they "were reluctant to restart the purchase process", a grocery field experiment where showing the tax-inclusive price on the shelf reduced purchases, and StubHub's 2014 experiment where all-in pricing up front "reduced both the quantity and quality of tickets purchased", which is why StubHub reverted to drip pricing until regulation.
Source: https://www.federalregister.gov/documents/2023/11/09/2023-24234/trade-regulation-rule-on-unfair-or-deceptive-fees (Federal Trade Commission, 2023), evidence: research (the cited studies) and practice (the rule)
For Stoker: the launch summary and the hero carry the trader's whole fee as one figure from the chain (1% on the curve, 1.25% after Graduation) with the Creator's half named inside it, never a base figure with the rest at checkout, and the trade panel's quote shows the fee and the Reward Tax before the signature.
Hidden fees would sell more, and that is exactly the reason to refuse them: the Ledger is the platform's claim to be the honest one.
Audience: creators and traders.
Conflict: marketing would rather put the smaller "0.5% to you" figure in the hero; the one-figure rule holds and the Creator's half is named inside it.

### A creator's dashboard must never show a number that later shrinks
Finding: YouTube's estimated revenue "is subject to adjustments" that happen "two times after revenue generation: after 1 week ... and in the middle of the following month reflecting your finalized earnings", and the finalized figure lives in a different product (AdSense).
Source: https://support.google.com/youtube/answer/72902?hl=en (YouTube Help, current), evidence: practice
For Stoker: the `/creator` page's "Sent by the platform" and "Still to be sent" are the right two figures, and they come from the Ledger, so they only ever go up.
Add the reason a figure waits ("sent once worth 0.01 SOL, next Fee Collector run in 24 minutes") and a signature link per forward, and never an estimate of what a coin might earn.
Audience: creators.

### Links at launch are the strongest survival signal a creator controls
Finding: in the 832,941-launch survival study, coins advertising a Telegram channel graduated at 1.485% against 0.166% without (8.94 times, Cox hazard ratio 5.40), a website at 0.264% against 0.158%, and a Twitter account at 0.227% against 0.149%, which the authors read as a correlate of "slower, more organic liquidity accumulation".
Source: https://arxiv.org/html/2607.02823v3 (arXiv, 2026), evidence: research
For Stoker: the launch flow asks for the Telegram, X and website links before the First Buy step and the summary says why in one line, the coin page shows the links in its head beside the explorer link, and the empty-state "invitation" on the landing can carry the same fact for the first Creator.
Audience: creators, and traders read the links as a signal.

### Creators choose where the money goes, and the choice has to stay fixed
Finding: pump.fun's answer to creator demands was control, fee sharing to up to ten wallets and transferable ownership after launch, with its co-founder calling the old flow one that required users "to trust other people to fulfill their promises".
Source: https://www.tradingview.com/news/cointelegraph:41ebfb523094b:0-pump-fun-says-creator-fees-may-have-skewed-incentives-plans-revamp (Cointelegraph), evidence: opinion
For Stoker: the launch flow's choices (the pair, the launch type's tax, the Payout Asset, and #113's Creator Earnings destination: wallet, holder dividend, or buyback and burn) are the control a creator is given, and the launch summary states each one as a term that cannot change after launch.
A trader can then rely on them, which is the trust pump.fun's after-launch changes gave away.
Audience: creators, and the fixedness serves traders.
Conflict: creators will ask to change the destination later; the answer is a new coin, and the summary says so.

### What StonkFun's creators lost: three weeks of "where are my dev fees"
Finding: StonkFun's advertised creator share was forwarded off-chain and broke for about three weeks after its LaunchLab release (first complaints 2026-09-06, partial backfill 2026-09-19, still missing 2026-09-25), creator-fee talk doubled to 2.1 per 1,000 messages with 122 in one week, 96 messages asked where the fees were and 78 how to claim, and the owner's note is that it "damaged creators' reputations with their own holders".
On X the complaint was "there is no option to claim on the token page".
Source: `/Volumes/Farhan/Work Folder/Dev/AI/Stoker-Markets-research/research/social/telegram-group-insights.md` ("Headline findings" 1, sections 3 and 11) and `x-gap-analysis.md` ("Their problems and complaints"), evidence: research
For Stoker: the coin page shows "Creator paid so far" from the Ledger with a link to each forward's signature, so a Creator can answer their own holders with a link, and the `/creator` page's "How you are paid" card says in one line that there is nothing to claim.
A stalled Fee Collector is an alert the operator sees before a holder does.
Audience: creators, and it is the trust question for traders.

## 3. Marketers, KOLs and influencers

### A referred customer is worth more and stays longer
Finding: at a German bank, 5,181 customers acquired by referral in 2006 were about 16% more valuable over six years than 4,633 comparable non-referred customers (25% net of the 20 euro acquisition cost), and about 13% less likely to defect at any point; the margin advantage eroded over time and the retention advantage did not.
Source: https://faculty.wharton.upenn.edu/wp-content/uploads/2012/04/Schmitt-Skiera-vandenBulte-2011-Referral-Programs-Customer-Value.pdf (Schmitt, Skiera and Van den Bulte, Journal of Marketing, 2011), evidence: research
For Stoker: a referral page is worth building, and the on-chain referral share (`share_fee_rate`, paid in the Quote Asset at the trade, capped by each GlobalConfig: SOL's at 1%, most stock configs at 0) is the honest mechanism, since every payment is visible on the trade itself.
The page says exactly where it applies and shows the referrer's wallet and share.
Audience: marketers and KOLs.
Conflict: the share comes out of the trade; the receipt names it so traders see it.

### Two-sided rewards spread further, and a receipt can be the second side
Finding: Dropbox's September 2008 programme gave 500 MB to both the inviter and the invitee (capped at 16 GB), signups went from 100,000 to 4 million in 15 months, and referrals brought 2.8 times the signups of its paid channels.
Source: https://getlaunchlist.com/blog/dropbox-referral-program-case-study (LaunchList, 2026), evidence: opinion (a widely repeated case study of Dropbox's own figures)
For Stoker: the chain pays only the referrer, so the referred trader's side is information: the trade receipt says "0.5% of this trade went to @name as a referral share", which gives the KOL the credit in front of their audience and gives the trader the disclosure the FTC wants.
Audience: marketers and KOLs, and traders through the receipt.

### Points programmes are gamification by another name, and Hyperliquid's worked because revenue absorbed the selling
Finding: Hyperliquid distributed 1,000,000 points a week for six months from 1 November 2023, affiliates earned one point for every four their referred users earned, and Hyperliquid "reserves the right to modify previous point distributions".
Delphi Digital's study of 3.7 million wallets found 78% to 94% of airdrop recipients sold most of their tokens within 90 days, with Hyperliquid an exception because more than $1 billion of revenue funded buybacks that absorbed the selling.
Source: https://hyperliquid.gitbook.io/hyperliquid-docs/points (Hyperliquid, 2024), evidence: practice, and https://ankhlabs.co/articles/airdrop-marketing-strategy (Ankh Labs summarising Delphi Digital, 2026), evidence: opinion
For Stoker: no points for trading (the FCA's and OSC's results above), and if a referral leaderboard exists it ranks referrers by the volume they brought and the Quote Asset they earned, never traders by returns, and it pays from the trade's own share, never from a token promise.
Audience: marketers and KOLs.
Conflict: the FCA's leaderboard treatment made low-literacy participants trade more; a referrer leaderboard is not a trader leaderboard, and the site keeps that line.

### People share what makes them look good, so give the KOL a page that does
Finding: Berger's "social currency" is the first of his six principles ("we share things that make us look good"), and "public" is the fourth: visible things get imitated.
Source: https://jonahberger.com/wp-content/uploads/2013/02/ViralityB.pdf (Berger and Milkman, 2012) and the STEPPS framework from Contagious (Berger, 2013), evidence: research and practice
For Stoker: a KOL's referral page lists the coins they brought trades to with each coin's dated facts (pair, age, graduated or not, volume brought), and the share card for a coin carries its figures from the chain and the pair mark, so a call that went well is a card the KOL wants to post and a card that went badly carries the same facts.
Audience: marketers and KOLs.
Conflict: only the good calls get shared (survivorship); the card's "age" and "graduated" facts and the platform's base rate on Stats keep the record honest.

### A Telegram call channel is a countdown, an image, and a one-minute spike
Finding: in 412 Telegram pump-and-dumps (June 2018 to February 2019), the admin announces the time days ahead, counts down, repeats the rules ("buy fast", shill it, "HODL" for several minutes so outsiders join, sell in pieces), announces the coin as an OCR-proof image, the price surges "several fold" in the first minute and peaks within minutes, and the admin held the coin before the announcement.
Source: https://memento.epfl.ch/public/upload/files/Xupaper.pdf (Xu and Livshits, USENIX Security, 2019), evidence: research
For Stoker: the coin page's "Before you buy" card and Trades tab make a call visible as a spike with the slots and wallets behind it, the share card is drawn for Telegram's preview as much as X's (the "unfurl" finding below), and a pair-feed bot card (every new coin with its Quote Asset) is the platform's own presence in those channels, as StonkFun's pair-feed bot was.
Audience: marketers and KOLs, and traders who get to see the shape of a call.

### Disclosure must sit in the post itself, and the SEC fines the undisclosed
Finding: the FTC's 2023 guides say a disclosure must be "clear and conspicuous", inside the video or post, not in a description, not behind a hyperlink, not in the comments, and "#ad" or "Paid ad" at the start of a post "would likely be effective"; the SEC's EthereumMax order found Kim Kardashian was paid about $250,000 and did not disclose it, with disgorgement and a penalty.
Source: https://www.ftc.gov/business-guidance/resources/ftcs-endorsement-guides-what-people-are-asking (Federal Trade Commission, 2023) and https://www.cnbc.com/2022/10/03/kim-kardashian-settles-sec-charges-instagram-crypto-promotion.html (CNBC, 2022), evidence: practice
For Stoker: the referral page's terms require disclosure in the post, the share card has a variant that carries "Referral: @name earns a share of trades" on the card itself, and the receipt's referral line makes the relationship visible on the site even when the KOL's post is not.
Audience: marketers and KOLs, with the protection for traders.

### The chat is a shilling floor, and a bot card does the support
Finding: 12.6% of StonkFun's user messages contained a contract address, 35% were under 20 characters, the pair-feed bot posted 3,321 new-pair cards, `/ca` and `/report` bots carried much of support and moderation, veterans told newcomers "never to trust a contract address posted in chat and to check the website", and a "no shilling below $10K market cap" rule was enforced 187 times and resented as favouring insiders' bundled coins.
Source: `/Volumes/Farhan/Work Folder/Dev/AI/Stoker-Markets-research/research/social/telegram-group-insights.md` ("Headline findings" 8, sections 7 and 11), evidence: research
For Stoker: the coin page's copy button for the mint sits beside a "verify on the explorer" link, the API's coin endpoint and the share card are shaped so a bot can post a coin card with the pair asset in it, and the site never posts a mint address anywhere a reader cannot verify it.
Audience: marketers and KOLs, and newcomers who learn where to check.

## 4. Tweeters and the shareable moment

### High-arousal emotion spreads, sadness does not
Finding: across three months of New York Times articles, content evoking awe, anger or anxiety was more likely to make the most-emailed list and sadness-inducing content less likely, positive content was more viral than negative, and the effects held after controlling for surprise, interest and practical value.
Source: https://jonahberger.com/wp-content/uploads/2013/02/ViralityB.pdf (Berger and Milkman, Journal of Marketing Research, 2012), evidence: research
For Stoker: the milestone cards aim at awe and amusement (a Graduation with its pool and date, a Holder Reward round's total and holder count, the character), never at anxiety ("last chance", "only 3% left"), and the brand voice on them is dry and factual with the character carrying the fun.
Audience: tweeters and KOLs.
Conflict: anxiety spreads too; the site refuses it (Dark patterns).

### The image is the post, so every page needs a drawn card
Finding: in Buffer's own 100-tweet sample, tweets with images got 18% more clicks, 89% more favorites and 150% more retweets, and Zarrella's earlier data found tweets with pic.twitter.com links 94% more likely to be retweeted.
Source: https://buffer.com/resources/the-power-of-twitters-new-expanded-images-and-how-to-make-the-most-of-it (Buffer, 2013) and https://www.adweek.com/performance-marketing/twitter-images-study (Adweek's summary), evidence: practice (a company's own account data)
For Stoker: every coin page, asset page, Graduation, Holder Reward round and Ledger figure gets a drawn share card (the `seo-share` unit) with the pair mark, the coin's name and one figure, sized for X's summary card and Telegram's preview, because the unfurl is the first screen most visitors ever see.
Audience: tweeters, KOLs and creators.

### A character spreads where a logo cannot
Finding: Pudgy Penguins uploaded 28,500 GIFs to GIPHY and reached 65.1 billion views against Disney's 23.3 billion from 587 uploads, GIPHY's stickers travel inside Telegram, WhatsApp and X, and every toy sold licenses a holder's penguin; Duolingo's daily active users grew almost five times since 2019 and its shareholder letter credits "unhinged and viral marketing campaigns" with user growth, with the trade-off of controversy and crisis response when the owl's stunts misfire.
Source: https://www.coindesk.com/research/pudgy-penguins-a-new-blueprint-for-tokenized-culture (CoinDesk Research, 2025), https://finance.yahoo.com/news/duolingo-killed-cartoon-owl-mascot-075514046.html (Duolingo's shareholder letter via Yahoo Finance, 2025) and https://www.deepdiveplatform.com/blogs/duolingos-unhinged-owl-marketing (DeepDive, 2025), evidence: practice and opinion
For Stoker: the salamander and the Furnace Cat as GIF stickers on GIPHY and Tenor are the cheapest reach the brand has (the marketing folder's job), and on the site the character appears at moments (the Graduation card, a first payout, the landing's empty "invitation", the 404) and nowhere as decoration, so each appearance stays an event.
Audience: tweeters, and NFT communities who recognise the mascot pattern.
Conflict: a character on the trade panel reads as a toy to a pro trader; the terminal pages keep it to the milestone cards.

### A memecoin spreads on one visual trigger
Finding: dogwifhat is "a cute dog wearing a knitted pink hat", reached a $4.58 billion market cap in March 2024, its community raised $700,000 to put it on the Las Vegas Sphere, and the hat itself sold for $800,000.
Source: https://finance.yahoo.com/news/dogwifhat-knitted-hat-sells-800-110003887.html (Decrypt via Yahoo Finance, 2025), evidence: opinion (reported events)
For Stoker: the heat ring and the words "stoke", "stoked" and "paired with" are the triggers, so every milestone card uses one frame (the ring, the pair mark, one figure, the character in one corner) that is recognisable in a feed at thumbnail size, and the Graduation card is the one most worth getting right.
Audience: tweeters.

### The moments worth a card are the ones money cannot buy
Finding: pump.fun's King of the Hill is a visibility slot that bundled launches buy for minutes and sell into; the OSC found a "top traded" list lifted buying of its entries by 14%.
Source: https://pepecashfun.com/pumpfun-mechanics/pump-fun-king-of-the-hill-explained (practitioner, 2025), evidence: opinion, and https://www.osc.ca/en/news-events/news/osc-study-finds-gamification-techniques-influence-retail-investors (OSC, 2022), evidence: research
For Stoker: the platform issues cards for facts only: a Graduation (pool, date), a Holder Reward round paid (total, holders), a Creator Forward (the Ledger entry), a coin's hundredth holder, and a Curated Launch; a share button sits on each, and nothing on the site is a position someone can hold for minutes by buying.
Audience: tweeters, creators and KOLs.

### Overclaiming is the fastest way to lose the trust a card builds
Finding: StonkFun posted "StonkFun will distribute dividends to every token holder" and then a disclaimer narrowing it, valued burned coins "at current value" and reward totals at "each token's current price, not its price when the payout landed", and replies called both a hedge.
Source: `/Volumes/Farhan/Work Folder/Dev/AI/Stoker-Markets-research/research/social/x-gap-analysis.md` ("Their problems and complaints"), evidence: research
For Stoker: every figure on a milestone card is the Ledger's figure (revenue in SOL at the time, burns as what was spent, a round's total as what was paid) with the entry's signature behind the card's link, and the platform's own posts keep the same discipline.
Audience: tweeters and everyone.

## 5. NFT projects and communities

### An NFT is an entry ticket to belonging, and belonging outlasts the price
Finding: from 21 in-depth interviews and a Discord netnography, NFT ownership works as "both an entry ticket to social connection and a symbol of shared values", members identify by their characters ("Hangout Hawk"), "even when financial returns disappoint, these social factors can sustain engagement and perceived value", members form parasocial bonds with leaders that some leaders exploit, and "utilities" that turned out to be more NFTs annoyed them.
Source: https://edoc.ku.de/id/eprint/34935/ (Brahmstaedt, Journal of Consumer Behaviour, 2025), evidence: research
For Stoker: the asset page of a community's asset (`/assets/[mint]`) is that community's own board: its coins, its market chart, and the Holder Reward rounds paid in it, and a coin "Paired with PENGU" is an in-group signal the pair mark makes visible in every row.
A Reward Launch that pays holders in the community's own asset is a utility that is not just another token.
Audience: NFT communities.
Conflict: traders outside the community see a coin paired with an illiquid community asset as a risk; the Quote Risk Labels ("low liquidity", "unverified") stay on the pair card.

### The 2024 token launches gave every holder a stake, and widened the in-group on purpose
Finding: PENGU (17 December 2024) gave each Pudgy Penguin 1.7 million tokens, 25.9% of supply to the community, and extended the drop to Lil Pudgys, Doodles, Cool Cats and Moonbirds holders; CULT (December 2024) raised $20.5 million in presale, airdropped about $207 million to Milady holders on 10 December and closed its first day near a $500 million valuation, with 20% to 35% of supply in a treasury vested six months.
Source: https://cryptorank.io/news/feed/f396d-from-pengu-to-zksync-pudgy-penguins-massive-airdrop-windfall-explained (CryptoRank, 2025) and https://www.kucoin.com/price/MILADYCULT (KuCoin, 2026), evidence: opinion (reported allocations)
For Stoker: Airdrop Mode (#49) should target holders of the Quote Asset and allied collections read from the chain at launch (the x-gap's idea 8), and the coin page's launch summary shows the allocation split (airdrop, First Buy, curve) so a community can see its share before it buys.
Audience: NFT communities and their creators.

### Airdrops get sold, rounds get kept
Finding: in nine major airdrops, the first thing most recipients did was sell on an exchange (65.75% of Lido's tokens, 58.67% of 1inch's, 48.21% of Optimism's), claims concentrated in the first days (87%, 77% and 73% of eligible accounts), and the proceeds "benefit mostly airdrop farmers"; Delphi Digital's 3.7-million-wallet study found 78% to 94% of recipients sold most of their allocation within 90 days, with Jito an exception because it "kept its eligible group small enough to avoid industrial farming".
Source: https://arxiv.org/html/2312.02752 (Messias, Yaish and Livshits, 2023 to 2025), evidence: research, and https://ankhlabs.co/articles/airdrop-marketing-strategy (Ankh Labs summarising Delphi Digital, 2026), evidence: opinion
For Stoker: Reward Rounds are the retention mechanism and Airdrop Mode is the acquisition one, so the rewards page leads with rounds (paid, to how many holders, in what) and an airdrop is small, targeted by a stated snapshot and a minimum holding, and shown on the coin page with its list's rule.
Audience: NFT communities, and traders who want to know who was given the supply.

### A holder wants to see their own standing
Finding: StonkFun's holders asked "where are my rewards" 857 times, the team changed thresholds and per-round minimums without notice, and the owner's rule for a rival is "give every wallet a status page (accrued, pending, paid)" and "publish the rules before launch, and never change them silently".
Source: `/Volumes/Farhan/Work Folder/Dev/AI/Stoker-Markets-research/research/social/telegram-group-insights.md` ("Headline findings" 2 and 3, section 11), evidence: research
For Stoker: the RewardsCard's "Pot for the next round", "Minimum holding" and "Round runs from" are the published rules, and the connected wallet sees its own line on the coin page ("you hold 2.1M, above the minimum, paid 0.04 SOL in 3 rounds") with each payout's signature, which is the belonging signal of Brahmstaedt's communities made concrete.
Audience: NFT communities and holders.

### Communities want to be the quote, and the pipeline must say how
Finding: in 3,321 new-pair cards on StonkFun, the quote asset was its own token in 24%, gold in 8%, PEPE in 6% and SOL in only 4.5%, demand shifted to "let us pair against our token" once stocks lost novelty, and the owner's rule is to "publish clear quote criteria up front" with "a self-serve request flow with approval".
Source: `/Volumes/Farhan/Work Folder/Dev/AI/Stoker-Markets-research/research/social/telegram-group-insights.md` ("Headline findings" 4 and 5, section 11), evidence: research
For Stoker: the asset directory makes a community's asset findable by name and shows its coins, and a "Not quoted yet?" line on `/assets` states the criteria (a Raydium GlobalConfig, verified mint, not mintable, no transfer fee on the quote, liquidity) and who creates it, since Stoker cannot.
Audience: NFT communities.

## 6. Everyone: trust in seconds, density without a toggle

### Credibility is judged on the look first, most of all for finance
Finding: of 2,684 people rating 100 live sites, 46.1% of their credibility comments were about "design look", rising to 54.6% for finance sites, ahead of information structure (28.5%); Stanford's ten guidelines are: make it easy to verify, show a real organisation, show expertise, show honest people stand behind it, make it easy to contact you, look professional, be easy to use and useful, update often, use restraint with promotion, and avoid errors of every size.
Source: https://simson.net/ref/2002/stanfordPTL.pdf and https://credibility.stanford.edu/guidelines (Fogg et al., Stanford Persuasive Technology Lab, 2002), evidence: research
For Stoker: the footer carries the real organisation, a contact address, the GitHub repository and the disclaimer, the Ledger pages are the "easy to verify" guideline made literal (every entry a signature), the board and coin page show "updated 4 s ago", there is no promotional banner on any terminal page, and the pixel baselines are the zero-errors guideline.
Audience: everyone, newcomers most.

### The verdict comes in 50 milliseconds and rarely changes
Finding: Lindgaard and colleagues found people judge a page's visual appeal within 50 milliseconds and the judgment holds when given more time, and the aesthetic-usability effect makes people "more forgiving of beautiful designs and less so of visually jarring ones".
Source: https://www.nngroup.com/articles/first-impressions-human-automaticity (Nielsen Norman Group, 2017, citing Lindgaard et al., 2006), evidence: research
For Stoker: the owner's "vibe-coded" verdict is that 50 ms verdict, so the hero at 1440 and 390 is the one screen the redesign must win: one headline, one fee figure, the pair mark, and nothing that reads as a template.
Audience: everyone.

### Audits raise what people deposit, and Stoker's claim is that there is nothing to audit
Finding: across 316 of the largest DeFi protocols, those vetted by more and better auditors hold more TVL and higher token values, both "significantly increase after a protocol's first audit", and audited protocols fell less after TerraUSD's collapse; yet of 12 DeFi users interviewed, "most interviewees felt the auditing effectiveness was inadequate".
Source: https://www.sciencedirect.com/science/article/pii/S0890838923001270 (Bhambhwani et al., 2023) and https://tik-db.ee.ethz.ch/file/5918406b48ff5e07db534cb4775b6a1c/LNCS_DeFiAuditing.pdf (ETH Zurich, 2023), evidence: research
For Stoker: a "How Stoker holds money" section on the Developers page and one line in the footer: no custom program, trades go through LaunchLab and Raydium's audited programs, every transaction is built on the server and signed in the trader's wallet, the platform's wallets hold fees and reward pots only, and the Ledger lets anyone recompute what they hold.
Audience: everyone, newcomers and NFT communities most.

### Level 1 does 80% of the job, experts pay one click, and there is no "pro mode"
Finding: progressive disclosure puts "the few features that serve most tasks on the first screen and defers the rest to a clearly labeled second level", with four decades of evidence that "novices learn faster and err less, while experts pay 1 click"; the rule is that about 80% of tasks finish on level 1, stop at two levels, and test five novices on level 1 and five experts reaching level 2 in seconds.
Source: https://jakobnielsenphd.substack.com/p/progressive-disclosure (Jakob Nielsen, 2025), evidence: practice (with Carroll and Carrithers 1984 behind it)
For Stoker: on the coin page level 1 is the chart, the trade panel, the "Before you buy" card's four lines, the curve progress and the pair card's labels, and level 2 is the Trades and Top holders tabs, each label's detail, and the Quote Asset's market chart; on the board level 1 is the row (pair, name, price, age, market cap) and level 2 the coin page.
No density toggle and no "pro" view: the API and keys are the expert's level 2.
Audience: everyone; it is how traders and newcomers share one page.

### "Is this legit?" is asked out loud, and the answer is who holds which key
Finding: 113 messages from 84 people asked whether StonkFun was legit, safe or a scam, a user warned "the hot wallet could rug every coin at once", another urged moving payouts to Squads or a program, one asked "who is the team", and others praised the on-chain revenue, the burns and "the founder posting in the open".
Source: `/Volumes/Farhan/Work Folder/Dev/AI/Stoker-Markets-research/research/social/telegram-group-insights.md` (sections 3 and 8), evidence: research
For Stoker: the same Developers section states the keys in plain words (a cold admin key that cannot change, a treasury, an operations wallet that sweeps on a schedule, the Reward Tax authority given up after Graduation) with the ADR linked, and the footer names who runs the platform and where to reach them.
Audience: everyone.

### Self-serve answers beat a founder in the chat
Finding: 1,243 user questions were aimed at StonkFun's team against 433 team replies, the founder wrote recovery scripts in chat, and the owner's rule is to "budget for a ticket queue, a status page and FAQ docs before launch".
Source: `/Volumes/Farhan/Work Folder/Dev/AI/Stoker-Markets-research/research/social/telegram-group-insights.md` (section 3 "Support workload", section 11), evidence: research
For Stoker: every question in the chat's top ten has a page that answers it for the connected wallet (`/creator` for fees, the RewardsCard and the wallet's own line for rewards, the trust card for "who is selling"), the footer carries an indexer status line ("last trade indexed 4 s ago"), and `/announcements` carries every rule change ahead of time.
Audience: everyone.

## Audience map

| Audience | Comes for | Stays for | Fears | The figure or feature that wins them | The page that serves them |
|---|---|---|---|---|---|
| Traders | a new pair nobody else lists, speed | a position they can read, alerts they set, a site whose figures match the chain | being exit liquidity: bundles, snipers, a dev sell, a bad route | the "Before you buy" card with its method stated, and the trade's wallet-side minimum | the coin page, then the board |
| Creators | a pair of their choosing and about 0.5% of every trade sent to them | earnings that only go up, a public record (launched, graduated) | a launch that dies, a forward that breaks, being called a bundler | "Sent by the platform" with a signature per forward, and Graduation as a dated mark | the launch flow and summary, then `/creator` |
| Marketers and KOLs | an on-chain referral share paid in the Quote Asset | a page that makes their calls look good, a bot-ready coin card | looking like a shill, an FTC or SEC problem | the referral page with the share named on every receipt | the referral page and the coin's share card |
| Tweeters | a moment worth posting | a frame their followers recognise | posting a figure that turns out inflated | the Graduation card with the Ledger's figures and the character | the milestone cards and share buttons |
| NFT communities | a coin priced in their own asset and rewards paid in it | seeing their own standing in each round, their asset's own board | a utility that is just another token, an airdrop that gets dumped | the wallet's own reward line and the asset page of their asset | `/assets/[mint]`, `/rewards`, Airdrop Mode |
| Newcomers (everyone) | the promise of the hero | a site that looks like it was designed and tells them who holds what | losing money to something they did not understand | one fee figure, the Ledger as proof, "how Stoker holds money" | the landing, then the footer and Developers page |

## Conflicts

1. Traders want a movers list; creators and KOLs want the stage it gives.
Resolution: lists exist, but each is a named fact (most traded in the hour, newest, nearest Graduation) and never a percentage-change ranking by default; the stage for a coin is its milestone cards, which nobody can buy.
2. Traders want the platform's base rate and every bundle figure; creators do not want a 2% graduation rate beside their launch.
Resolution: the base rate is a platform figure on Stats, never a per-coin probability, and every per-coin figure carries its evidence and the phrase "by their trades here".
3. Creators want a projected earnings figure; the FCA and the YouTube pattern say a figure that shrinks destroys trust.
Resolution: "You earn" is a rule (about 0.5% of every trade, in the Quote Asset), the only sums shown are sums already sent, and the landing's Stats shows the money sent to Creators so far.
4. Marketers want a leaderboard; the FCA's and OSC's experiments show trader leaderboards and points raise trading in the least literate.
Resolution: if a leaderboard exists it ranks referrers by volume brought and Quote Asset earned, and the site has no trader ranking, no points and no streaks.
5. Pro traders want one-click buys from the board row and hotkeys; newcomers need the trust card before the buy.
Resolution: the row opens the coin page, the panel keeps presets, and the API with keys serves the bots.
6. Tweeters want arousal; anxiety spreads as well as awe.
Resolution: cards carry awe and amusement (Graduation, a payout, the character) and never scarcity or countdown copy.
7. NFT communities want their asset as a quote; traders see an illiquid community asset as a risk.
Resolution: the pair card keeps the Quote Risk Labels on, and the asset directory states the quote criteria so a community knows what it must meet.
8. Creators want to change the Creator Earnings destination later; traders rely on the terms fixed at launch.
Resolution: the launch summary states every term as unchangeable, and a change is a new coin.
9. The character delights tweeters and communities; it reads as a toy to a pro trader on the trade panel.
Resolution: the character lives on the landing's empty state, the milestone cards and the 404, never on the terminal pages' working surfaces.
10. Density for traders against reassurance for newcomers.
Resolution: progressive disclosure with two levels on every terminal page and no toggle, with the five-novices and five-experts test from Nielsen as the acceptance test.

## Dark patterns we refuse

- Confetti or any celebration on a trade or a launch: hedonic gamification raised volume 5.17% and attracted the least literate (Chapkovski, Khapko and Zoican, Management Science 2026); Robinhood retired it in March 2021 (AP, CNBC).
- Points, streaks, badges for trading, and prize draws: points of negligible value raised trades 39% (OSC 2022) and points with a prize draw 12% (FCA 2024), and trading more lowers returns (the FCA note's summary of the literature).
- Platform-sent price-move notifications: push notifications raised trades 11% in the FCA's experiment and 25% on Robinhood after a 5% move (Moss 2022 via the FCA note); alerts are only ever set by the trader on one coin.
- Trader leaderboards and "top trader" rankings: low-literacy participants traded more under the FCA's leaderboard, and leaderboards drive herding (OSC 2022's top-traded list, +14%).
- A "Top Movers" or percentage-change ranking as the default sort: Robinhood's list predicted a 4.7% loss over the next month for the stocks it put forward (Barber et al. 2022).
- A King of the Hill or any visibility slot a bundle can buy: the slot is taken by bundled launches that sell into the people it attracts (pepecashfun 2025; the OSC's top-traded effect).
- Flashing red and green on every tick: the FCA's "flashing prices" raised trading in low-literacy participants, and presenting data in red colours risk perception (Bazley et al., cited by the Yale essay).
- Countdowns, "last chance" and scarcity copy: the pump-and-dump playbook runs on a countdown and a "buy fast" rule (Xu and Livshits 2019), and anxiety is a high-arousal emotion that spreads (Berger and Milkman 2012), which is why it works and why the site will not use it.
- Dripped fees (a headline figure with the rest at checkout): dripped surcharges make people pick the pricier option and stay with it, and StubHub reverted to drip pricing because all-in prices sold less (the FTC's fee rule, 2023).
- A projected or estimated earnings figure on the launch form or the creator page: estimates that get adjusted down are the pattern YouTube has to explain on its help page, and StonkFun's "dividends to every holder" post needed a disclaimer the next day (x-gap analysis).
- Undisclosed paid promotion through the referral programme: the FTC requires the disclosure in the post itself (2023 guides) and the SEC fined an undisclosed $250,000 promotion (EthereumMax, 2022).
- Rule changes without notice (reward thresholds, minimums): StonkFun's silent per-round minimum and same-day threshold change produced 1,358 "rewards missing or late" messages (telegram-group-insights.md, sections 3 and 11); every change goes on `/announcements` ahead of time.
- Valuing burns and rewards at today's price: called a hedge by StonkFun's own followers (x-gap analysis); the Ledger values at the time and the cards copy the Ledger.
