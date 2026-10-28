# Competitor launchpads as design and feature references (issue #130)

Research agent 2 of 5, 2026-10-28.
Scope: StonkFun (local research only), pump.fun, uselaunch.fun (LAUNCH), Torchpad, PonsVault and the DEX Screener pair page, each read for its navbar, landing, footer, board, coin page, launch flow, trust signals, creator economics, visual language, and three things to take and three to reject.
Saved page text is under `/private/tmp/claude-501/-Volumes-Farhan-Work-Folder-Dev-AI-stonk-fun-solana/1048aa25-7a30-4a52-a8a9-84f3a6350332/scratchpad/research/launchpads/<site>/`.
Tool notes: Jina's balance ran out part way (402 InsufficientBalanceError on every call after about 40 reads), so the last pages came through Tavily's extract endpoint and Brave.
uselaunch.fun's root and most routes answer 404 (Vercel "DEPLOYMENT_NOT_FOUND") on 2026-10-28, even to a browser-agent curl, two days after it announced leaving StonkFun; its how page and burns page still extract, and the Wayback Machine holds the how page.
DEX Screener's live page sits behind a Cloudflare challenge; the Wayback copy of the STONK/SOL pair page rendered fully.
pump.fun/advanced now redirects to Padre's login page (pump.fun outsources its "Terminal" to Padre).

## What I read

- `https://web.archive.org/web/2026/https://uselaunch.fun/how` - LAUNCH's six-card how-it-works page (archived copy; the live route 404s).
- `https://uselaunch.fun/how`, `https://uselaunch.fun/`, `https://uselaunch.fun/burns` - through Tavily's extractor: the nav, the footer's look switcher, the burns page shell.
- `https://www.bitrue.com/blog/launch-vs-stonkfun` - Bitrue, 2026-10-27: LAUNCH's announced move to its own curves and 3% fee.
- `https://github.com/imDev2023/Stoker-Markets/issues/120` - the owner's walkthrough of uselaunch.fun at 1440 on 2026-10-25 (board, live launches, calls, burns, form, coin page).
- `https://pump.fun/`, `/explore`, `/create`, `/live`, `/holder-rewards`, `/leaderboard`, `/go`, `/coin/DUKEjsk...pump` - the live app on 2026-10-28.
- `https://pump.fun/docs/fees` (17 Oct 2026), `/docs/custom-pairs` (9 Oct 2026), `/docs/mayhem-mode` (12 Nov 2025) - pump.fun's own fee and pair rules.
- `https://blofin.com/en/academy/education/pumpfun/pump-fun-audit-tab-explained` - BloFin Academy, 2026-09: the coin page's audit thresholds.
- `https://smithii.io/en/pump-fun-creator-fees`, `https://airdropalert.com/blogs/pump-fun-holder-rewards`, `https://cryptoslate.com/decentralized-exchanges/pump-fun-review` - third-party accounts of the 2025-2026 changes.
- Tavily searches on pump.fun's livestreams, King of the Hill, May 2025 revenue sharing, PumpSwap, the mobile app and Project Ascend (results saved as `pumpfun/tavily-*.json`).
- `https://app.torchpad.fun/discover`, `https://app.torchpad.fun/`, the TORCH trade page, `https://torchpad.fun/` - Torch's app and marketing site.
- `https://docs.torchpad.fun/` plus `/terminal`, `/terminal/discover`, `/terminal/launch`, `/protocol/overview`, `/protocol/fees`, `/protocol/how-launches-work` - Torch's GitBook.
- `/Volumes/Farhan/Work Folder/Dev/AI/Research-Projects/resources/launchpads/pons/README.md` sections 2, 3.4, 4.4 and `pages/12` to `pages/20`, `pages/23` - the Pons knowledge base.
- `https://www.ponsvault.com/` - one fresh read of the landing on 2026-10-28.
- `https://web.archive.org/web/2026/https://dexscreener.com/solana/zxtpi4btawx3mgdapoezkmd1hxx8cdecfrqxmwvsclx` - the STONK/SOL pair page.
- `https://docs.dexscreener.com/` plus `/trending`, `/boosting`, `/metas`, `/token-listing` - DEX Screener's own docs.
- `https://solanacompass.com/projects/dex-screener`, `https://www.gate.com/learn/articles/what-is-dex-screener/4190` - descriptions of DEX Screener's feature set.
- `/Volumes/Farhan/Work Folder/Dev/AI/Stoker-Markets-research/research/website/` - StonkFun's saved pages and screenshots (home, launch, two coin pages, revenue, rewards, flywheel, connect-wallet, disclaimer).
- `.../research/social/x-gap-analysis.md` sections "Feature comparison", "Gaps, ranked", "Where we can do better" and `.../research/social/telegram-group-insights.md` section 11.

## 1. StonkFun (from the private research repo only; described, never quoted)

### Navbar: two filled buttons of equal weight
Finding: StonkFun's bar is the mark and wordmark, five text links (its token, Rewards, Flywheel, Revenue, API), a search field with a Ctrl K hint, two icon buttons for Telegram and X, then two filled teal buttons of the same size, one to launch and one to connect a wallet.
The active page gets a 2px underline under its link.
Source: `research/website/screenshots/home.png`, `token_6Gm...png` (private repo, captured 2026-09), evidence: practice
For Stoker: Header - keep one filled action ("Stoke a coin") and give the wallet a quieter outlined or ghost treatment, the opposite of StonkFun; keep the active-link underline, which we lack.
Audience: creators get the one obvious action; traders are not misled into thinking "connect" is the product.

