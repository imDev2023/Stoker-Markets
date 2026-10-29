# Trading terminals and tool docs as design and feature references for Stoker (issue #130, 2026-10-28)

Scope: the owner's three tool links (Titan Exchange, TradingView widgets, the Jupiter + Meteora knowledge base) and the ten terminals memecoin and perp traders use.
Method: pages read through Jina until its balance ran out (HTTP 402 `InsufficientBalanceError` after about 30 pages), then Tavily extract, the GitBook `.md` routes and plain curl; the terminals that render were captured with the owner's agent-browser at 1440 and 390 wide (session `stoker-terminals`, opened and closed by me).
Every downloaded page and screenshot is under `/private/tmp/claude-501/-Volumes-Farhan-Work-Folder-Dev-AI-stonk-fun-solana/1048aa25-7a30-4a52-a8a9-84f3a6350332/scratchpad/research/terminals/<site>/`.
Layout figures below are measured on my own 1440x900 captures unless a line says otherwise.
Evidence labels: `research` (a study), `practice` (a product's own docs or the product as captured), `opinion` (a review or an agency article).

## What I read

- https://titan.exchange/ , /spot and /pro - the swap app and the three-column Pro terminal (captured 1440 wide).
- https://developer.titan.exchange/ - the Developers Portal plans (Sandbox free at 1 rps to Growth $500 at 150 rps).
- https://titan-exchange.gitbook.io/titan/developer-doc and /developers-portal/introduction - the API map and the four Portal endpoints.
- https://titan-exchange.gitbook.io/titan/getting-started/quickstart.md , quickstart-1.md, titan-limit-orders.md, analytics.md - the user-side docs (quotes from several aggregators, Prime Mode, on-chain limit orders, the "trading edge" figures).
- `/Volumes/Farhan/Work Folder/Dev/AI/Research-Projects/jupiter-meteora/titan-exchange.md` - the knowledge base's Titan synthesis, including a live Portal key check of 2026-10-26.
- https://www.tradingview.com/widget-docs/getting-started/ , /solutions/ , /widgets/ , /widget-formats/ , /faq/data/ and the Charts, Tickers, Heatmaps, Screeners and News category pages - the widget catalogue, the recommended dashboards, and the data rules.
- `/Volumes/Farhan/Work Folder/Dev/AI/Research-Projects/resources/robinhood-chain/55-tradingview-widgets-for-underlying-markets.md` - the local note on web components, attributes and symbol lookup.
- `/Volumes/Farhan/Work Folder/Dev/AI/Research-Projects/jupiter-meteora/README.md` , `jupiter/01-products-user-docs.md` (sections 2.4, 2.8, 2.10 to 2.12, 4), `jupiter/02-developer-platform-and-apis.md` (sections 5 to 10, 14), `jupiter/04-trading-mcp-tools.md`, `ecosystem-and-apps.md` (sections 1.1 to 1.3, 1.11) - the Jupiter products and APIs.
- https://jup.ag/ , /spot , /spot/alphascan , /tokens/<Bonk> and /tokens/<INVERSE, a StonkFun coin> - captured at 1440 and the token page at 390.
- https://app.hyperliquid.xyz/trade - captured at 1440 and 390; https://hyperliquid.gitbook.io/hyperliquid-docs/trading/order-types.md ; https://coinbureau.com/guides/how-to-use-hyperliquid (interface passages).
- https://polymarket.com/ and an event page (view-only from this IP), captured at 1440; https://docs.polymarket.com/ ; https://avark.agency/learn/prediction-market-design-patterns (Avark, agency article, 2026).
- https://birdeye.so/token/<SOL> as rendered text (the token page's every figure and tab); https://solanacompass.com/projects/birdeye ; https://uwuu.ai/blog/birdeye-review .
- https://gmgn.ai/ (SEO text only), https://docs.gmgn.ai/index/token-page-chart-multicharts-activity-trading-system.md , featured-icon-definition.md, ca-security-checks.md, insider-traders-snipers-first-70-buyers.md, https://gmgn.ai/blog/what-is-a-meme-coin-bundle (GMGN's own definitions).
- https://docs.axiom.trade/ and its finding-tokens, swap, trader-scan and fees pages; https://coinbureau.com/review/axiom-trade-review (Coin Bureau, June 2026); https://axiompro.app/terminal and /token-scanner (an affiliate's walkthrough of the layout and the bundle rule, September 2026).
- https://uwuu.ai/blog/photon-review ; https://solanatools.io/photon.html ; https://axiompro.app/photon (Photon's Memescope, presets, and its volume against Axiom).
- https://solanacompass.com/projects/bullx (BullX suspended trading on 2026-06-01).
- https://trade.padre.gg/ (a sign-in wall), https://uwuu.ai/blog/padre-terminal-review and https://crowinvesting.com/trading-solana-bots/padre-terminal-review (Padre is Pump.fun's "Terminal" since October 2025).
- https://docs.dexscreener.com/ , /trending.md , /boosting.md , /token-listing.md ; https://www.bitbond.com/resources/dex-screener-the-ultimate-guide (the token page's KPI column, audits and reactions).

Not reached: the DEX Screener, Axiom, Photon and GMGN app pages answer a Cloudflare challenge to Jina and to headless Chromium alike; BullX and Padre sit behind sign-in; Polymarket serves a view-only mode here; the TradingView per-widget pages need a browser session for their attribute lists (the local note already holds `tv-advanced-chart`'s); the Titan key in the owner's env was not used.

## Part A. The owner's links

### Titan is a meta-aggregator that shows one best quote and keeps score of the saving
Finding: Titan asks several routers (its own Argos and DART, and providers such as Metis and OKX) for a quote on every swap, simulates each on chain, refreshes every second, and fills the estimated amount out from the best one; after a trade the profile shows "total outperformance" plus "total fee savings" as the trader's "trading edge" in dollars, with volume, trade count and badges beside it.
Source: https://titan-exchange.gitbook.io/titan/getting-started/quickstart.md and /analytics.md (Titan, 2025), evidence: practice
For Stoker: the coin page's trade panel on a graduated coin (issue #84) - quote Jupiter `/swap/v2/order` and Titan `/api/v1/quote/swap` side by side, show the winning route's amount and the difference to the other in the Quote Asset, and keep a per-wallet "saved so far" figure on `/creator`'s sibling, the account menu.
Audience: traders; creators get it for free because a coin that routes well reads as liquid.

### Titan's app tags every tokenized stock with its issuer, the way Stoker's chips do
Finding: Titan's asset list writes the issuer's logo next to the ticker (xStocks beside TSLAx, Backpack Securities beside TTWO and DJT, PreStocks beside OPENAI) and StonkFun's logo beside STONK, with MC and VOL under the name and the price and 24h change right-aligned in green or red; the Pro page is three columns at 1440 wide, 330px asset list, 760px chart with a Chart / Info tab pair, 315px trade box with Market / Limit / Slice / Prime, Buy / Sell, "Pay with", 5% 10% 25% 50% Max presets and "Est. receive".
Source: https://titan.exchange/pro (captured 2026-10-28, `terminals/titan/pro-1440.png`), evidence: practice
For Stoker: `PairMark` and `CoinRow` - keep the issuer badge glued to the Quote Asset's ticker everywhere a pair is named (Titan proves traders read "TSLAx + xStocks logo" as one unit), and give the trade panel percentage presets of the wallet's balance, not only fixed amounts.
Audience: traders and creators; no conflict.

### Titan's design language: black, gold, a serif display face, dark only
Finding: Titan Pro is a near-black canvas (#000 to #0b0b0b) with a single gold accent for the primary button and the Prime badge, green and red reserved for price direction, and a serif display face for the "Titan Pro" title in its guided tour; there is no light mode.
Source: https://titan.exchange/pro capture, evidence: practice
For Stoker: a reference for restraint only - one accent colour, direction colours never used as chrome; Stoker keeps light and dark (settled), so Titan's palette is not a target.
Audience: all.

### Titan's API is a drop-in second quote source with integrator fees, but no data
Finding: the Portal has four GET endpoints (`/api/v1/quote/swap`, `/info`, `/venues`, `/providers`), `x-api-key` auth, JSON on `Accept: application/json`, `quotes` keyed by provider with `metadata.ExpectedWinner` to execute, `feeAccount` plus `feeBps` for the integrator's fee, `positiveSlippageFeeReceiver` up to 10 bps and a `payer` co-signer for sponsored swaps; the Sandbox is free at 1 rps and 2.5M credits a month; a Portal key checked on 2026-10-26 listed only `Titan` and `Titan-DART` as providers, rejected a `dexes` filter, and found no route for a freshly graduated DAMM v2 pool that Jupiter routed, and Titan has no token, price or portfolio endpoints.
Source: `jupiter-meteora/titan-exchange.md` sections 3 and 11 (owner's knowledge base, 2026-10-26) and https://titan-exchange.gitbook.io/titan/developer-doc, evidence: practice
For Stoker: `apps/api` - add Titan as the second source behind the existing `jupiterSwapIn` route for graduated coins only, cache its `/venues` answer (it lists "Raydium Launchlab" and "Raydium CPMM"), and never show a Titan quote for a curve trade, where our own builder already prices exactly; expect Titan to miss brand-new pools for a while after Graduation.
Audience: traders; developers through `/api` if the comparison is exposed.

### TradingView's widget catalogue, one line each, and where each could sit
Finding: the catalogue is Charts (Advanced Chart; Symbol Overview; Mini Chart; Seasonal Chart), Watchlists (Market Summary; Market Overview; Market Data; World Market Summary), Tickers (Ticker Tape; Ticker Tag; Single Ticker; Tickers), Heatmaps (Heatmap for stocks, crypto or ETFs; Forex Table), Screeners (Screener, with a crypto-coins preset), Symbol Details (Symbol Info; Technical Analysis; Fundamental Data; Company Profile), News (Top Stories), Calendars (Economic Calendar), Brokers (Rating; Reviews) and Economics (Economic Map); TradingView's own one-liners: the Mini Chart "lets you see a symbol's price and change percentages, alongside an even more stripped-back chart view", the Ticker Tag is "a compact inline pill" showing a symbol's logo and daily change that "expands into a detailed chart pop-up on hover", the Heatmap gives "a macro view of stocks, crypto coins or ETFs", the Screener sorts "by fundamental and technical indicators", Top Stories are "daily news briefs designed to be read in 20 seconds or less".
Source: https://www.tradingview.com/widget-docs/widgets/ and its category pages (TradingView, 2026), evidence: practice
For Stoker, by widget: Advanced Chart - already the asset page's market chart (#124); Symbol Info - the asset page, a strip above the market chart with the underlying's price, change, open and range; Ticker Tag - the coin page's "Paired with NVDAx" pair card, so the underlying's daily move is one hover away; Mini Chart - the asset rail's hover card and the asset directory's rows for stocks; Ticker Tape - the top of `/assets` only, never the home hero; Company Profile and Fundamental Data - a collapsed "About the underlying" on a stock's asset page; Technical Analysis gauge, Economic Calendar, Economic Map, Market Overview, Market Summary, World Market Summary, Screener, Seasonal Chart, Broker widgets - reject (no Stoker question they answer, and three of them are the "dashboard of widgets" look the owner called vibe-coded); Top Stories - maybe on a stock's asset page, filtered to the symbol, behind a tab.
Audience: traders on tokenized stocks; creators choosing a pair; conflicts with no one, but every widget carries TradingView's attribution and links, which cannot be removed without an agreement.

### What TradingView recommends for a crypto site and for a broker
Finding: the Solutions page assembles three dashboards: Stocks = Ticker Tape + Symbol Info + Advanced Chart + Company Profile + Fundamental Data + Technical Analysis + News Feed; Crypto = Symbol Info + Advanced Chart + Company Profile + Technical Analysis + News Feed + the Crypto Coins Heatmap + the Cryptocurrency Market screener; Forex adds the Economic Calendar and the Forex Table; brokers get two widgets of their own, Broker Rating and Broker Reviews, which show TradingView's ratings of the broker.
Source: https://www.tradingview.com/widget-docs/solutions/ (TradingView, 2026), evidence: practice
For Stoker: the asset page of a tokenized stock can follow the Stocks recipe minus the tape (Symbol Info, chart, profile and fundamentals collapsed); the coin pages must not, because the coins are not on TradingView, and the data FAQ says widgets cannot show your own data at all, so a coin's chart stays `lightweight-charts` from our candles.
Audience: traders; developers if the asset page documents which symbol it maps.

### TradingView's data rules that bound every placement
Finding: stock data in widgets is delayed because exchanges charge per site for real time, crypto and forex are real time, no paid TradingView plan changes that, there is no data API, widgets cannot take your own data (use Lightweight Charts or Advanced Charts for that), and the web component format is recommended because several widgets share one connection, read `--tv-widget-*` CSS tokens and follow the page's colour scheme, while iframes isolate but reload on every change.
Source: https://www.tradingview.com/widget-docs/faq/data/ and /widget-formats/ (TradingView, 2026); the local note `55-tradingview-widgets-for-underlying-markets.md` adds the attribute list and the test stub, evidence: practice
For Stoker: the asset page - label the underlying's figures "delayed" where the symbol is a stock, pin `theme` to Stoker's `data-scheme`, pass the tokens from `globals.css`, and keep the UI suite's `route.fulfill` stub.
Audience: traders; developers.

### Jupiter's products, one line each, and whether Stoker should embed or link
Finding and verdicts, from the owner's knowledge base:
- Ultra / Swap v2: the default jup.ag execution mode (RTSE slippage, Beam landing, gasless on some pairs, 0 to 0.5% commission); Stoker already uses `/swap/v2/build` for SOL-paid buys (ADR 0003), so nothing to embed.
- Plugin: the open-source swap widget (`plugin.jup.ag/plugin-v1.js`, no API key, `integrated`, `widget` or `modal` modes, `fixedMint`, `referralAccount` and `referralFee` of 50 to 255 bps, CSS variables for theme); it runs on Ultra, not on Stoker's server-built trades, so do not put it on the coin page; one use is a "Get SOL or USDC" helper for an empty wallet, behind the account menu.
- Trigger (Limit Orders V2 and DCA): USD-price triggers, Take Profit, Stop Loss, trailing stop, OCO, OTOCO, 10 USD minimum, a custodial Privy vault, no integrator fee, and only for tokens Jupiter routes; link "Set a limit order on Jupiter" from a graduated coin's trade panel, never from a curve coin.
- Send: send any token to someone without a wallet as a link or QR, claimed in Jupiter Mobile, auto-refund on expiry, no fee; a "Send this coin to a friend" action for creators and marketers, built on `craft-send` (client-side invite codes are required).
- Lock: the open-source vesting program (`LocpQgucEQHbqNABEYvBvwoxCPsSbG91A1QaQhQQqjn`, no REST API, CLI instructions); compose its instructions into a launch so a creator can lock part of their supply, and say so on the coin page; note that Jupiter's Top 10 H. still counts a Jupiter Lock escrow, so the coin page must label the locked share itself.
- Portfolio API: positions on Jupiter platforms only (100 credits a call); not for Stoker's own holdings view, link out at most.
- Studio: Jupiter's own launchpad on Meteora DBC with a branded token page on jup.ag; a competitor, not a feature, but its Launchpad Screener listing (StonkFun is listed, "evaluated case by case" for non-DBC pads) is the distribution Stoker should ask for.
- Prediction (Predict): Polymarket-sourced markets; Jupiter shows "related Predict markets" on its stock pages; reject for Stoker now.
- Trading MCP: 75 hosted tools (swap, trigger, send, prediction, portfolio); the lesson is distribution to agents, so ship `llms.txt` and an agent skill for Stoker's read API next to `/api`.
Source: `jupiter-meteora/jupiter/02-developer-platform-and-apis.md` sections 5 to 10 and 14, `jupiter/01-products-user-docs.md` 2.4 and 2.8, `jupiter/04-trading-mcp-tools.md` (owner's knowledge base, 2026-10-04 with 2026-10-26 checks), evidence: practice
For Stoker: Send and Lock are launch and sharing features (`/launch` options and the account menu); Trigger is a link on graduated coins; Plugin and Portfolio are not for the coin page; the MCP lesson is for `/api`.
Audience: creators (Lock, Send), marketers and KOLs (Send), traders (Trigger), developers (`/api` skill).

## Part B. The terminals

### Jupiter's token page: a 70 / 26 split, stats as label-over-value cells, trust cells in a 3x3 grid
Finding: at 1440 wide the page is a 55px icon rail, a 1005px chart column (70%) and a 380px right panel (26%); the header row is 60px tall with name, age, CA, a bold price with the 24h change under it, then MC, Liquidity, Holders and Org Score as small label-over-value cells; the chart is about 380px tall with its own toolbar (Auto 1h 15m 4h 1D, Indicators, Price / MC, USD, Display options, News) and a range row (1d 5d 1m 3m 6m 1y All); under it the tabs Transactions, My Holdings, My Orders, Holders (1.03m), Top Traders, plus Dev Tokens on a launchpad coin, then filter chips All / You / Dev / Followed (plus Sniper / Insider / Bundler on launchpad coins) and a table Date/Age, Type, Price, coin amount, Volume, Trader with green Buy and red Sell chips and the volume coloured by side; the right panel opens with a 24h Vol / Buys / Sells / Net Vol strip over a green-red proportion bar, then Market / Limit / DCA + Ultra, a Sell box with a 36px light input, a Buy box, a V1-transactions toggle, a full-width lime Connect button, then Token Info as nine cells (Top 10 H., Dev H., Snipers H., Freeze Auth, Mint Auth, Dex Paid, Pro Traders, Insiders H., Bundlers H.) and the CA.
Source: https://jup.ag/tokens/<mint> captured 2026-10-28 (`terminals/jupiter/token-bonk-1440.png`, `token-inverse-1440.png`), evidence: practice
For Stoker: the coin page - the same order of information (price and change, four figures, chart, tabs, trades) with the trade panel on the right and the trust figures (ADR 0013) as a grid of cells under it, not above the chart; the buys-versus-sells bar is the one figure Stoker's coin page lacks that every terminal has.
Audience: traders first; creators read the same page, so the grid's wording must not shame a coin that is simply young (a 0% Dev H. reads as good only if the label says what it measures).

### Jupiter marks the dev on the chart and draws the holders' average entry and exit
Finding: on a launchpad coin the chart carries a "DB" (dev buy) marker, a crown with a count for Dev Migrations, a yellow "1 Warning" under the Buy selector, and two dotted lines labelled "Top 100 Holders Avg Entry" (green) and "Top 100 Holders Avg Exit" (red); markers for Your Trades, Dev Trades, Followed Wallet Trades, Migration and News are toggles in Display options.
Source: `terminals/jupiter/token-inverse-1440.png` and `jupiter/01-products-user-docs.md` 2.11, evidence: practice
For Stoker: `PriceChart` - Stoker knows the Creator and the Graduation, so mark the Creator's trades and the Graduation on the chart by default, the connected wallet's own trades too, and an average-entry line from the indexed trades of the top holders; no followed wallets until a tracker exists.
Audience: traders; creators (a creator who never sells shows a clean chart, which is the trust the Creator Forward model wants to earn).

### Jupiter's feed cards: five trust chips per card, colour by threshold, quick buy per column
Finding: AlphaScan is three equal columns, New / Soon / Bonded, each with a keyword search and a lightning quick-buy preset (0.01 SOL by default) in its header; every card is a 68px image, name, ticker, age in green, socials, holders, a dev-tokens fraction, V (volume), MC and TX, then a row of five pill chips for top-10 %, dev %, snipers %, insiders % and bundlers %, green when 0% and red once high (19%, 44%, 99% were red); coins without an image show a "?" tile; Customise sets font sizes, the Quick Buy button size (Small, Large, Mega, Jumbo) and the thresholds, and tweet age is coloured green under 10 minutes, yellow to 60, red after.
Source: https://jup.ag/spot/alphascan captured 2026-10-28 (`terminals/jupiter/alphascan-1440.png`) and `jupiter/01-products-user-docs.md` 2.10, evidence: practice
For Stoker: the board `/coins` - a card has to carry at most three figures and one trust summary, because the five-chip row reads as a wall of icons with no legend (a recognition-over-recall failure); if Stoker adds a launch feed, it should be New / Graduating / Graduated as sections of the board, not a second page.
Audience: traders want the chips; creators and marketers lose their coin behind them; a legend and a single "clean" state solve both.

### Jupiter Spot's home: an AI "Market Pulse", spotlight pills, cards with multiplier badges, and a permanent swap panel
Finding: the Spot page keeps a 465px swap panel on the right (32%) on every sub-page and fills the left with a "Market Pulse (Beta)" AI paragraph, a Spotlight row of ticker pills with their 24h change, Popular cards with a multiplier badge (+39x, -82.04%), and three list panels Trending 24h, Stocks and SmartMoney Buys; the Discover table's columns are Token/Age, Price/%change, MC/FDV, 24h Vol/Net, Liquidity, Holders/%change, Fees Paid and a 24h sparkline, with filters for market cap, volume, holders, liquidity, age, dev holdings, mint and freeze authority, verification and bonding curve %.
Source: https://jup.ag/spot captured 2026-10-28 (`terminals/jupiter/spot-1440.png`) and `jupiter/01-products-user-docs.md` 2.10, evidence: practice
For Stoker: the landing's Trending and the board's sort - "Fees Paid" is a figure Stoker can show honestly (the Ledger has it per coin) and it is a better organic-demand proxy than volume; the AI paragraph and the spotlight pills are the vibe-coded look to avoid.
Audience: traders; marketers (a coin's fees paid is a bragging figure).

### Jupiter's mobile token page: one price, four figures, a Chart | Trade pill
Finding: at 390 wide the page stacks a search header, the SOL and JUP ticker strip, the coin's name and a 28px price with the 24h change, a four-figure row (MC, Liquidity, Holders, Org Score), the 5m / 1h / 6h / 24h chips, the chart at full width and about 400px tall, and a floating two-segment pill "Chart | Trade" above a five-item tab bar (Spot, Perps, Lend, Predict, Portfolio).
Source: `terminals/jupiter/token-bonk-390.png`, evidence: practice
For Stoker: the coin page at 390 - a sticky Chart | Trade pill is the cleanest answer found to "where does the trade panel go on a phone", better than Hyperliquid's four tabs because it never hides the chart behind a tab.
Audience: traders.

### Hyperliquid: chart 62%, order book 19%, order form 19%, eight tabs under the chart
Finding: at 1440 wide the trade page is a 56px nav (Trade, Portfolio, Earn, Vaults, Staking, More, a teal Connect), a market header with the pair, a leverage pill, Mark, Oracle, 24h Change, 24h Volume, Open Interest and Funding as label-over-value cells, then three columns: the chart (900px, 62%) with a 55px drawing toolbar and Chart / Funding tabs, the order book (270px, 19%) with Price / Size / Total, red asks above a Spread row and green bids below, and the order form (270px, 19%) with Cross / 10x / Unified pills, Market / Limit / Pro, a filled teal Buy / Long against an outlined Sell / Short, a size field with a unit, a slider, Reduce Only and TP/SL checkboxes, then Liquidation Price, Order Value, Margin Required, Slippage (Est 0% / Max 8%) and Fees (0.0450% / 0.0150%) as a definition list; under the chart the tabs Balances, Positions, Open Orders, TWAP, Chase, Trade History, Funding History, Order History and the empty state "No open positions yet"; an Announcements toast sits bottom right with three dated lines; the palette is dark green-black with teal and rose for direction, tabular figures throughout.
Source: https://app.hyperliquid.xyz/trade captured 2026-10-28 (`terminals/hyperliquid/trade-1440.png`), evidence: practice
For Stoker: the coin page - the definition list under the action button (what you pay, what you get, the fee, the slippage cap) is the pattern for Stoker's fee line (1% on the curve, 1.25% after Graduation, the Creator's share); the empty-state sentence under the tabs is the model for Stoker's holders and trades tabs on a fresh coin.
Audience: traders; the announcements toast serves everyone (fee changes, #22).

### Hyperliquid's order types are documented in one list, with the rules a UI must state
Finding: Market, Limit, Stop Market, Stop Limit, Take Market, Take Limit, Chase (a post-only limit that re-prices one tick inside the best bid or ask, runs in the browser tab, five at once), Scale (several limits in a range), Trailing Stop (perps only) and TWAP (sub-orders every 30 seconds at least, 5 minutes to 7 days, $100 minimum, 3% slippage per sub-order, optional 20% size randomisation); options Reduce Only, GTC, Post Only, IOC, TP and SL.
Source: https://hyperliquid.gitbook.io/hyperliquid-docs/trading/order-types.md (Hyperliquid, 2026), evidence: practice
For Stoker: `/api`'s reference and the trade panel - Stoker offers one order type (market with a slippage limit); say so plainly and link Jupiter Trigger for the rest on graduated coins rather than hinting at orders that do not exist.
Audience: traders.

### Hyperliquid on a phone: four tabs and the chart first
Finding: at 390 wide the header keeps the Connect button, the pair name and price stack with the 24h change under it, the content becomes four tabs (Chart, Order Book, Trades, Funding) with the chart first, and the Balances / Positions tabs follow below; the Announcements toast becomes a bottom sheet.
Source: `terminals/hyperliquid/trade-390.png`, evidence: practice
For Stoker: the coin page at 390 - tabs for Trades and Holders are fine below the chart, but the trade panel should not be a tab (see the Jupiter pill).
Audience: traders.

### Polymarket: a 64 / 24 split, probability in two formats, a card-first discovery
Finding: at 1440 wide the event page is a 72px nav (logo, Predict, Combos, Perps, a centred search, How it works, Log in, a blue Sign up) and a category strip (Trending, Breaking, New, a red Midterms, Politics ... More), then a 925px main column (64%) with a 64px thumbnail, the question as a 24px title, a legend of outcomes with coloured dots and percentages, a 190px probability line chart (right axis 0 to 60%), a volume and date row with 1H 6H 1D 1W 1M ALL, and outcome rows 73px tall with the name, its volume, a 32px bold probability with a green or red change arrow, a filled green "Buy Yes 50¢" and a filled red "Buy No 51¢"; the right panel (340px, 24%) names the outcome, offers Buy / Sell tabs, a Market dropdown, Yes 50¢ in green against No 51¢ in grey, a large Amount field with +$1 +$5 +$10 +$100 chips, a blue Trade button and the line "By trading, you agree to the Terms of Use", then a related-markets list; the home is a feed of cards.
Source: https://polymarket.com/event/... captured 2026-10-28 (`terminals/polymarket/event-1440.png`), evidence: practice
For Stoker: the trade panel - the amount chips (+$1 +$5 +$10 +$100) are the friendliest preset pattern found, and the legal line under the button is where Stoker's disclaimer belongs, not in a modal on the first click; the home page's card feed is the model for the landing's Trending, one figure and one action per card.
Audience: traders and first-timers; the per-outcome Buy buttons are a model for Stoker's board rows (a Buy button on `CoinRow`), which marketers also want.

### Avark's prediction-market patterns: dual-format numbers, layered disclosure, explore before committing
Finding: the article's rules are to show probability "in two formats simultaneously" (72¢ and 72%), to keep the default view as "the event, the probability, and a clear action" with the order book "one interaction away, not absent", to layer the product (layer 1 card and Yes/No; layer 2 chart, trade history, sizing; layer 3 order book, depth, exports), to let users "browse markets, see prices, and understand the product before requiring any signup", to animate live numbers with rolling counters rather than flashing colours ("this is live" without "this is urgent and scary"), and it credits Robinhood's 200 to 400ms micro-interactions and haptic confirmation as the difference between a spreadsheet and a product.
Source: https://avark.agency/learn/prediction-market-design-patterns (Avark, Ian Cox, 2026), evidence: opinion
For Stoker: the coin page and the board - price in the Quote Asset and in USD side by side, the labels and trust grid one click below the fold on phones, every page readable without a wallet (already true, keep it), and a 200 to 300ms rolling-number transition on price and MC instead of a colour flash.
Audience: traders and the newcomers the owner's list calls tweeters and NFT projects; a creator wants the same calm numbers on their own coin.

### Birdeye's token page: every figure a terminal shows, in order, plus three layouts and a creator CTA
Finding: the rendered page carries a nav (Trending, Trenches, Trackers, Supercharts, Perps, Peak, API), a header with the name, an "OG" badge, the age (">4y"), socials, an X search link and the CA, then Price USD, Price in BTC, Liquidity, Market Cap, FDV, 5m / 1h / 4h / 24h changes, 24h Vol split Buy / Sell / Net, 24h Txns split Buy / Sell / Net; a Buy / Sell panel with Market / Limit, amount presets 1 5 10 50, Auto slippage, Preset 1 / 2 / 3 and an "Ultra" route tag; Token Info with Top 10 H., Dev H., Sniper H., Insider H., Bundlers H., Smart, 24h Traders, Holders, Total Fees and a Security entry; tabs Trades, Security, Holders, Top Traders, Dev Tokens, Markets, Positions; a trades table Time / Type / Value / Price / SOL / Paired Token / Trader with a Solscan link per row; a "Token Layout" switch Terminal / Compact / Classic; "Embed Chart" and "Alert" buttons; and the line "Improve this token's appearance with a Banner!" linking a form; the page also repeats two promo banners four times at the top.
Source: https://birdeye.so/token/So11111111111111111111111111111111111111112 rendered text (Birdeye, 2026-10-28, `terminals/birdeye/token-sol.md`), evidence: practice
For Stoker: the coin page - the "Paired Token" column in the trades table is exactly Stoker's pair model, so Stoker's trades tab should name the Quote Asset amount per trade; the banner CTA shows creators pay attention to how their coin's page looks, which is the launch form's image and links, so preview them there; the repeated promo banners are a reject.
Audience: traders; creators (the banner CTA); developers ("Embed Chart" and "Token API" links on the page).

### Birdeye's security panel and "Find Gems" are what analysts open first, and its Pro tier gates history
Finding: Solana Compass describes every token page as a live chart, a trade tape, liquidity by pool, top holders and the most active traders, "Find Gems" as the screener filtering by market cap, liquidity, volume, holder count, mint and freeze authority status and social links, and Pro ($45 a month) as lifting the trending list from 10 to 100 tokens, opening chart history past 30 days and adding CSV downloads; uwuu's review calls the security panel (mint authority, freeze authority, LP burn %, a composite trust score) "excellent" and notes its blind spot on new Token-2022 extensions.
Source: https://solanacompass.com/projects/birdeye (Solana Compass, 2026) and https://uwuu.ai/blog/birdeye-review (uwuu, 2026), evidence: opinion
For Stoker: the coin page's labels - Stoker's Quote Risk Labels already read the mint's authorities and extensions; a Reward Launch's transfer fee is a Token-2022 extension Birdeye misreads, so Stoker's own label ("Reward Launch, 3% tax pays holders") must sit next to any third-party score a trader brings.
Audience: traders; creators of Reward Launches.

### GMGN's token page is three columns with the trade module and security on the right
Finding: GMGN's docs lay the page out as a left column (Holding / Watchlist / Following lists, Trending and Pump lists), a main column (the chart with Price / MCap and SOL / USD toggles, Show / Hide trades markers, a dev-trade icon toggle, Multicharts up to 8, an Instant Trade window below the chart that is draggable, and the activity tabs Trading activity, Activity by wallet type, Traders, Holders, BC Owners and Position / Limit / Auto), and a right column (socials with a phishing warning, the Trading module with Buy / Sell / Auto, Token information with volume, buys, sells, net buy, liquidity, minting data, blacklist, burn ratio and "the probability of running away", and Pool information in the lower right); a "Sell inits" button sells just enough to recover the wallet's cost on the coin.
Source: https://docs.gmgn.ai/index/token-page-chart-multicharts-activity-trading-system.md (GMGN, 2026), evidence: practice
For Stoker: the coin page - "Sell initial" (sell to cost) is a small, honest feature for the trade panel's sell side; the wallet-type filters on the activity feed (smart money, KOL, whales, new wallets, snipers, developers, followed) are the feature, not the icons.
Audience: traders; KOLs (GMGN labels a KOL by a verified X account connected on GMGN).

### GMGN's security checks and labels, with their definitions
Finding: Solana checks are MintDisable (Yes is safe), Top10 hold (Yes when the top ten hold under 30%), Blacklist (No is safe), Burnt (the burn-pool percentage, 100% means the pool cannot be withdrawn), Rug probability (from how often the holders buy rug tokens) and Rug History (the creator's earlier rugs); wallet labels include DEV, Sniper (bought in the earliest blocks after the pool), KOL, Paper hand, Diamond hand, Suspected Insider (position holders sharing creation time, funding source and transfer time), Insider, Suspected phishing wallet (tokens received, not bought), Bundled Tx Wallet (several wallets' transactions in one bundle in the same block), Whale, Scammer (often buys rug tokens), Fresh Wallet, Bot wallet; GMGN's Bundle % is `bundler_trader_amount_rate`, the share of trading volume from bundled buys, not the share of supply held, its AI screening example caps it at 0.3, and the MELT study it cites found 36.5% of supply on average held by coordinated accounts across 41,470 pump.fun launches and 98.7% of creations carrying a dev buy.
Source: https://docs.gmgn.ai/index/ca-security-checks.md , featured-icon-definition.md and https://gmgn.ai/blog/what-is-a-meme-coin-bundle (GMGN, 2026), citing MELT https://arxiv.org/html/2602.13480v2 (research), evidence: practice and research
For Stoker: the coin page's trust grid - each figure needs its one-line definition on hover and its threshold stated (Stoker's ADR 0013 figures come from indexed trades, so say "bought within N slots of launch" rather than "snipers"); the Copy Protection label and the Creator's forward history are trust signals no terminal has, so give them the same cell treatment.
Audience: traders; creators, since "Rug History" per creator wallet is the kind of record Stoker's Ledger makes public in the honest direction (what each Creator was paid).

### Axiom's layout: seven top tabs, a three-column Pulse, an Instant Trade panel with hotkeys and presets
Finding: the top bar holds Discover, Pulse, Trackers, Perpetuals, Predictions, Rewards and Portfolio with a search box, a chain selector and the wallet balance; Pulse is three columns (New Pairs, Final Stretch, Migrated) with a protocol filter, fourteen numeric filters and a lightning Quick Buy on every row; a token page splits into a TradingView chart with trades, holders, top traders and the orderbook under it, and an Instant Trade panel on the right where buys are sized in SOL, sells in percent of the position, both fire on one click with no confirmation screen, hotkeys fire on Space plus a key, limit orders are set by dragging a line on the chart, and three presets P1 to P3 hold priority fee, tip, slippage and MEV mode as a set; fees are 1% a swap, tiered by cashback from Wood 0.95% to Champion 0.75%; the Coin Bureau review scores user experience 4.0 of 5 and warns it is "not beginner-friendly", and records ZachXBT's February 2026 allegation that an employee misused internal tools to track private wallets.
Source: https://axiompro.app/terminal (an affiliate's walkthrough, September 2026) and https://coinbureau.com/review/axiom-trade-review (Coin Bureau, June 2026), evidence: opinion; https://docs.axiom.trade/axiom/swap.md confirms Market, Limit, Convert, Migration Actions and Instant Trade, evidence: practice
For Stoker: the trade panel - presets as a named set (amount, slippage) rather than loose fields, and a "Buy at Graduation" option is a Stoker-native idea (Axiom's Migration Actions prove the demand); hotkeys and no-confirmation buys are for a later "pro" mode, if ever, because they conflict with first-timers.
Audience: traders; conflict with newcomers and with the owner's "everyone should like it", so keep one-click as an opt-in.

### Axiom's bundle rule and its holder map
Finding: Axiom flags four or more buy transactions in one block as a possible bundle and then drops any wallet whose next transaction is not part of a bundle, with no time limit, so a bundle a day after launch counts; every Pulse row shows top-ten, dev, sniper, insider and bundler shares plus holder counts and pro-trader share; the token page adds top holders' and top traders' average entry and exit, where their SOL came from, Trader Scan (bought, sold, balance, realised PnL, hold time per wallet) and Atlas, an InsightX holder map with live and historical views, beside Bubblemaps and CabalSpy tabs; the affiliate's own caveat is that "none of it gives a verdict".
Source: https://axiompro.app/token-scanner (affiliate walkthrough citing Axiom's docs and its Atlas announcement, September 2026) and https://docs.axiom.trade/trader-scan.md (Axiom), evidence: opinion and practice
For Stoker: the holders tab - bought, sold, remaining and realised PnL per holder from indexed trades is within reach and is the "who is about to sell" read traders want; a holder map is a later, heavier unit (the funder graph is already deferred in ADR 0013).
Audience: traders.

### Photon: presets without a confirmation, a colour-coded trade log, a configurable feed, and a collapse in use
Finding: Photon's signature is three or four preset SOL buy buttons on every token page that submit at the default slippage and tip with "no confirmation dialog", sell presets of 25 / 50 / 100%, a transaction log in green for buys and red for sells, token safety data beside the chart (mint authority, liquidity lock, top holder %, deployer activity), and Memescope, a launch feed where a trader can "choose and reorder every data point on a row and keep three presets per feed"; it charges a flat 1% and has no copy trading; DefiLlama's figures quoted by an Axiom affiliate put Photon at $0.5M of fees in the 30 days to September 2026 against Axiom's $52.3M, and Photon added Stonk, Pump and Meteora curve assets across "more than 400 quote pairs" that month.
Source: https://solanatools.io/photon.html and https://uwuu.ai/blog/photon-review (reviews, 2026), https://axiompro.app/photon (affiliate, September 2026), evidence: opinion
For Stoker: the trade panel and the board - presets and the green / red trade log are table stakes; the configurable row (pick and order the columns) is the respectful version of Jupiter's chip wall; and Photon quoting curve assets in non-SOL pairs shows terminals will list Stoker's pairs if the API makes the Quote Asset explicit.
Audience: traders; developers (the pair model in `/api`).

### BullX is gone and Padre became Pump.fun's Terminal; both hid the product behind a login
Finding: BullX authenticated through Telegram, listed security checks for mint authority, freeze authority and concentrated liquidity ownership, charged a flat 1%, reached about 260,000 monthly users and $12B of volume, and disabled trading on 2026-06-01 with no roadmap since; Padre was acquired by Pump.fun in October 2025 and renamed Terminal, its landing page is a sign-in wall reading "Up to 35% cashback. Fastest execution. Full control.", and its reviews describe Trenches discovery, an Alpha Tracker, TWAP, limit orders, a cashback of 10% by default and up to 35% through a referral, Turnkey-held keys, customisable colour themes, presets and dashboard layout.
Source: https://solanacompass.com/projects/bullx (Solana Compass, 2026), https://trade.padre.gg/ (captured text), https://uwuu.ai/blog/padre-terminal-review and https://crowinvesting.com/trading-solana-bots/padre-terminal-review (reviews, 2026), evidence: opinion and practice
For Stoker: the landing and every page - no login wall, no superlatives ("fastest", "built for winning"); a public launchpad's credibility is that anyone can read every coin, every trade and the Ledger without a wallet.
Audience: all; the owner's "everyone should like our platform" is the opposite of a terminal that opens on a sign-in form.

### DEX Screener: a KPI column, third-party audits, reactions, and paid Boosts that turn a ticker gold
Finding: the pair page shows the price in USD and in the quote token, liquidity, FDV and market cap, 5m / 1h / 6h / 24h changes, transaction count, volume and makers, buy and sell counts and volumes, watchlist and alert buttons, pair creation time, pooled assets, contract addresses and socials, audit results from Go+, QuickIntel and TokenSniffer, and sentiment reactions (rocket, fire, poop, flag); DEX Screener's own docs say every token is listed automatically at its first pool transaction, the Trending Score weighs volume, liquidity, transactions, unique makers, holders, page visitors, reactions, verified info ("especially those with Enhanced Token Info", a paid product) and a security audit, Boosts are paid packs that raise the score for 12 to 24 hours with the count shown next to the token, and 500 or more active Boosts give a "Golden Ticker" that "changes the token's symbol to a striking golden color"; Multicharts show up to 16 charts; FDV is `(total supply - burned supply) * price`.
Source: https://docs.dexscreener.com/trending.md , /boosting.md , /token-listing.md (DEX Screener, 2026), evidence: practice; https://www.bitbond.com/resources/dex-screener-the-ultimate-guide (Bitbond, 2025), evidence: opinion
For Stoker: the coin page's header - the price in the Quote Asset first and in USD second is DEX Screener's convention too, so Stoker's "priced in" wording is the industry's; reject Boosts and reactions, and keep the Curated section as the only promotion, because a trending score anyone can buy contradicts the "accountable" wedge; one "report" action (DEX Screener's flag) is worth keeping for Copy Protection disputes.
Audience: traders; marketers want Boosts, which is exactly why they should be refused and Curated offered instead.

### Trust and risk signals across the terminals

| Signal | Who shows it | How it is computed, where known | How it is rendered |
| --- | --- | --- | --- |
| Top 10 holders % | Jupiter, Axiom, GMGN, Birdeye, Photon | Jupiter excludes labelled liquidity pools and Meteora vaults but counts Jupiter Lock escrows; GMGN calls under 30% safe | A cell "Top 10 H. 19.59%", red icon when high; Pulse and AlphaScan chips coloured by threshold |
| Dev holding % | Jupiter, Axiom, GMGN, Birdeye, Photon | The deployer's wallet, which is a launchpad's own wallet when the pad deploys (Bags' authority shows 192,597 "devMints") | A cell "Dev H. 0%", GMGN icon "DEV holds 10%" |
| Snipers % | Jupiter, Axiom, GMGN, Birdeye | Jupiter: bought within the first three blocks; GMGN: "earlier blocks after pool created" | Cell plus a Sniper filter on the trades tab |
| Insiders % | Jupiter, Axiom, GMGN, Birdeye | Jupiter: bought in the first block or received from an insider (propagates); GMGN: held without buying, or shared creation time, funding and transfer time | Cell, green check under 5% on Jupiter; GMGN "Suspected Insider" icon |
| Bundlers % | Jupiter, Axiom, GMGN, Birdeye | Jupiter: a coordinated cluster in one block; Axiom: four or more buys in one block, dropping wallets that stop bundling, no time limit; GMGN: share of volume from bundled buys | Cell "Bundlers H. 0.02%"; Trades filter "Bundler 21" |
| Pro traders % | Jupiter, Axiom | Holders trading from terminals such as Axiom and GMGN | Cell "Pro Traders 12.71%" |
| Mint authority, Freeze authority | All of Jupiter, GMGN, Birdeye, DEX Screener (via audits), Photon, BullX | Read from the mint | "No Mint Auth" / "No Freeze Auth" cells; GMGN "MintDisable Yes" |
| LP burned or locked | GMGN, Photon, BullX, Birdeye | Burn-pool percentage; lock expiry | GMGN "Burnt 100%"; Birdeye LP burn % in the security panel |
| Honeypot, blacklist, buy/sell tax | GMGN (EVM mostly), DEX Screener audits | Third-party (GoPlus and others) | Yes / No rows; audit badges from Go+, QuickIntel, TokenSniffer |
| Paid listing ("Dex Paid") | Jupiter, Axiom | Whether the token paid DEX Screener's Enhanced Token Info | Cell "Paid Dex"; a Pulse filter |
| Verification and organic score | Jupiter | VRFD (1,000 JUP express verification); Organic Score estimates holders, volume and liquidity from genuine users | Verified badge or "Not Verified"; "Org Score 83.3" in the header |
| Rug probability and rug history | GMGN | Holders' habit of buying rug tokens; the creator's earlier rugs | Red rows in Token information |
| Age, holders, bonding curve % | All | Pool creation time; holder count; curve progress | Header age ("22h", ">4y"); AlphaScan age in green seconds |
| Dev tokens and migrations | Jupiter, Birdeye | Count of coins the dev created and bonded | A crown with a count; a Dev Tokens tab |
| Funding source | Axiom, GMGN, Jupiter holders tab | Where the top wallets' SOL came from | A column on Holders; Trader Scan |
| Holder map (clusters) | Axiom (Atlas by InsightX), GMGN (InsightX, Bubblemaps, Faster100X links), DEX Screener (bubble maps) | Transfers between holders, shared funders | A tab beside the chart or an outbound link |
| Trending score, Boosts, Golden Ticker | DEX Screener | Volume, liquidity, makers, holders, visitors, reactions, verified info, audit; paid Boost packs; 500+ Boosts | A count next to the token; a gold ticker |
| Reactions | DEX Screener | Rocket, fire, poop, flag counts | Emoji counters on the pair page |
| Smart money, KOL, whale labels | GMGN, Jupiter SmartMoney, Birdeye Trackers | Win-rate wallets; a KOL's verified X account; large balances | Icons on trade rows; leaderboards |
| Impersonation, reused icon | Jupiter | A visually similar icon on an unverified token; a known asset's name | A persistent banner linking the real asset; a caution badge |
| Holder rewards | Jupiter | Token-2022 transfer-fee coins whose pad converts fees for holders (StonkFun today) | An icon in the header |
| Token-2022 transfer fee | Jupiter | The mint's extension | A "Token2022" tag in the selector and a review line stating the rate |

Stoker's own signals that none of these show: the Copy Protection window and the "copy of X" label, the Creator Forward's paid history per coin, the Reward Launch's tax and payout asset, and the Platform Fee read from the chain.

### Chart and trade box layouts

| Site | Chart column width at 1440 | Trade box | Tabs under the chart | Phone |
| --- | --- | --- | --- | --- |
| Jupiter token page | 1005px, 70% (plus a 55px icon rail); chart about 380px tall | Right, 380px, 26%; Market / Limit / DCA; Sell then Buy boxes; full-width lime action | Transactions, My Holdings, My Orders, Holders (n), Top Traders, Dev Tokens; filter chips All / You / Dev / Followed / Sniper / Insider / Bundler | A sticky "Chart / Trade" pill; five-item tab bar |
| Hyperliquid | 900px, 62%; chart about 575px tall with a 55px drawing toolbar | Order book 270px (19%) then order form 270px (19%) on the right; Buy / Long filled, Sell / Short outlined; a definition list under the button | Balances, Positions, Open Orders, TWAP, Chase, Trade History, Funding History, Order History | Tabs Chart / Order Book / Trades / Funding; positions tabs below |
| Polymarket event | 925px, 64%; a 190px line chart | Right, 340px, 24%; Buy / Sell; Yes / No price buttons; amount chips; blue Trade | Outcome rows, each with Buy Yes and Buy No | Per Avark: event, probability, one action; order book one tap away |
| Titan Pro | 760px, 53%, between a 330px asset list (23%) and the box | Right, 315px, 22%; Market / Limit / Slice / Prime; Buy / Sell; Pay with; 5 / 10 / 25 / 50 / Max | Chart / Info; Holdings, Open orders, Order history | Not captured (the Swap page is a single box) |
| Birdeye token page | Not measured (text render); header band of figures above the chart | Right; Buy / Sell, Market / Limit, presets 1 / 5 / 10 / 50, Preset 1 to 3, Auto slippage | Trades, Security, Holders, Top Traders, Dev Tokens, Markets, Positions | A mobile app; three web layouts Terminal / Compact / Classic |
| GMGN (docs) | Centre column of three; Multicharts up to 8 | Right column: Buy / Sell / Auto, token info, pool info; an Instant Trade window below the chart, draggable | Trading activity, Activity, Traders, Holders, BC Owners, Position / Limit / Auto | A separate app with its own tutorial |
| Axiom (docs and walkthrough) | Centre, TradingView chart | Right, Instant Trade panel; buys in SOL, sells in %; P1 to P3 presets; hotkeys; limit lines dragged on the chart | Trades, holders, top traders, orderbook (with Trader Scan) | Browser on the phone, pinned to the home screen; no app |
| Photon (reviews) | Chart with a colour-coded trade log beside it | Preset buy buttons (3 to 4 SOL amounts), sell 25 / 50 / 100% | Holders, top buyers, dev activity, transaction feed | Web only |
| DEX Screener (docs and guide) | Chart left; Multicharts up to 16 | No native box: a "Trade on ..." chooser of DEXs | A KPI column: buys / sells, txns, makers, audits, reactions, Boost | A native app |
| Padre / Terminal | Behind a login wall | Per reviews: presets, TWAP, limit, cashback | Trenches feed | Not reachable |

### Features worth building on Stoker

1. A buys-versus-sells strip (24h Vol, Buys, Sells, Net) over a two-colour proportion bar at the top of the trade panel - proven by Jupiter's token page and Birdeye's header; sits on the coin page's `CoinMarket` header and, as a thin bar, on `CoinRow`.
2. The trust figures as a grid of label-over-value cells under the trade panel, each with a one-line definition and its threshold on hover - proven by Jupiter (nine cells), GMGN (definitions page) and Axiom (per-row chips); sits on the coin page under the trade panel, fed by ADR 0013.
3. Creator and Graduation markers on the chart, plus the connected wallet's own trades and an average-entry line for the top holders - proven by Jupiter's DB marker and "Top 100 Holders Avg Entry / Exit" lines; sits in `PriceChart`.
4. Filter chips on the trades tab (All, You, Creator, Early buyers) and a "Paired Token" amount per row - proven by Jupiter's chips and Birdeye's trades table; sits in `CoinMarket`'s Trades tab.
5. Holders with Bought, Sold, Remaining and realised PnL per wallet - proven by Jupiter's Holders tab, GMGN's Traders table and Axiom's Trader Scan; sits in `CoinMarket`'s Holders tab from the indexed trades.
6. Amount presets as chips in the Quote Asset (Polymarket's +$1 +$5 +$10 +$100, Birdeye's 1 / 5 / 10 / 50, Titan's 5% to Max of balance) and sell presets 25 / 50 / 100% plus "Sell to cost" - proven by Polymarket, Birdeye, Titan, Photon and GMGN's "Sell inits"; sits in the trade panel.
7. A fee and outcome definition list under the action button (you pay, you receive at least, Platform Fee, the Creator's share, slippage cap) - proven by Hyperliquid's Liquidation Price / Order Value / Fees list and Polymarket's terms line; sits under the trade panel's button and replaces any first-click modal.
8. "Fees paid" and "Creator earned so far" as coin figures - proven by Jupiter's Fees Paid column and header figure; sits on the coin page header and as a board sort, from the Ledger.
9. A watchlist star with local storage first - proven by Jupiter's browser-only watchlists and DEX Screener's watchlist and alerts; sits on `CoinRow` and the coin page header.
10. "Buy at Graduation" as a pre-set intention on a graduating coin - proven by Axiom's Migration Actions (buy or sell the instant a curve graduates); sits in the trade panel of a coin past a curve threshold, built on Stoker's graduation watch.
11. A dismissible Announcements toast with dated lines - proven by Hyperliquid; sits in the terminal layout, fed by `/announcements` (fee-change notices, #22).
12. A second quote on graduated coins with the saving shown - proven by Titan's quote comparison and its "trading edge" figure; sits in the trade panel (#84) using Jupiter and Titan's Portal.
13. Lock part of the supply at launch, shown as "Creator holds X%, locked until <date>" - proven by Jupiter Lock and by Jupiter's Top 10 H. counting locked escrows (so Stoker must label it itself); sits in `/launch`'s options and the coin page's pair cards.
14. "Send this coin to a friend" through Jupiter Send - proven by Jupiter Send (claim in Jupiter Mobile, auto-refund); sits in the account menu for creators and marketers.
15. A sticky "Chart / Trade" pill at 390 wide - proven by Jupiter's mobile token page; sits on the coin page's phone layout.
16. An "Embed this chart" snippet and an agent skill plus `llms.txt` for the read API - proven by Birdeye's Embed Chart and Token API links on every page, GMGN's AI Skills and Titan's Claude skill; sits on `/api` and the coin page's share menu (#83).
17. Issuer and launchpad badges welded to the ticker - proven by Titan (xStocks, Backpack, PreStocks, StonkFun logos) and Jupiter (launchpad icons); sits in `PairMark` for the Quote Asset's issuer.

### Take / Reject

Take:
- Label-over-value stat cells in one row under the coin's name (Jupiter, Hyperliquid, Titan): the eye scans one baseline; Stoker's coin page already does this, keep it and add the buy / sell split.
- Direction colour only on direction (price change, buy / sell, bids / asks), never on chrome (Hyperliquid, Titan): the red / green stays meaningful.
- Tabular, right-aligned figures in tables and a monospace-like treatment of addresses (every terminal): columns stop jumping, which Stoker's own trades-table trap (the `em`-sized time column) already taught.
- One filled primary action per panel, full width (Jupiter's lime Connect, Hyperliquid's teal Buy, Polymarket's blue Trade): the next step is never ambiguous.
- Presets as chips, with the amount in the asset the trader pays (Polymarket, Birdeye, Titan): fewer keystrokes, fewer typos on a phone.
- A definition list under the button and a terms line in plain text (Hyperliquid, Polymarket): disclosure where the decision is made.
- Empty states as one sentence under the tabs ("No open positions yet"): no illustration, no invitation to a feature that is not there.
- Explore before connecting (Polymarket's view-only mode, Jupiter, Titan, Birdeye all render without a wallet): every Stoker page already does; keep the board's controls visible on an empty database (settled).
- Subscript-zero prices ($0.0₅317 on Jupiter, Birdeye and Titan): the only readable way to show a memecoin price, and Stoker's coins start that small.
- Live numbers that roll rather than flash (Avark on Robinhood's counters): calm speed cues.
- The Quote Asset named per trade ("Paired Token" on Birdeye; price in the quote token on DEX Screener): Stoker's pair model is the industry's, so say it in the same place.

Reject:
- Five to nine trust chips on every feed card with no legend (Jupiter AlphaScan, Axiom Pulse): recognition over recall fails, and the owner's audiences beyond traders cannot read them; show one trust summary on cards and the full grid on the coin page.
- Pay-to-trend Boosts, a Golden Ticker and emoji reactions (DEX Screener): a bought score contradicts the accountable Ledger; Curated is Stoker's answer to promotion.
- Login walls and Telegram-only sign-in (Padre, BullX): a public launchpad is public; BullX's shutdown also shows what a wallet-less terminal costs its users.
- Marketing superlatives in the product ("fastest", "built for winning", "the home of onchain finance"): the owner's verdict was against vibe copy, and the slogan is settled.
- Repeated promo banners and an AI "Market Pulse" paragraph (Birdeye's banners four times at the top; Jupiter's Spot): noise above the fold that no audience asked for.
- One-click buys with no confirmation and hotkeys as the default (Axiom, Photon): fine as an opt-in pro mode later, wrong for first-timers, tweeters and NFT projects on the owner's list.
- Dark only (Titan, Hyperliquid, Axiom): Stoker follows the visitor's scheme (settled), and the terminals prove the dark look is not what sets a product apart.
- A layout or density switch (Birdeye's Terminal / Compact / Classic, Jupiter's Standard / Three-column): the owner closed the density toggle on 2026-10-08; one considered layout per page.
- Copy trading and wallet tracking as a launch feature (GMGN, Axiom, Padre): Coin Bureau and uwuu both call the signals noisy, and Stoker has no wallet-label data yet; "Followed" filters can wait.
- TradingView's gauge, calendar, heatmap, screener and market-overview widgets on Stoker pages: dashboards of other people's data are the vibe-coded look; only the symbol-level widgets belong, and only on the asset page.
