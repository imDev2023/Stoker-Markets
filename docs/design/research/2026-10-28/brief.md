# Shared brief for the Stoker design research agents (issue #130, 2026-10-28)

Read this whole file before doing anything.

## What Stoker is

Stoker (ticker STOKER, domain stoker.markets, public repo imDev2023/Stoker-Markets) is a Solana launchpad on Raydium LaunchLab plus a trading terminal.
Its one idea: "No one picks your pair. You do." A creator launches a coin priced in ("paired with") any asset Raydium quotes: SOL, a stablecoin, a tokenized stock (xStocks, PreStocks, Backpack, Tessera), about 600 assets on mainnet.
The coin trades on a bonding curve until it graduates to a Raydium CPMM pool. The trader pays 1% on the curve (the Platform Fee) and 1.25% after graduation.
Creators earn half of what the platform collects on their coin's trades (about 0.5% of every trade) forwarded automatically in the Quote Asset, nothing to claim, every payment on a public Ledger.
Reward Launches carry a 1 to 5% transfer tax that pays holders in rounds (Holder Rewards). The Burn buys and burns the platform token with revenue. Copy Protection refuses a copy of a launched coin's name, ticker or image for seven days.
Curated launches (platform-approved, bought by STOKER stakers) are planned. A public read API with keys exists (/api is its reference).
The brand: the character is a salamander stoker (plus a "Furnace Cat"); the mark is a heating ring in an amber-to-ember "heat" ramp; the words are "coin" never "token", "Stoke a coin" on every launch button, "Paired with" and "priced in". The site is Next.js, a pure client of a Cloudflare Worker API.

## The site's parts, by name (use these names)

- Header: a 72px translucent bar; the mark far left; a floating "pill" of links at its middle (Explore, Curated, Assets, Rewards, Stats, Developers); far right a "gooey" search, a light/dark toggle, the filled "Stoke a coin" button, the wallet/account. Under 1300px a menu button and a full-height overlay.
- Landing `/` (the "spacious" home): Hero (headline, lede, two buttons), Stats (four figures), Trending (coins), an "invitation" empty state when the database is empty.
- The terminal (every other page, denser): the board `/coins` (search, sort, an "asset rail" of kinds and assets as the one "Paired with" control, one row per coin), the coin page `/coin/[mint]` (chart, trade panel, pair cards, trades and holders tabs, curve progress, labels), the asset directory `/assets` and the asset page `/assets/[mint]` (a Quote Asset: its coins, its market chart), the launch flow `/launch` (launch type radio cards, name/ticker/image/links, Quote Asset chooser, First Buy, a summary with fees and "You earn"), rewards `/rewards` (rounds, holder rewards), stats `/revenue` and `/burns` (the Ledger), `/curated`, `/api` (the developer reference), `/creator` (the connected wallet's own earnings), `/announcements`, 404.
- Footer: links, socials (X, Telegram, GitHub), the disclaimer.
- Both light and dark follow the visitor, with a toggle. Reviewed at 1440 and 390 wide.

## The audiences the platform must attract (the owner's list)

Traders, creators, marketers, KOLs, influencers, tweeters, NFT projects. "Everyone should like our platform."

## The owner's verdict (2026-10-28)

"It looks completely vibe-coded and isn't thoughtful. I want proper, professional design principles, including the navbar, hero sections, footers, everything. If we have to redo the whole website, we can redo the front end from scratch."
"Come up with proper research on your own into the UI/UX design principles for the project we're building. Take inspiration from the links I've pasted, but also gather fresh UI/UX design insights from professionals."
"Take into account the psychology of traders, creators, and marketers."

## Hard constraints

- NEVER fetch stonkfun.xyz or any stonkfun URL (its terms ban scraping). Its saved pages, screenshots and social analyses are local in the private repo `/Volumes/Farhan/Work Folder/Dev/AI/Stoker-Markets-research/research/` (website/, social/). Never copy its copy or branding into findings as text to reuse; describe what it does.
- Never print the value of any API key. Load keys in a subshell: `( set -a; source ~/.config/env/global.env; set +a; ... )` and reference them as `$JINA_API_KEY`, `$TAVILY_API_KEY`, `$BRAVE_API_KEY` inside that subshell.
- Paths contain spaces: always quote them. `grep` is aliased to ugrep in this shell: use `/usr/bin/grep`.
- Put downloaded page text under your own folder inside the scratchpad research folder (one folder per site), never under the repo.
- Do not edit anything under the repo `/Volumes/Farhan/Work Folder/Dev/AI/stonk-fun-solana`. Read it freely.
- No em dashes or en dashes anywhere in what you write: use a plain hyphen.
- Write each full sentence on its own line in the markdown you produce.

## Tools

- Read a page as markdown (renders JS apps): `curl -sS -m 60 -H "Authorization: Bearer $JINA_API_KEY" -H "X-Return-Format: markdown" "https://r.jina.ai/https://example.com/path"`. Add `-H "X-With-Links-Summary: true"` to get the page's links at the end (useful for docs sites). If a page is a JS app that needs time, add `-H "X-Timeout: 20"`. Save each response to a file, then read the parts you need with sed/head, since pages can be long.
- Search: `curl -sS -m 60 -X POST https://api.tavily.com/search -H 'Content-Type: application/json' -d "{\"api_key\": \"$TAVILY_API_KEY\", \"query\": \"...\", \"max_results\": 8, \"search_depth\": \"advanced\", \"include_raw_content\": false}"`. Pipe through `python3 -I -c` or `jq` to list title, url, content.
- Backup search: Brave `curl -sS -H "X-Subscription-Token: $BRAVE_API_KEY" -H "Accept: application/json" "https://api.search.brave.com/res/v1/web/search?q=...&count=10"`.
- Prefer primary sources: the design system's own docs, the research firm's own article, the company's own design blog, the paper itself. Mark each finding's evidence quality: `research` (a study or a research firm's test), `practice` (a design system or a practitioner's documented rule), `opinion` (a blog post or a trend piece).

## Output format for your report

Write one markdown file at the path your prompt gives you.
Structure: a short "What I read" list (URL, one line each) at the top, then the findings grouped as your prompt asks.
Each finding is a block:

```
### <short title>
Finding: one to three sentences, specific and factual.
Source: <URL> (<author or organisation>, <year if known>), evidence: research | practice | opinion
For Stoker: <the named part of the site> - what to do, concretely.
Audience: <which of the audiences this serves>, and any conflict with another audience.
```

Be concrete: a measurement, a layout, a rule, a number, a quote of at most one sentence. No generic advice ("make it clean and modern").
When you reply to the main agent, give at most 400 words: the file path, the ten most important findings in one line each, and anything you could not reach.