### Hero: a bordered card with the pitch, one button and a live token card
Finding: The home hero is a card with a two-line headline, a one-sentence lede naming the asset classes, one filled button, a decorative dashed line chart, and a small live card for the platform token (ticker, "paired with" chip with the issuer tag, market cap, 24h change).
There are no stats, no counts and no social proof beyond that one card, and the board starts 80px below.
Source: `research/website/screenshots/home.png`, `pages/home.md` (private repo), evidence: practice
For Stoker: Landing Hero - our Hero already carries the slogan and two buttons; add one live object that proves the mechanism (a real coin's card with its pair and a live figure) rather than a static illustration.
Audience: traders want a live number; marketers want the pitch in one line; no conflict.

### Footer: a single centred row of links, nothing else
Finding: The footer is one centred row of eight text links (X, token, Revenue, API, Rewards, Flywheel, Terms, Privacy); the disclaimer sits above it as a small pill button on some pages.
Source: `research/website/screenshots/revenue.png`, `flywheel.png` (private repo), evidence: practice
For Stoker: Footer - a minimal row is fine for the terminal pages, but the landing deserves a fuller footer (what the platform is in one sentence, the sections, socials, the disclaimer), since the landing is where marketers and NFT projects land cold.
Audience: marketers and NFT projects (orientation); traders do not read footers.

### Board: a 3-column card grid with the pair as a watermark
Finding: The board is a 3-column card grid: avatar, ticker, name, market cap in 28px type, a "paired with" row (quote icon, ticker, issuer tag such as xStocks or Custom), 24h volume with a coloured change, a sparkline, and the quote asset's logo as a large faded watermark on the card's right; three tiny icon buttons top-right (rewards, flywheel, copy address).
Sorting is Market cap, Newest or 24h volume; filtering is one "Paired with" chip row by issuer category; pagination reads page 1 of 4,549.
Source: `research/website/screenshots/home.png`, `pages/home.md` (private repo), evidence: practice
For Stoker: Board `/coins` - keep rows (owner's layout pick) but copy the one good idea: make the pair visible at a glance with the quote asset's mark in each row, and keep the one "Paired with" control with issuer counts; add text search, which their users asked for and which theirs lacked at launch.
Audience: traders (scan speed); creators (seeing their pair category); no conflict.

### Coin page: four stat tiles, chart left, cards right, trade sent off-site
Finding: The coin page is a header card (avatar, name, a status pill such as "Near graduation" or "Just launched" or "Graduated", ticker, "paired with" chip with issuer tag, a copyable contract chip, outbound Jupiter and Solscan buttons), a strip of four tiles (market cap, price, 24h volume, FDV), a left column with a candlestick chart (1m to 1D, Price or Market cap toggle, an OHLC readout) and a top-100 holders table (rank, address, amount and % supply, USD value), and a right column of cards: a swap card that only links out to Jupiter, a flywheel membership card, a platform-burned card tinted orange, a platform-buybacks card, and a three-row address block (mint, pool, quote mint) with copy buttons.
Nothing on the page shows dev holdings, bundles, snipers, age beyond the pill, LP lock, or trades.
Source: `research/website/screenshots/token_6Gm...png`, `token_3Uc...png` (private repo), evidence: practice
For Stoker: Coin page `/coin/[mint]` - keep the trade panel on the page (never a link out), keep the status pill vocabulary and the address block, and add the trust figures StonkFun lacks (dev holdings, first-slot buyers, age, LP lock, holder count), which ADR 0013's coin-trust unit already started.
Audience: traders first; a KOL sharing a coin wants the figures visible in the share preview too.

### Launch flow: one long form with a sticky summary and three reassurance bullets
Finding: The launch form is one page in two columns: left, a "launch on" chip, a Standard/Reward segmented control with a None/1%/3% tax row and a short explanatory paragraph, a dev-buy slider 0 to 75% with a "% of supply / SOL amount" toggle, name and symbol with character limits, an image dropzone (PNG/JPEG/WebP, square, 2 MB), optional links, and a quote-token picker as category tabs with counts (xStocks 24, PreStocks 7, Tessera 2, Sunrise 79, Currencies 5, Leverage 3, Collectibles 2, Solana 3, Custom 394) over a card radio; right, a sticky "Launch summary" (launchpad, graduation target, supply, trading fee 1.25%, transfer tax, the creator's approximate share per trade, launch cost about 0.012 SOL with a "rent only" note), three icon bullets (liquidity locked, metadata on Arweave, a risk warning) and the filled connect button.
Source: `research/website/screenshots/launch.png`, `pages/launch.md` (private repo), evidence: practice
For Stoker: Launch `/launch` - our #117 summary matches this shape; what is missing is a live preview of the coin as it will appear on the board and the category counts on the Quote Asset chooser, both cheap.
Audience: creators; the counts also tell marketers how deep each category is.

### Trust signals: status pills, copy chips, an onboarding modal, a disclaimer page
Finding: Trust is carried by status pills, copyable addresses, explorer links, orange "burned" cards, a wallet modal that greets a new visitor with a wallet illustration and a "get started" path, and a separate disclaimer page saying the token confers no right to revenue.
Source: `research/website/screenshots/connect-wallet.png`, `stonk-disclaimer.png` (private repo), evidence: practice
For Stoker: Coin page and Header - the "new here" path in the wallet modal is worth copying for NFT projects and first-time creators; the disclaimer belongs as a page, not a paragraph in every footer.
Audience: NFT projects and influencers who arrive without a Solana wallet.

### Creator economics shown: one line on the form, nothing on the coin page
Finding: The creator's share appears once, as an approximate per-trade line in the launch summary and in the form's explanatory paragraph (forwarded automatically, nothing to claim); no coin page, board row or profile shows what a creator has earned.
The off-chain forward broke for about three weeks and cost creators their holders' trust.
Source: `research/website/pages/launch.md`; `research/social/telegram-group-insights.md` section 11 (private repo), evidence: practice
For Stoker: Coin page and `/creator` - show "Creator earned X so far, last payment N minutes ago, see the Ledger" on every coin page; it is our strongest difference and StonkFun does not show it anywhere.
Audience: creators (proof of income), KOLs (a reason to promote), traders (a dev paid by volume is less likely to dump).

### Visual language: dark navy with teal, 1px-bordered cards, no mascot
Finding: One dark scheme only (near-black navy background, slightly lighter cards with 1px borders at 8 to 12px radius), a teal primary, grey secondary text, a geometric sans at moderate density, no visible motion, an abstract swirl mark and no character.
Source: `research/website/screenshots/*.png` (private repo), evidence: practice
For Stoker: whole site - our Teal direction already sits close to this palette; the differentiators must be the heat ramp, the ring mark, the salamander, light mode and type, or the two sites read as siblings.
Audience: everyone; a site that looks like StonkFun's undermines "not a copy" for KOLs who know both.

### What the community said to copy or avoid
Finding: The Telegram analysis says to copy: leading with pairing, published quote criteria, a new-pair feed bot, frequent metrics posts, builders as first-class users; and to avoid: off-chain creator forwarding, a polling distributor, front-runnable distributor sells, mutable fee authorities, unvetted quote whitelisting, search that cannot find coins by their quote, and founder-as-support (1,243 team-directed questions against 433 replies).
Source: `research/social/telegram-group-insights.md` section 11; `x-gap-analysis.md` "Where we can do better" (private repo), evidence: research (a 2-month chat corpus and a 1,121-post timeline)
For Stoker: `/assets` and board search (find coins by pair), `/announcements` and a public status page (support load), `/revenue` linked from the header (metrics cadence).
Audience: traders and creators (support), marketers (metrics to post).

### Take and reject
Take: the one "Paired with" control with issuer categories and counts; the status pill vocabulary and the three-row address block; the launch summary with a rent-only cost line and three reassurance bullets.
Reject: two equal filled header buttons (a page has one primary action, Nielsen Norman's visual hierarchy rule); a trade box that leaves the site for Jupiter (the coin page's job is the trade); a 4,549-page card grid with no search (a board must be scannable and searchable, which is why pump.fun and DEX Screener use tables).

## 2. pump.fun (live app, 2026-10-28)

### Navbar: a left sidebar with one green Create and a top search
Finding: The desktop nav is a collapsible left sidebar: Home, Explore, Perps (tagged New), Leaderboard, Live; a "Discover" group of GO, Mayhem, Holder rewards (New), $PUMP; then Create (the one filled, green button), Support, Terminal (an outbound link to Padre), Get the app, and Panels; the top bar is a search ("Search for coins and users", ⌘K) and Sign in.
A ticker strip of top traders' weekly profit (@handle +$144,780) scrolls across the very top.
On phones the sidebar becomes a three-icon bottom bar (Home, Explore, GO) and an app-store banner.
Source: https://pump.fun/ (pump.fun, 2026), evidence: practice
For Stoker: Header - one filled action is right (we have it); the "New" tags on links are a cheap way to surface a feature such as Curated; a bottom tab bar under 768px would serve traders better than our full-height overlay.
Audience: traders (bottom bar); the profit ticker serves nobody but the top 20 and is the first thing to reject (see below).

### Landing: no hero, a consent modal, then a trending feed
Finding: There is no marketing landing; a first visit shows a modal with a 3D character scene, one sentence of pitch ("Pump lets anyone create coins, giving everyone equal access to buy and sell from the start."), a Continue button that also certifies age and terms, and then the home is "Feed": Trending (Coins / Stocks / Perps tabs, 1h to 24h) as a card row with price, market cap and % change and a HOT badge, a "Hot callouts" social column, and the leaderboard.
Source: https://pump.fun/ (pump.fun, 2026), evidence: practice
For Stoker: Landing - keep our spacious Hero; pump.fun can skip the pitch because everyone already knows it, and we cannot; but copy the idea that the first screen already contains live coins (our Trending), with a Stocks tab since tokenized stocks are our wedge.
Audience: marketers and NFT projects need the pitch; traders need the feed; the landing must give both above the fold.

### Board: a table with Movers, New, Custom pairs and Charities tabs
Finding: Explore is a table (Grid optional) with tabs Movers, New, Custom pairs, Charities, Market cap, Oldest, Last trade, More; a Quick buy control; and columns Coin, Graph (sparkline), Mcap, ATH, Age, Trades, 24h Vol, Traders, 1h, 6h, 24h; 60 rows a page; a "Charity" tag sits inline after the ticker.
Source: https://pump.fun/explore (pump.fun, 2026), evidence: practice
For Stoker: Board `/coins` - add ATH, Age, Trades and Traders as columns and three change windows (1h/6h/24h), and give "Paired with a stock" and "Reward Launches" their own tabs the way Custom pairs and Charities have theirs.
Audience: traders (the columns are what they scan); creators (a tab that groups their launch type).

### Coin page: header chips carry dev %, launchpad and reward recipient
Finding: The coin header shows the name, a tag (Charity), age ("2h"), the truncated address, links (X, Solscan, an X search), a "Dev 0.0%" chip, "Chain and launchpad: Pump" and "Creator rewards recipient: Rewards to creator"; then four tiles (Market cap, 24h vol, Holders, ATH).
Source: https://pump.fun/coin/DUKEjskPBoszW4xEowcSWptekuUZpwLFv6nTt5Cmpump (pump.fun, 2026), evidence: practice
For Stoker: Coin page header - add "Dev holds N%", "Launched on Stoker", "Earnings to: creator wallet / holders / buyback" (the #113 destination) and the age as chips under the name, beside our "Paired with" chip.
Audience: traders (dev % and age are the first two things a sniper-wary trader checks); creators (a visible destination is a promise kept).

### Coin page: an Audit tab with published thresholds
Finding: Beside Stats the coin page has an Audit tab scoring holder concentration, creator holdings, snipers and bundlers; each row's tooltip states the cutoff: top-ten holders turn red over 20%, developer holdings red over 20% and healthy under 5%, snipers and bundlers each red over 10%.
BloFin's analysis is that a red reading is reliable and a green one is weak, since bundlers can sit at 9% by design.
Source: https://blofin.com/en/academy/education/pumpfun/pump-fun-audit-tab-explained (BloFin Academy, 2026), evidence: opinion citing the pump.fun coin page tooltips (practice)
For Stoker: Coin page trust block (ADR 0013) - publish our thresholds in the tooltip the same way, show the figures (not only a colour), and word a green state as "no flag found", never "safe".
Audience: traders; honest wording also protects the platform's trust with KOLs who get blamed for calls.

### Coin page: stats by window, a bubble map, pool information and a paired-tokens tab
Finding: The Stats tab has 5m/1h/24h windows with price change, volume, buys and sells counts, buy and sell volume, buyers and sellers, a "View bubble map" link; "Pool information" lists Paired with, total liquidity (USD and SOL), the creator's handle, MC and ATH; the tabs are Holders (count) / Callouts / Trades / About / Paired tokens, the holders table has Held, % supply, Position, Profit, Avg entry MC and Bought with filters All / Pump.fun / Top traders / In profit / At a loss, and a line says "56 coins launched with HOUSECOIN as their pair".
Source: https://pump.fun/coin/DUKEjskPBoszW4xEowcSWptekuUZpwLFv6nTt5Cmpump (pump.fun, 2026), evidence: practice
For Stoker: Coin page - the buyers/sellers split per window and the holders' profit and average entry are the figures traders now expect; the "coins paired with this one" line is our `/assets/[mint]` page surfaced on the coin page.
Audience: traders; a holders-in-profit view helps a creator see who is underwater.

### Coin page: a Creator rewards card with an unclaimed amount and a Donate button
Finding: The right column has a "Creator rewards" card ($60.74, "Unclaimed 0.5921 SOL", a Donate rewards button), a "Coin timeline", a charity block (120 SOL donated, a 100% share, a View link) and an "Admin permissions revoked" line; the trade box offers Buy/Sell, USD or token, 25/50/100% and $25/$100/$250 presets, and "Connect wallet to trade".
Source: https://pump.fun/coin/DUKEjskPBoszW4xEowcSWptekuUZpwLFv6nTt5Cmpump (pump.fun, 2026), evidence: practice
For Stoker: Coin page - a "Creator earnings" card (paid so far, last forward, destination) is the counterpart of their unclaimed card, and ours needs no claim; the USD presets on the trade panel are worth copying for phone traders.
Audience: creators and traders; no conflict.

### Launch flow: one page, permanence warning first, a live preview
Finding: Create is one page headed "Coin details" with the warning that these cannot be changed, then name, ticker, description, social links, "Pool liquidity pair" (SOL / USDC / Custom), "Share creator rewards" (wallets or charities, set from the coin page after launch), "Send creator rewards to: Creator / Holders", a Mayhem mode checkbox, an image or video dropzone (image 15 MB, video 30 MB, min 1000x1000, 16:9 or 9:16 at 1080p), an optional banner, a "Login to create coin" button, and a right-hand Preview of the coin card.
Creating is free of platform fees; graduation costs 0.015 SOL.
Source: https://pump.fun/create and https://pump.fun/docs/fees (pump.fun, 2026), evidence: practice
For Stoker: Launch `/launch` - put the "cannot be changed" line at the top of the identity fields, add the live preview card above our summary, and consider a banner image and a short video as optional media (the share preview unit, #83, can use them).
Audience: creators; a video upload serves influencers and streamers.

### Fees: layered and only fully visible on the fees page
Finding: A curve trade pays 1.25% (0.30% creator, 0.95% protocol); after graduation the creator's cut jumps to 0.95% at 420 SOL market cap and steps down to 0.05% above 98,240 SOL; a Custom Pair coin (any asset other than SOL or USDC) pays a flat 0.30% creator on the curve and 0.05% after; a Holder Rewards coin replaces the creator fee with a flat holder rate of 0.01% to 3%; and since 2026-10-17 the web and mobile apps add a 0.45% Platform Fee (0.40% with a referral code) "shown as a separate line before you confirm a trade".
Source: https://pump.fun/docs/fees (pump.fun, 17 Oct 2026), evidence: practice
For Stoker: Launch summary and trade panel - keep our one figure (1% on the curve, 1.25% after, the creator's 0.5%) and keep showing it on the panel before the trade; pump.fun's stacking of four fee kinds is the thing to beat with one sentence.
Audience: traders (a fee seen before confirm) and creators (one clear share); the comparison favours us as long as we say it plainly.

### Custom Pairs: 93 assets, fees paid in the quote, one-hop coin pairs
Finding: Since 2026-09-12 pump.fun lets a coin be paired with any of a published list of Supported Pair Assets (SOL, USDC, 24 xStocks, Sunrise's Backpack stocks and crypto majors, 93 in total) and with another pump.fun coin one hop away; fees, creator rewards and holder rewards are paid in the paired asset, never in the coin; the list says "listing is not endorsement" and can change without notice; Apple delisted the app a day after stock pairs went live.
Source: https://pump.fun/docs/custom-pairs (pump.fun, 9 Oct 2026); https://airdropalert.com/blogs/pump-fun-holder-rewards (AirdropAlert, 2026); https://protos.com/one-day-after-launching-stock-pairs-apple-delists-pump-fun-app (Protos, 2026), evidence: practice (the docs) and opinion (the articles)
For Stoker: Hero and `/assets` - "paired with anything" is no longer a wedge on its own; our difference is open (about 600 assets with no listing committee), labelled (Quote Risk Labels) and accountable (the public Ledger), so the hero's lede should carry those three words, not the count.
Audience: creators choosing a platform; marketers writing the pitch.

### Holder rewards page: a league table with totals
Finding: The Holder rewards page opens with one sentence, a filled "Launch a holder rewards coin" button, three totals (Holder rewards $28.6M, at today's prices $25.4M, wallets rewarded 615,082), a "Top paying coins" top five, and a table (Token, Holder rewards, Market cap, Holders paid) with a "Paired with: Any quote" filter and 6,504 pages.
Source: https://pump.fun/holder-rewards (pump.fun, 2026), evidence: practice
For Stoker: Rewards `/rewards` - adopt the league shape: totals, top paying Reward Launches, a table filterable by Quote Asset, and the launch button in the header of the page.
Audience: traders hunting yield; creators who want their coin in the top five.

### Social layer: callouts, squads, leaderboards, bounties, livestreams
Finding: A callout is a public call on a coin the caller holds, stamped with position and profit and pushed to followers; squads group traders; the leaderboard ranks traders, earners and squads by profit over 1D/1W/1M; GO is a bounty board (57 live, $15K unclaimed, $1M paid) where coins pay for callouts; Live lists streams with viewer counts and market cap; livestreams launched in 2024, were suspended in November 2024 after harmful stunts, and returned in April 2025 with moderation.
Source: https://pump.fun/leaderboard, https://pump.fun/go, https://pump.fun/live (pump.fun, 2026); https://en.wikipedia.org/wiki/Pump.fun (Wikipedia, 2026), evidence: practice and opinion
For Stoker: a future social unit - the accountable part (a call stamped with market cap and holding, as uselaunch also does) fits our Ledger ethos; streams and bounties do not fit a two-person team and carry the moderation cost pump.fun paid for.
Audience: KOLs and tweeters (calls give them a stage); conflicts with trust if calls are not stamped and held to account.

### Product history 2024-2026 in one paragraph
Finding: King of the Hill (Feb 2024, a coin reaching about $30K market cap took the top slot) has given way to Trending and a Movers feed; PumpSwap replaced Raydium as the graduation venue in March 2025; creator revenue sharing began 2025-05-13 at 0.05% (50% of PumpSwap revenue); the mobile app shipped Feb 2025 and 2.0 in June 2025 (price alerts, one-click trading, Movers); Project Ascend (Sept 2025) brought dynamic creator fees of 0.05% to 0.95% by market cap and $2.1M to creators in 24 hours; Mayhem Mode (Nov 2025) lets an AI agent trade a new coin for 24 hours with a doubled supply; Holder Rewards and Custom Pairs landed 2026-09-12 with a $370M PUMP burn; a 0.45% app Platform Fee followed on 2026-10-17.
Source: https://x.com/Pumpfun/status/1760103287397793933 (pump.fun, 2024); https://www.coindesk.com/markets/2025/05/13/pumpfun-launches-revenue-sharing-for-coin-creators-in-push-to-incentivize-long-term-activity (CoinDesk, 2025); https://decrypt.co/337872/pump-funs-new-fee-model-hands-out-2m-to-creators-in-first-24-hours (Decrypt, 2025); https://pump.fun/docs/mayhem-mode (pump.fun, 2025); https://coinmarketcap.com/cmc-ai/pump-fun/latest-updates (CoinMarketCap, 2026), evidence: opinion (news) and practice (docs)
For Stoker: positioning - the market's reference launchpad now pays creators by market-cap tier, pays holders in the quote asset and pairs with stocks; our copy must stop implying any of these is unique and lean on open, labelled, accountable and on-chain.
Audience: creators comparing platforms.

### Visual language: green brand, dark dense UI, a 3D mascot, mobile first
Finding: One filled green button, a dark dense interface, a 3D smiling green character in the welcome scene, HOT and LIVE badges, emoji-heavy social text, app banners and a bottom tab bar; the advanced terminal is outsourced to Padre under a different brand.
Source: https://pump.fun/ and https://pump.fun/advanced (pump.fun, 2026), evidence: practice
For Stoker: whole site - a character in the welcome and empty states is now normal on launchpads (the salamander has a job here); do not split the terminal into a second brand.
Audience: everyone; the mascot serves tweeters and sticker culture.

### Take and reject
Take: the Audit tab with published thresholds and the Dev % chip; the Explore table's columns and the Custom pairs / Charities tabs plus the Holder rewards league page; the create page's permanence warning and live preview and the coin page's creator rewards card with a destination line.
Reject: the top-of-page profit ticker and leaderboard-first home (survivorship bias as marketing conflicts with any trust claim, and NN/g lists attention-grabbing motion at the page top as a top annoyance); Mayhem Mode's supply-doubling agent and the stacked, late-shown Platform Fee (a fee that appears only at confirm is a dark pattern by Brignull's definition); no landing pitch at all (our audiences include people who do not yet know the mechanism).

## 3. uselaunch.fun (LAUNCH)

### Status: a satellite that just left its host
Finding: LAUNCH launched coins on StonkFun's own PlatformConfig from one custodial master wallet, spent the forwarded creator share buying each coin back and burning it, and announced on 2026-10-26 a move to its own bonding curves with a 3% fee (1% LAUNCH buyback and burn, 1% the coin, 1% platform); on 2026-10-28 its root and launch routes answer 404 while the how and burns pages still serve.
Source: https://www.bitrue.com/blog/launch-vs-stonkfun (Bitrue, 2026-10-27); https://uselaunch.fun/how via Tavily extract (LAUNCH, 2026), evidence: opinion (Bitrue) and practice (the page)
For Stoker: positioning - a site that vanishes two days after a pivot is the argument for our no-custody model; say "your coin is yours, on-chain, whatever happens to us" on the launch page.
Audience: creators; also KOLs, who lose face when a platform they called disappears.

### Navbar: lowercase links, one repeated create action, a look switcher in the footer
Finding: The bar is the mark and a lowercase wordmark, then board, live launches, calls, burns, create coin, how it works, a second "create coin" as the filled action, and an outbound stonkfun.xyz link; the footer repeats the links, carries a one-line disclaimer and a public look switcher (old, a, b, c).
Source: https://uselaunch.fun/ via Tavily extract (LAUNCH, 2026), evidence: practice
For Stoker: Header - a nav of five product sections plus one filled action is the right count (ours has six plus Developers); never ship a look switcher to production (we tested looks behind `?theme=` and `?header=`, which is the right place).
Audience: traders (short nav); a visible A/B switcher confuses everyone else.

### How page: six numbered cards, one claim each, one diagram each
Finding: The how page is six cards numbered 01 to 06, each a three-word headline and one paragraph (one master wallet, you pick the pair, no vamps, no block 0, fees buy it back then burn it, the fine print) with a small diagram beside it (a pair bar, folded tickers marked "taken", five blocks with the create in block 0, a fee flow arrow), then a single call to action.
Source: https://web.archive.org/web/2026/https://uselaunch.fun/how (LAUNCH, 2026), evidence: practice
For Stoker: a `/how` page (new) - one promise per card with its diagram and a link to its proof: you pick the pair, the creator is paid on-chain, Copy Protection, Reward Launches, the Burn, the Ledger; our hero's lede cannot carry all of that.
Audience: marketers and creators (the pitch), NFT projects (how a pair works); traders skip it.

### Copy Protection shown live on the form and on the coin page
Finding: Before signing, the ticker must be new with case, spaces, lookalike letters and leetspeak folded together, a name cannot be a copy with "official" or a "2" added, a picture cannot be a resized or recoloured copy, and one X account owns one coin; the owner saw the four checks ticking live as the creator types, and the coin page shows them as ticks.
Source: https://web.archive.org/web/2026/https://uselaunch.fun/how (LAUNCH, 2026); https://github.com/imDev2023/Stoker-Markets/issues/120 (owner, 2026-10-25), evidence: practice
For Stoker: Launch form and coin page - we built the check (ADR 0012); show it: a card on the form whose rows settle as the creator types, and a "protected until <date>" line on the coin page.
Audience: creators (reassurance) and traders (a copy is labelled).

### Buyback receipts and calls stamped with market cap
Finding: The burns page says every fee a coin earns buys it back and burns it, and lists the receipts newest first, each a transaction to open; calls can only be posted by a holder, are stamped with the market cap at the time and tracked since, and a top-callers board runs over seven days.
Source: https://uselaunch.fun/burns via Tavily extract (LAUNCH, 2026); issue #120 (owner, 2026-10-25), evidence: practice
For Stoker: `/burns` and `/revenue` - every row a transaction, as ours already are; a future calls feature must stamp the market cap and the caller's holding, or it is just a shill wall.
Audience: traders and KOLs; the stamp protects both.

### Board extras and live event pills
Finding: The board adds a NEW badge for the first minutes, the all-time high under the market cap, a sparkline, the first line of the description and a "most burned" sort; the header band shows two live event pills (a burn and a launch seconds ago); figures carry "updating live" and "refreshes every 5 s" notes.
Source: https://github.com/imDev2023/Stoker-Markets/issues/120 (owner, 2026-10-25), evidence: practice
For Stoker: Board and Landing - a NEW chip, ATH and a sparkline per row; live event pills belong in the landing's Hero, not the header (the owner removed the static status line for this reason).
Audience: traders.

### Visual language: lowercase headlines with a full stop, a 3D arrow mascot everywhere
Finding: Headlines are lowercase sentences ending in a full stop, a 3D arrow character appears in poses (wave, swoop, hero) on every page, and the brand mark is reused as a decoration inside cards.
Source: https://uselaunch.fun/burns via Tavily extract (LAUNCH, 2026); issue #120, evidence: practice
For Stoker: brand - the salamander can take the same jobs (empty states, the burns page, the how page) but one pose per page, not one per card.
Audience: tweeters and sticker culture; too much mascot reads as a toy to traders.

### Take and reject
Take: the numbered how page; the live Copy Protection card and coin-page ticks; receipts and calls stamped with market cap.
Reject: a custodial master wallet and free launches (custody, against ADR 0003 and 0004, and the site's own disappearance shows the risk); a production look switcher (experiments belong behind flags); the lowercase-full-stop voice and per-card mascot (their brand tics, and ours is the ring and the salamander).

## 4. Torchpad (Torch)

### Navbar: six sections, a search with "/", a chain selector, Deposit and Sign in
Finding: The app bar is "torch Beta", Discover, Trade, Alpha, Launch, Portfolio, Analytics, a Tools menu, "Search tokens" with the "/" shortcut, an "All chains" selector, Deposit and Sign in; on phones a bottom tab bar holds Discover, Trade, Portfolio, Alpha and Profile; the Terminal is a progressive web app with an offline page.
Source: https://app.torchpad.fun/discover and https://docs.torchpad.fun/terminal (Torch, 2026), evidence: practice
For Stoker: Header - the "/" shortcut to search and a bottom tab bar under 768px (Explore, Assets, Stoke, Rewards, Account) are worth taking; the chain selector and Deposit are custody features we do not have.
Audience: traders.

### Landing (Discover): "Live 5s", a featured trending card, a progress board
Finding: Discover opens with a "Live 5s" refresh badge, one line of pitch with "How it works" and "Launch a coin", a featured "#2 trending" card (ticker, +108%, 2d old, market cap, 24h volume, Trade, "Graduated 100%"), "The board by progress" (six coins with market caps), tabs Market cap / New / Trending / Graduated / Watching, Filters, and rows reading ticker, 24h change, status, name, market cap, creator handle, age, pair, Burned %, Liq and Vol, with "Show 24 more".
A side panel streams "Trades and calls, live" as anonymous rows (Anon#5180 Sell just now, $47.72 at $2,576 MC).
Source: https://app.torchpad.fun/discover (Torch, 2026), evidence: practice
For Stoker: Board `/coins` - say how live the board is ("live, 5 s") next to the sort, add a "Graduating" tab and the creator's handle and age to each row; the "board by progress" is our curve progress as a sorted strip.
Audience: traders; the anonymous feed is noise for everyone else.

### Discover feeds and honest failure states
Finding: The feeds are Top, Trending, New, Graduating, Surge and Watching; if an upstream fails the Terminal shows "Listeners disconnected" rather than stale rows, and if favourites fail it says "Favorites unavailable" while trading keeps working; each row has a Quick Buy with a preset amount.
Source: https://docs.torchpad.fun/terminal/discover (Torch, 2026), evidence: practice
For Stoker: Board and coin page - name the failure state ("prices paused, reconnecting") instead of freezing a figure; a Quick Buy per row with a preset is the fast path traders expect from terminals.
Audience: traders; a stale figure is the one thing that makes a trader distrust a site.

### Coin page: price, MCap, Liq, Vol, Burned in the header; Calls and Launch details tabs
Finding: The trade page header shows the name, chain and pair, the price with 24h change, MCap, Liq, Vol 24h and "Burned $382.8K · 3.8%"; tabs are Chart, Calls, Token info and Info; a Live row offers Trades, Positions, Orders, Holders and Calls; "Your position" sits by the ticket; Token info holds Launch details (creator, preset, tax, split, everything paid out so far: creator fees, tax collected, burned, paid to holders).
Source: https://app.torchpad.fun/trade/robinhood/0x000050E18ffa3F8F7aD170Eb9CeF160eb3Ed1111 and https://docs.torchpad.fun/terminal/launch (Torch, 2026), evidence: practice
For Stoker: Coin page - a "Launch details" block (launch type, Reward Tax, earnings destination, paid out so far to the creator, to holders, burned) is the on-page version of our Ledger and belongs under the pair cards.
Audience: creators (proof), traders (the split before they buy).

### Launch flow: three steps with presets, a review step, and permanence
Finding: Quick launch has three steps: Basics (preset Degen, Launch or Steady sets the starting market cap at 1, 2.5 or 5 ETH; name, ticker, description, square image up to 4 MB, socials; pair ETH by default or $TORCH, USDG or a Robinhood stock token), Fees (buy tax 1 to 10%, 2% default, fixed forever; 70% of it to the creator, buyback-and-burn or holders; anti-snipe on), and Review (the launch fee 0.00015 ETH, the address ending in 1111, an optional dev buy "at the starting price and without the buy tax" that shows the supply share and the resulting market cap).
Nothing can be edited after launch and the docs say so twice.
Source: https://docs.torchpad.fun/terminal/launch (Torch, 2026), evidence: practice
For Stoker: Launch `/launch` - split the form into three steps on phones (identity, economics, review) with the review step showing the First Buy's share of supply and the resulting market cap; presets are not for us (LaunchLab's curve rules fix the shape) but a plain "what you get for X" line is.
Audience: creators.

### Trust: an address suffix, locked liquidity, a timelock, a four-bullet consent
Finding: Every Torch launch's address ends in 1111 so a genuine launch is recognisable; liquidity is held by a contract with no withdraw function; fee changes go through a 48-hour public timelock; the token has no owner, mint, pause or blacklist; a "Before you trade" modal has four plain bullets (your keys, tokens can go to zero and anyone can launch any name so check the address, launches are permanent, not for everyone) and one checkbox.
Source: https://docs.torchpad.fun/protocol/how-launches-work and https://app.torchpad.fun/discover (Torch, 2026), evidence: practice
For Stoker: Disclaimer gate and `/announcements` - four bullets in plain words beat our long disclaimer; our fee-change notice (#22) is the same promise as their timelock and should be stated on the fees line; a `Stoke` prefix on every coin (#73) is their 1111 suffix.
Audience: traders (the gate), creators (the address mark), KOLs (an authenticity check they can tell followers).

### Fees shown first, estimates labelled, unknowns said
Finding: Torch's protocol principles are five lines: fees are flat and shown first, same account everywhere, honest numbers ("if something is unknown it says so; estimates are labelled"), same screens on every chain, launches cannot be rugged; the fee table has a "where you see it" column for every fee.
Source: https://docs.torchpad.fun/protocol/overview and https://docs.torchpad.fun/protocol/fees (Torch, 2026), evidence: practice
For Stoker: `/api` reference and the launch summary - add a "where you see it" column to our fee table, and label every estimate ("about 0.5%", "at today's price") the way we already do in the summary's note.
Audience: traders and creators; marketers get quotable principles.

### Creator economics: 70/30 shown as a bar, claim as ETH or as your own coin, 60-day sweep
Finding: The marketing site shows the split as a two-colour bar (creator 70%, protocol 30%) and the three destinations (you, buyback-and-burn, holders); creators claim as ETH or as their own token from Profile, can hand the creator role to another wallet which must accept it, and unclaimed fees after 60 days buy and burn TORCH.
Source: https://torchpad.fun/ and https://docs.torchpad.fun/protocol/how-launches-work (Torch, 2026), evidence: practice
For Stoker: Launch summary "You earn" and `/creator` - draw the split as a bar (platform 1%, half forwarded to you) and show the destination choice (#113) the same way; "nothing to claim" is our edge over their claim flow and should sit next to the bar.
Audience: creators.

### Visual language: lowercase terminal voice, dense, dark, a "Beta" tag, a flywheel diagram
Finding: The marketing site speaks in lowercase ("one balance. multi-chain."), numbers its sections 01 to 09, draws the fee loop as four steps (trades, rewards, burns, deflationary), and the app is a dense dark terminal with a Beta tag.
Source: https://torchpad.fun/ (Torch, 2026), evidence: practice
For Stoker: `/burns` and `/revenue` - a four-step loop diagram of our Burn (fees, Ledger, buy, burn) would explain the Burn better than the tiles; the lowercase voice is theirs.
Audience: marketers (a diagram to repost), traders (where the fee goes).

### Take and reject
Take: "fees shown first, estimates labelled, unknowns said" as a written principle; the three-step launch with a review that shows the First Buy's share and resulting market cap; the four-bullet consent gate and the Launch details block on the coin page.
Reject: custodial Turnkey wallets with a password (against ADR 0003); a 1 to 10% buy tax with an 80% anti-snipe tax (the owner ruled out any anti-sniper tax on 2026-10-26); the anonymous live trade feed in a side panel (unverifiable rows that crowd the board, against the "honest numbers" principle they state).

## 5. PonsVault (Robinhood Chain)

### Navbar: Home, Menu, eight links and Connect
Finding: The bar is Home, a Menu toggle, then Explore, Stats, Seats, Launch, Claim, Tip, Docs and X, and a Connect button; Seats (an NFT seat product) and Tip sit beside Launch at equal weight.
Source: https://www.ponsvault.com/ (PonsVault, 2026-10-28), evidence: practice
For Stoker: Header - a reminder that a second product (Curated, the API) should not sit at the same weight as the core; six links is our ceiling and Developers could move to the footer.
Audience: everyone; a long nav slows traders most.

### Hero: an eyebrow, one mechanism sentence, two buttons, a pair marquee, a live top five
Finding: The landing opens with an eyebrow ("Live on pons v2 Robinhood Chain"), a headline that names the product and its idea, one sentence of mechanism (creator fees land in the pairing asset and the contract spends them on buybacks, staking or a stock dividend without an operator), two buttons (Start a launch, Read the docs), a "Partner desks" line, a marquee of pairable tickers (ETH AAPL NVDA TSLA GOOGL GME SPY ... USDG), then "The biggest vaults right now" as a ranked list of five with image, ticker, name and market cap, then "Three steps. One signature." with three numbered cards, the templates with Live/Soon tags, and a closing call to action.
Source: https://www.ponsvault.com/ (PonsVault, 2026-10-28), evidence: practice
For Stoker: Landing - this is the closest fit to our Hero + Stats + Trending: add a marquee of Quote Asset tickers under the lede (we have 600) and make Trending a ranked top five with market caps; the three numbered steps answer "how" for marketers.
Audience: marketers and creators (mechanism in one sentence), traders (the top five).

### Footer: a one-line identity, three link groups, an ecosystem column
Finding: The footer carries the product name, one sentence of what it is and whom it is independent of, a Product column (Launch, Explore, Docs, Stats, Vault Seats), a brand column (X, GitHub) and an Ecosystem column (pons docs, Robinhood Chain).
Source: https://www.ponsvault.com/ (PonsVault, 2026-10-28), evidence: practice
For Stoker: Footer - add the one-sentence identity ("A Solana launchpad on Raydium LaunchLab where you pick the pair") and an Ecosystem column (Raydium, Jupiter, xStocks, the explorer) so partners get a link and newcomers get the context.
Audience: NFT projects and marketers (orientation), developers (GitHub).

### Explore: cards that show the vault's live state, uncurated
Finding: Explore sorts by Newest or Highest market cap, counts launches, and shows cards with name, ticker, a status word (Climbing, Graduated), the description's first line, the vault template and its live line ("No dividend paid yet", "0.52 GME paid out · more on the way", "293.4M staked · 29.34%"), price, market cap, Graduation %, Tax and a View token button; test launches (five GoPro Inc coins at $4.06K) fill the first page.
Source: `pages/13-ponsvault-explore.md` (Pons KB, captured 2026-09-02), evidence: practice
For Stoker: Board - a per-row "live state" line for Reward Launches ("paid 0.4 SOL to 112 holders, next round at ...") is good; a board that shows every empty test coin is not, so sort empty coins below any coin with a trade.
Audience: traders (state at a glance); marketers (a board full of dead coins kills the pitch).

### Stats page: "read from the chain, not an index", with a timestamp
Finding: The stats page says its figures are read live from the chain, not from an index, shows Stakers, Staked, Burned, Paid to holders and Volume, then Launches, Vault runs, Fees to vaults and Vaults burning, a per-template count, and a footer line "Read live from 119 vaults · ETH $2,414.34 · updated 3:50:47 AM".
Source: `pages/14-ponsvault-stats.md` (Pons KB, 2026-09-02), evidence: practice
For Stoker: Stats `/revenue` and the landing's Stats - state the source and the time of every figure ("from the Ledger, updated 14:02"); the "what it has done" framing (launches, rounds paid, burns executed) is more persuasive than totals alone.
Audience: marketers (quotable), traders (verifiable).

### Coin page: an immutable configuration table and a "queued for the next run" state
Finding: The token page shows Graduated, ticker, price, market cap, FDV, then a vault panel: template and state ("Idle"), burned so far (93,146,693 VAULT, 9.315% of supply, 102 runs, "Verify it at the burn address"), a three-step explanation, a paragraph saying the fees cannot be claimed by anyone, a "Configuration · Immutable" table (burn share, treasury, runs each time 0.025 WETH accrues, contract, lifetime runs, burned, supply removed, treasury paid, last run), "Queued for the next burn" with a "Below minimum" state, and a Pool fees section that separates the gross from the vault's 70% share.
Source: `pages/23-ponsvault-token-vault.md` (Pons KB, 2026-09-02), evidence: practice
For Stoker: Coin page - our Reward Launch and Burn cards should show the same three things: the rule (immutable), the state (what is queued and why it has not run), and the receipt (verify on the explorer); "owed to the creator, below the forward minimum" is our "below minimum".
Audience: traders and creators; nothing beats a visible queue for trust.

### Launch flow: the summary changes with the vault choice; initial buy in the same call
Finding: The form has name (32 characters), ticker (10), description, an image with an IPFS public-upload consent, X/Telegram/Website, a Pairing asset select listing stocks with their issuer ("AAPL - Apple • Robinhood Token"), an optional trading tax 0 to 10% fixed at launch, a Vault choice (Staking, RWA Dividend, Fee Share) with per-template fields (minimum fees before a payout, floor 0.1 ETH; the stock the fees buy), an Initial buy "in the launch transaction so nothing can trade in front of it", a 0.0005 ETH fee, and a right-hand "Your token" summary whose "Creator fees" line changes with the choice ("Paid to stakers in ETH", "Buy AAPL for holders").
Source: `pages/19-ponsvault-launch-live-staking.md`, `pages/20-ponsvault-launch-live-rwa.md` (Pons KB, 2026-09-02); README 3.4, evidence: practice
For Stoker: Launch summary - make the "You earn" line restate the #113 destination in words ("forwarded to your wallet in NVDAx", "buys and burns your coin"), and name the issuer in the Quote Asset chooser's rows; the First Buy's "nothing trades in front of it" sentence is the one reassurance every creator wants.
Audience: creators.

### Creator economics: 70/30, redirected to a contract, nothing to claim
Finding: pons pays the creator 70% of the pool's fee and the protocol 30%; PonsVault points that 70% at a vault contract instead of a wallet, so the coin page says there is nothing to withdraw, and the stats page totals what vaults have paid holders ($513K across 46 vaults) and burned ($625K).
Source: README sections 3.4 and 4.4 (Pons KB); `pages/23` (Pons KB), evidence: practice
For Stoker: `/creator` and the coin page - our Creator Forward is the wallet case and #113's holder dividend and buyback are the vault cases; show all three with the same panel so the choice reads as one feature.
Audience: creators (the choice), traders (what the fees do).

### Visual language: numbered steps, Live/Soon tags, a marquee, no mascot
Finding: A clean marketing page with numbered 01/02/03 steps, template cards tagged Live or Soon, a ticker marquee, sentence-case headlines and no character; the app pages are plain cards and tables.
Source: https://www.ponsvault.com/ (PonsVault, 2026-10-28), evidence: practice
For Stoker: Landing - the Live/Soon tag on feature cards is how to show Curated (#118) and Airdrop Mode (#49) honestly before they exist.
Audience: marketers (a roadmap in the UI), creators.

### Take and reject
Take: the hero's mechanism sentence plus pair marquee plus live top five; the stats page's source-and-timestamp line and "what it has done" counts; the coin page's immutable configuration, queued-run state and gross-versus-share table.
Reject: a ten-item nav where a side product equals the core (one primary path per bar); an uncurated board where test coins fill page one (a board must rank by signal, not by recency alone); the IPFS consent checkbox before an image can be chosen (friction on the creator's critical path that a sentence under the dropzone would cover).

## 6. DEX Screener pair page (what traders expect from a coin page)

### Layout: a left rail of tools, then a pair header with rank, chain and DEX badges
Finding: The left rail is Explore, Search ("/"), Get the App, Watchlist, Alerts, Multicharts, New Pairs, Gainers & Losers, API, Advertise, then a list of about 60 chains; the pair header has a banner image, the token icon and name, the pair (STONK/SOL), the trending rank (#16), chain and DEX badges (Solana, Meteora, DLMM) and Website / Twitter / Telegram links.
Source: https://web.archive.org/web/2026/https://dexscreener.com/solana/zxtpi4btawx3mgdapoezkmd1hxx8cdecfrqxmwvsclx (DEX Screener, 2026), evidence: practice
For Stoker: Coin page header - show the venue (curve or Raydium CPMM) and the Quote Asset as badges the way DEX Screener shows chain and DEX, and keep the socials as icon links in the header row.
Audience: traders.

### The stat block every trader expects
Finding: Under the header: Price USD, Price in the quote (0.001167 SOL), Liquidity, FDV, Mkt Cap; then four windows (5M, 1H, 6H, 24H) each with its % change, and for the chosen window Txns, Volume, Traders, Buys and Sells counts, Buy Vol and Sell Vol, Buyers and Sellers, drawn as split bars; then Watchlist and Alerts, Buy and Sell.
Source: the same archived pair page (DEX Screener, 2026), evidence: practice
For Stoker: Coin page - the price in the Quote Asset beside USD is our native case ("priced in NVDAx"); add the four windows with buy/sell split bars; keep the trade buttons inside this block, not below the chart.
Audience: traders; the quote-priced figure is also the creator's story.

### Pair facts: age, pooled amounts, addresses with explorer links, other pairs
Finding: Below the stats: "Pair created 2mo 3d ago", Pooled STONK and Pooled SOL with USD values, the pair, token and quote addresses each with an EXP link to Solscan, "Search on Twitter", "Other pairs", then Audit ("No issues", with a warning that audits may not be 100% accurate), a Boost count and a "Claim your Token Profile" CTA, and the token profile (description, Metas such as "Stonks").
Source: the same archived pair page; https://docs.dexscreener.com/token-listing (DEX Screener, 2026), evidence: practice
For Stoker: Coin page pair cards - "Launched 2mo 3d ago", the curve's reserves or the pool's two sides with USD values, the three addresses with explorer links, "other coins paired with this asset"; word our labels with the same caution line.
Audience: traders; the "other pairs" link feeds `/assets/[mint]`.

### Tabs under the chart: Txns, Top Traders, KOLs, Holders, Maps
Finding: The chart has a USD/SOL toggle and the table below has tabs Txns, Transactions, Top Traders, KOLs, Holders (106,641) and Maps, with a Compact Table option; on phones the page offers Info, Chart+Txns, Chart and Txns layouts.
Source: the same archived pair page (DEX Screener, 2026), evidence: practice
For Stoker: Coin page `CoinMarket` tabs - add Top traders and a KOL-holders view (wallets with a known X handle) to our Trades and Holders tabs, and give the phone a layout toggle rather than one long scroll.
Audience: traders and KOLs (a KOL likes to be seen holding).

### Trending Score and the trending bar
Finding: Every token gets a Trending Score from volume, liquidity, transactions, unique makers, holders, page visitors, reactions (🚀 🔥 💩 🚩), verified info and a security audit; the top 30 run across the page top as a bar with rank, % change and age.
Source: https://docs.dexscreener.com/trending (DEX Screener, 2024), evidence: practice
For Stoker: Landing Trending and board sort - publish our trending formula (volume, traders, holders, age), keep reactions out of it, and show age next to the % in the Trending strip.
Audience: traders; a published formula is a marketer's playbook too.

### Boosts, Golden Ticker, Metas, ads
Finding: Boost packs (12 to 24 hours) multiply a token's Trending Score and show a count next to it; 500 active Boosts turn the ticker gold; Metas are hand-curated narrative groups; two ad slots sit inside the pair page ("Hide ad"); boosts are refused for tokens flagged by audit partners.
Source: https://docs.dexscreener.com/boosting and https://docs.dexscreener.com/metas (DEX Screener, 2025-2026); https://solanacompass.com/projects/dex-screener (Solana Compass, 2026), evidence: practice and opinion
For Stoker: `/curated` - Curated must be the opposite of a Boost (platform-approved and bought by STOKER stakers, not paid placement) and the page should say so in one line; Metas suggest a "narrative" chip on the board (stocks, cats, AI) curated by hand.
Audience: marketers (they will ask to pay), traders (they distrust paid placement), a direct conflict the copy must settle.

### Take and reject
Take: the stat block (quote-priced and USD price, liquidity, FDV, four windows with buy/sell split bars); the pair facts (age, pooled sides, addresses with explorer links, other pairs); the tabs (top traders, KOLs, holders) and the phone layout toggle.
Reject: paid Boosts and the Golden Ticker (pay-to-trend is the trust problem our Curated is meant to solve); ads inside the pair page (NN/g's user studies rank in-content ads among the most-hated patterns, and they cost a trader's attention at the moment of decision); a 60-chain rail that pushes the content down (navigation should be scoped to what the page can act on).

## 7. Comparison table

| Part | StonkFun | pump.fun | uselaunch (LAUNCH) | Torchpad | PonsVault | DEX Screener |
| --- | --- | --- | --- | --- | --- | --- |
| Navbar | 5 text links, search, 2 icon buttons, 2 equal filled buttons (launch, connect) | Left sidebar, 9 links in 2 groups, 1 green Create, search ⌘K, Sign in, profit ticker on top; bottom tab bar on phone | Mark, 6 lowercase links, "create coin" twice, outbound host link | 6 sections, Tools, search "/", chain selector, Deposit, Sign in; bottom tab bar, PWA | Home, Menu, 8 links incl. Seats and Tip, Connect | Left rail of 10 tools plus 60 chains, search "/", Get the App |
| Hero | Bordered card: headline, lede, 1 button, dashed chart, live token card; board right below | None: consent modal, then Trending cards (Coins/Stocks/Perps), callouts, leaderboard | Not captured (root 404); #120: stat tiles with icons, live event pills | "Live 5s" badge, 1 line pitch, featured trending card, progress board | Eyebrow, headline, mechanism sentence, 2 buttons, pair marquee, live top 5, 3 numbered steps | None (a pair page); trending bar on top |
| Footer | 1 centred row of 8 links | Resources and Legal columns, Blog, 3 socials, cookie banner | Disclaimer line, link row, look switcher | Docs link, chain, tab bar; consent modal | Identity sentence, Product, brand (X, GitHub), Ecosystem | Socials in the rail; none |
| Board | 3-column card grid, pair watermark, sparkline, 3 sorts, 1 issuer filter, 4,549 pages | Table: Mcap, ATH, Age, Trades, Vol, Traders, 1h/6h/24h; tabs Movers, New, Custom pairs, Charities; Quick buy; 60 a page | Rows with NEW badge, ATH, sparkline, description line, "most burned" sort; refresh note | Rows: change, status, name, MC, creator, age, pair, Burned %, Liq, Vol; tabs incl. Graduating, Watching; Quick Buy; failure states named | Cards with vault live-state line, Graduation %, Tax; Newest or market cap; test coins on page 1 | Screeners: New Pairs, Gainers, Trending; filters by chain, DEX, window |
| Coin page | 4 tiles, chart with Price/MCap, top-100 holders, swap links out, flywheel and burn cards, address block; no trust figures | Dev % chip, launchpad and reward-recipient lines, 4 tiles, Stats and Audit tabs (thresholds published), bubble map, pool info, Holders/Callouts/Trades/About/Paired tokens, creator rewards card, trade box with USD presets | Right column stack: curve bar, buyback tile, fee-flow bar, anti-vamp ticks; calls and holder chat; share card | Price, MCap, Liq, Vol, Burned in header; Chart/Calls/Token info; Trades/Positions/Orders/Holders/Calls; Launch details with paid-out figures | Price, MC, FDV; vault panel: state, burned, immutable config, queued run, gross vs share; About, Links | Rank, chain and DEX badges, USD and quote price, Liq, FDV, MC, 4 windows with buy/sell bars, age, pooled sides, addresses, Audit, Boosts, Txns/Top Traders/KOLs/Holders/Maps |
| Launch flow | 1 page: Standard/Reward, tax None/1%/3%, dev buy slider to 75%, identity, links, quote picker with category counts; sticky summary with fees and 3 reassurances | 1 page: permanence warning first, identity, SOL/USDC/Custom pair, rewards to creator or holders, Mayhem, image or video, banner, live preview; free to create | Free, no dev buy, live anti-vamp card, "your coin on the board" preview | 3 steps: presets (1/2.5/5 ETH start), identity, tax 1-10% and 70% destination, review with dev buy's share and resulting MC, 0.00015 ETH | 1 page: identity, IPFS consent, pairing asset with issuer, optional tax, vault choice with fields, initial buy in the same call, 0.0005 ETH; summary changes with the vault | n/a (Token Profile and Boosts are paid) |
| Trust signals | Status pills, copy chips, explorer links, disclaimer page, "new here" wallet modal | Audit thresholds, Dev %, bubble map, "Admin permissions revoked", charity verification, holders filters | Ticker folding, name and image copy refusal, one coin per X account, private bundle create, receipts per transaction | Address suffix 1111, liquidity locked forever, no owner/mint/pause, 48 h timelock, 4-bullet consent, "estimates labelled" | Immutable config, "anyone can run it", verify at burn address, stats read from chain with timestamp, liquid-stock list re-checked | Audit "No issues" with caution, pair age, pooled sides, explorer links, verified info boosts trending |
| Creator economics shown | One approximate line in the launch summary; nothing on the coin page | Creator rewards card with unclaimed amount and Donate, recipient line, tiered fees page, Holder rewards league page | None for the creator: 100% buyback and burn, per-coin estimates labelled | 70/30 bar, destination choice, Launch details paid-out figures, claim as ETH or own coin, 60-day sweep | 70/30 in the pool fees table, redirected to a vault, "nothing to withdraw", paid-to-holders totals | n/a |
| Visual language | Dark navy, teal, 1px cards, geometric sans, no motion, dark only | Dark, dense, green primary, HOT and LIVE badges, emoji feed, mobile first, terminal outsourced | Lowercase full-stop headlines, mark as decoration, look switcher | Lowercase voice, dense dark terminal, Beta tag, numbered sections, flywheel diagram | Clean marketing page, numbered steps, Live/Soon tags, marquee, plain app tables | Dark data UI, dense tables, TradingView chart, badges and counts |
| Mascot or character | None (abstract swirl mark) | A 3D smiling green character in the welcome scene | A 3D arrow in poses on every page | None | None | None |

## 8. Take / Reject for Stoker

Take:
1. One filled action in the Header and a quiet wallet control, with the active link underlined (StonkFun's two equal buttons are the counter-example).
2. A landing Hero built like PonsVault's: the mechanism in one sentence, a Quote Asset marquee, a live ranked top five, three numbered steps; keep our slogan and two buttons.
3. A `/how` page in the uselaunch shape: one promise per numbered card with a diagram and a link to its proof (pair, on-chain creator pay, Copy Protection, Reward Launches, Burn, Ledger).
4. The board as a table with pump.fun's columns (Mcap, ATH, Age, Trades, Vol, Traders, 1h/6h/24h), a NEW chip, a sparkline, tabs for Graduating, Stocks and Reward Launches, a Quick Buy, a "live, 5 s" note and a named failure state (Torch).
5. The coin page header with DEX Screener's stat block (USD and Quote-priced price, liquidity, FDV, four windows with buy/sell bars) and pump.fun's chips (Dev %, age, launched on Stoker, earnings destination).
6. A trust block with published thresholds in the tooltips (top-ten holders 20%, dev 5% and 20%, snipers and bundlers 10%), figures shown and a green state worded as "no flag found" (pump.fun's Audit tab, BloFin's caution).
7. A Launch details block on the coin page (launch type, Reward Tax, destination, paid out so far to creator, holders, burn) and a Creator Earnings card with "nothing to claim" (Torch, pump.fun, PonsVault all show the split; none of them shows it paid without a claim).
8. Copy Protection shown live on the launch form and as a "protected until" line on the coin page (uselaunch's ticks).
9. The launch form on phones as three steps with a review that states the First Buy's share of supply and the resulting market cap, and the identity fields headed by the permanence warning (Torch, pump.fun).
10. Every figure with its source and time ("from the Ledger, updated 14:02"), every estimate labelled, every unknown said (PonsVault's stats line, Torch's principle).
11. A four-bullet consent gate in plain words instead of a long disclaimer (Torch), plus the "new here" wallet path (StonkFun).
12. The Rewards page as a league table with totals, a top five and a Quote Asset filter (pump.fun's Holder rewards page).
13. A bottom tab bar under 768px and a "/" shortcut for search (pump.fun, Torch, DEX Screener).
14. Live/Soon tags on feature cards for Curated and Airdrop Mode (PonsVault), and a one-line statement on `/curated` that it is never paid placement (the opposite of DEX Screener's Boosts).

Reject:
1. Two equal filled header buttons and a nav longer than six items (StonkFun, PonsVault): one primary action per bar.
2. A trade box that links out (StonkFun's Jupiter card): the coin page's job is the trade.
3. A profit ticker, leaderboard-first home, bounties and livestreams (pump.fun): survivorship marketing and moderation costs that conflict with trust and with a two-person team.
4. Fees that appear only at confirm or stack four kinds (pump.fun's 0.45% Platform Fee over 1.25%): we show one figure before the trade.
5. Paid Boosts, golden tickers and ads inside the coin page (DEX Screener): pay-to-trend is what Curated must not be.
6. Custodial wallets, a master wallet, free launches and a password sign-in (uselaunch, Torch): against ADR 0003 and 0004, and uselaunch's 404 two days after its pivot is the proof.
7. Any anti-sniper tax or a 1 to 10% buy tax (Torch): the owner ruled it out on 2026-10-26; our answers are First Buy, labels and shown figures.
8. A supply-doubling trading agent (pump.fun's Mayhem Mode) and an anonymous live trade feed in a side panel (Torch): both fabricate activity a trader cannot verify.
9. A production look switcher, lowercase-full-stop voice and a mascot in every card (uselaunch): experiments stay behind flags, and our voice and character are our own.
10. An uncurated board where empty test coins fill page one (PonsVault): rank by signal, keep the controls, but never let the first screen be dead coins.
