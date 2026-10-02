# StonkFun on X: full timeline and gap analysis

Collected 2026-10-01 from @LaunchOnSF through twitterapi.io.
Raw data is in `x-posts-full.json`.
Earlier, partial work: `x-posts.md` and `x-posts.json` (70 posts, issue #4).
We did not visit stonkfun.xyz; site facts below come from the pages already saved under `research/website/`.

Every claim is marked:
- **[post]**: verified from a post we collected (URL given).
- **[site]**: verified from a saved site file under `research/website/`.
- **[tg]**: from `research/social/telegram-group-insights.md` (the owner's private group export, summarised only).
- **[repo]**: verified in our own code, docs or issues.
- **[inferred]**: our reading of the evidence, not stated anywhere.

## Coverage

| Item | Value |
|---|---|
| Posts by the account collected | 1,121 |
| Original posts | 250 |
| Quote posts | 37 |
| Replies | 808 (107 of them self-thread continuations, 701 to other accounts) |
| Retweets | 26 |
| Date range | 2026-08-02 22:38 UTC to 2026-10-01 19:45 UTC |
| Profile post count shown by X | 1,359 (the earlier snapshot said 1,209) |
| Context: parent posts the account replied to | 685 of 701 (16 deleted or protected) |
| Context: replies by others under the 40 most-replied original posts | 1,250 (first two pages per post, up to 40 each) |
| Followers | 56,996 (54,102 on 2026-09-26) |

Method:
- `GET /twitter/user/last_tweets` with `includeReplies=true`, paginated to the end: 1,119 posts in 57 pages.
- Cross-check: `GET /twitter/tweet/advanced_search` with `from:LaunchOnSF` in two-day `since_time`/`until_time` windows from 2026-06-01 to 2026-10-02: 1,094 posts, every one already in the timeline set.
  The search found nothing before 2026-08-02.
- `GET /twitter/tweets` by id for the two posts in the old 70-post set that neither endpoint returned: the 2026-08-02 launch post (just past where both endpoints stop) and a 2026-09-21 retweet of @injective.
- `GET /twitter/tweets` in batches of 50 for the parent of every reply, and `GET /twitter/tweet/replies` for the 40 original posts with the most replies.

What could not be fetched, and why:
- About 238 posts counted by X are missing (1,359 shown against 1,121 collected).
  The timeline endpoint returns retweets only from 2026-09-24 onward, and advanced search never returns retweets, so retweets before 2026-09-24 are the likely bulk of the gap **[inferred]**.
  Deleted posts may also still count **[inferred]**.
  Every original post and reply that either endpoint could see is here; both endpoints agree on them.
- Nothing from before 2026-08-02: the account was "given to us from a community member" ([post](https://x.com/LaunchOnSF/status/2084055459959316572)), so older history belongs to its previous owner and is not visible.
- Replies by other people are sampled, not complete: only the first two pages under the 40 most-replied posts.

API cost:
- Balance before: 1,000,000 recharge credits plus 107,315 bonus credits (100,000 credits = $1).
- Balance after: 1,000,000 recharge credits plus 37,130 bonus credits.
- Spent: 70,185 credits, about **$0.70**, all from bonus credits.
  Timeline 14,100; search cross-check 17,280; parent lookups and the two missing posts 21,720; replies under top posts 17,085.

## Timeline of product changes and announcements

All dates are UTC.
Milestone and listing posts are summarised; there were 90 "you can now launch coins paired with X" listing posts, 53 rewards-paid milestones and 31 daily revenue posts.

| Date | What changed or was announced | Post |
|---|---|---|
| 2026-08-02 | Launch as "The RWA platform on Solana": every coin paired with an xStocks asset, creator fees, Raydium CLMM pools. | [2084046149359477077](https://x.com/LaunchOnSF/status/2084046149359477077) |
| 2026-08-02 | The X account was handed over by a community member (explains the 2023 creation date). | [2084055459959316572](https://x.com/LaunchOnSF/status/2084055459959316572) |
| 2026-08-03 | $STONK buyback-and-burn flywheel: 60% of platform revenue buys and burns STONK, 40% to the team; public revenue page. | [2084116492161880491](https://x.com/LaunchOnSF/status/2084116492161880491) |
| 2026-08-03 | LP explained: two one-sided locked CLMM positions, fee NFTs split between platform and creator. | [2084077946914943032](https://x.com/LaunchOnSF/status/2084077946914943032) |
| 2026-08-03 | Reward tokens: 4% pool fee, 85% paid to holders in the paired xStock, 15% to the platform; creators get no fee. | [2084398188232917250](https://x.com/LaunchOnSF/status/2084398188232917250) |
| 2026-08-04 | Rewards tracking page; $85K paid. | [2084532280354132285](https://x.com/LaunchOnSF/status/2084532280354132285) |
| 2026-08-04 | Launch bug: the 85% rewards position was not being created; currency-pair launches disabled, then fixed. | [2084791079606346079](https://x.com/LaunchOnSF/status/2084791079606346079) |
| 2026-08-05 | Fees claimed in the quote token only, ending supply drag from paying rewards in base tokens. | [2084942871375880528](https://x.com/LaunchOnSF/status/2084942871375880528) |
| 2026-08-05 | Pre-IPO quotes via PreStocks ($ANTHROPIC), then OpenAI, Polymarket, Anduril, Neuralink, Kalshi. | [2085099910924251338](https://x.com/LaunchOnSF/status/2085099910924251338) |
| 2026-08-05 | Any memecoin as a quote ("custom quote"). | [2085131388559237398](https://x.com/LaunchOnSF/status/2085131388559237398) |
| 2026-08-06 | PreStocks commits $25K of buybacks to the top 5 PreStocks-paired coins. | [2085206137264033835](https://x.com/LaunchOnSF/status/2085206137264033835) |
| 2026-08-07 | Public developer API: data endpoints, launch endpoint, docs. | [2085665517461811542](https://x.com/LaunchOnSF/status/2085665517461811542) |
| 2026-08-07 | Quote source labels on the UI (Custom, PreStocks, xStocks, Backpack) and security checks on custom quotes, after a coin was paired with a fake pump.fun "HTZ". | [2085714138123112781](https://x.com/LaunchOnSF/status/2085714138123112781) |
| 2026-08-07 | Rewards redesign: hold more than $20 to qualify; pot thresholds by market cap; rent paid from the pot. | [2085874861738496456](https://x.com/LaunchOnSF/status/2085874861738496456) |
| 2026-08-07 | Problems named: Meteora 2% pools undercutting the 4% reward pool; snipers; dev buys to be capped at 2.5%. | [2085820620785279356](https://x.com/LaunchOnSF/status/2085820620785279356) |
| 2026-08-08 | pump.fun launch path removed; Jupiter-verified tick and pump.fun marker on quotes; custom quotes need $100K market cap; holders list; copyable CA. | [2085907910106697797](https://x.com/LaunchOnSF/status/2085907910106697797), [2085925014168035697](https://x.com/LaunchOnSF/status/2085925014168035697) |
| 2026-08-10 | Rewards V3: Token-2022 transfer tax (4%, 2.925% to holders), atomic launch bundles, creator buys up to 2.5%, launch fee 0.29 SOL, top-10 ecosystem flywheel (0.084%). | [2086856725538185246](https://x.com/LaunchOnSF/status/2086856725538185246) |
| 2026-08-10 to 08-17 | Integrations: fomo, GMGN, Axiom, Trading Terminal. | [2086885566226878747](https://x.com/LaunchOnSF/status/2086885566226878747), [2087213032933913043](https://x.com/LaunchOnSF/status/2087213032933913043), [2087960282794545453](https://x.com/LaunchOnSF/status/2087960282794545453), [2089482215319032049](https://x.com/LaunchOnSF/status/2089482215319032049) |
| 2026-08-11 | Leveraged quotes (Hylo xSOL, xBTC); reward distributions had been "down for a bit"; Merkle distributor considered. | [2087322656009777455](https://x.com/LaunchOnSF/status/2087322656009777455), [2087145513141322052](https://x.com/LaunchOnSF/status/2087145513141322052) |
| 2026-08-12 | Rebrand to "Launch coins / paired with anything". | [2087381200318968312](https://x.com/LaunchOnSF/status/2087381200318968312) |
| 2026-08-16 | 2% fee tier for standard launches; fee-claiming API endpoint; new logo. | [2089123492235288667](https://x.com/LaunchOnSF/status/2089123492235288667) |
| 2026-08-18 | Airdrop Mode: up to 50% of a reward coin's supply to the top 100, 1,000 or 5,000 holders of the paired quote token, for transaction fees only. | [2089572281487941742](https://x.com/LaunchOnSF/status/2089572281487941742) |
| 2026-08-19 | Listed on DefiLlama; plan to move to LaunchLab to fix snipers and operator-wallet centralization. | [2089912120670343468](https://x.com/LaunchOnSF/status/2089912120670343468), [2090146753467294012](https://x.com/LaunchOnSF/status/2090146753467294012) |
| 2026-08-20 | 1% reward tier added and made the default (3% optional). | [2090411453039686134](https://x.com/LaunchOnSF/status/2090411453039686134) |
| 2026-08-22 | Roadmap admits no user docs yet and that UI and mobile "has not been a large focus". | [2090965215416311994](https://x.com/LaunchOnSF/status/2090965215416311994) |
| 2026-08-23 | Pinned relaunch post (641K views, the account's biggest). | [2091622537968955815](https://x.com/LaunchOnSF/status/2091622537968955815) |
| 2026-08-26 | Collectibles quote ($SV151 Pokemon packs). | [2092648074539663507](https://x.com/LaunchOnSF/status/2092648074539663507) |
| 2026-08-27 | Routing failures on "exotic" pairs; DefiLlama under-reports because Dune cannot price custom quotes. | [2093005361871560805](https://x.com/LaunchOnSF/status/2093005361871560805) |
| 2026-09-02 | Raydium ships the last program upgrade they needed; max dev buy raised to fight snipers; listings no longer pre-announced. | [2095068565476933690](https://x.com/LaunchOnSF/status/2095068565476933690) |
| 2026-09-03 | Switch to a meme "intern" voice; most replies after this are banter. | [2095583000583135733](https://x.com/LaunchOnSF/status/2095583000583135733) |
| 2026-09-05 | Live on Raydium LaunchLab: cheap permissionless deploys, bonding curve, CPMM after graduation. | [2096315023731675202](https://x.com/LaunchOnSF/status/2096315023731675202) |
| 2026-09-06 | Infrastructure upgrade after downtime; "site issues, reward backlogs, and creator backlogs are being fixed". | [2096681319040184643](https://x.com/LaunchOnSF/status/2096681319040184643), [2096627626156707962](https://x.com/LaunchOnSF/status/2096627626156707962) |
| 2026-09-06 onward | Quote listings at a pace of one to four a day (TAO, PENGU, DOGE, JTO, HYPE-backed, dozens of Backpack stocks, ETFs, BAYC's APE, Ethena, Zama, Ondo). | [2096467282927006147](https://x.com/LaunchOnSF/status/2096467282927006147), [2097750973410390326](https://x.com/LaunchOnSF/status/2097750973410390326) |
| 2026-09-10 | "Dividends" quote-tweet, followed by a disclaimer narrowing it to Reward Mode holders over $20. | [2097897344293642730](https://x.com/LaunchOnSF/status/2097897344293642730), [2097923560547250584](https://x.com/LaunchOnSF/status/2097923560547250584) |
| 2026-09-12 | About $500K of revenue misdated because CPMM pool claims were delayed. | [2098585373555503268](https://x.com/LaunchOnSF/status/2098585373555503268) |
| 2026-09-14 | Jupiter "StonkFun Launchpad Screener"; $STONK perps on Lighter and Phoenix; Gate listing. | [2100043332990972230](https://x.com/LaunchOnSF/status/2100043332990972230) |
| 2026-09-15 | Coins launched on StonkFun (ALLINU, PURR) become quotes themselves. | [2099909779242234075](https://x.com/LaunchOnSF/status/2099909779242234075) |
| 2026-09-16 | Dev update: Turnkey integrated, reward-swap logic rebuilt, "creator-fee + ecosystem flywheel forwarding improvements are still in progress". | [2100043334857392484](https://x.com/LaunchOnSF/status/2100043334857392484) |
| 2026-09-16 | Long legal disclaimer in a reply ("Stack RWAs" is not a promise); from 2026-09-18 every revenue and rewards post gets a disclaimer self-reply (31 in total). | [2100356401172541492](https://x.com/LaunchOnSF/status/2100356401172541492) |
| 2026-09-22 | Third-party JTX auto-compounds quote-asset rewards back into the coin. | [2102478119420772708](https://x.com/LaunchOnSF/status/2102478119420772708) |
| 2026-09-24 | "Million Dollar Club" of coins that paid $1M+ to holders (421 replies, the most of any post). | [2103159830769017061](https://x.com/LaunchOnSF/status/2103159830769017061) |
| 2026-09-26 | Rewards pipeline rebuilt into separate harvest, swap, plan and send stages; continuous payouts; pays in the coin itself when conversion lags. | [2103735185229369744](https://x.com/LaunchOnSF/status/2103735185229369744) |
| 2026-09-28 | "We're so back." after a two-day revenue dip; the post gives no reason. | [2104365783598149963](https://x.com/LaunchOnSF/status/2104365783598149963) |
| 2026-09-29 | Automatic HolderScan listing on graduation; upgraded pipeline extended to legacy CLMM coins. | [2105001802328686674](https://x.com/LaunchOnSF/status/2105001802328686674), [2105054120143184071](https://x.com/LaunchOnSF/status/2105054120143184071) |
| 2026-10-01 | Million Dollar Club coins verified on HolderScan; GOLD and Ondo quotes. | [2105711517304029543](https://x.com/LaunchOnSF/status/2105711517304029543) |

Headline numbers they posted **[post]**:
- Rewards paid: $85K (08-04), $1.5M (08-10), $5M (08-28), $25M (09-09), $50M (09-17), $85M (09-26).
- Volume: $1.2B (09-08), $2.6B (09-14).
- Daily revenue: $19K (08-04), $1.5M (09-06), peak $2.2M (09-11, inflated by the delayed claims), $2.09M (09-21), down to $526K (09-27), $1.16M (09-29).
- $STONK burned: 10% (08-27) to 18% (09-24) of supply.
- Combined reward-coin holders: 1M (09-13), 2M (09-21), 2.5M (09-26).

## Feature comparison

"We have it" reflects the merged v1 code (every v1 slice except #23, mainnet go-live), proven on the local chain only; nothing is live on mainnet yet.

| StonkFun feature or promise | Evidence | We have it? | Where in our repo |
|---|---|---|---|
| Launch on Raydium LaunchLab, bonding curve, CPMM after graduation | [post](https://x.com/LaunchOnSF/status/2096315023731675202) [site] `launch.md` | Yes | `packages/chain`, #13, ADR 0001 |
| Graduation at 85 SOL raised, priced per quote | [site] `launch.md`, `developers.md` | Yes | Graduation Target, ADR 0005, `GET /v1/quotes` |
| Pair with any quote that has a Raydium GlobalConfig | [post](https://x.com/LaunchOnSF/status/2085131388559237398) [site] `launch.md` (394 "Custom") | Yes | Quote Registry, `QuotePicker.tsx`; every GlobalConfig (571), refreshed every 5 minutes |
| Paste any mint as a "custom quote", with a request and approval flow | [post](https://x.com/LaunchOnSF/status/2086166548993954295) [tg] | No | Out of scope: a new GlobalConfig needs Raydium (PRD #5); `priceLaunch` refuses a mint outside the registry |
| Coins launched on the platform become quotes | [post](https://x.com/LaunchOnSF/status/2099909779242234075) | Partial | Only once Raydium creates a GlobalConfig; planned for the Platform Token only (PRD #5) |
| Quote source labels and safety checks | [post](https://x.com/LaunchOnSF/status/2085714138123112781), [post](https://x.com/LaunchOnSF/status/2085907910106697797) | Yes, more detailed | Quote Risk Labels (#11): freeze, pause, permanent delegate, transfer fee and hook, unverified, low liquidity (`apps/api/src/quotes/labels.ts`) |
| Minimum market cap before a token can be a quote | [post](https://x.com/LaunchOnSF/status/2085925014168035697) | Partial | A "low or unknown liquidity" label under $100K; labels never block |
| One to four new quote listings a day, announced on X | 90 listing posts, e.g. [post](https://x.com/LaunchOnSF/status/2097750973410390326) | Partial | We inherit every GlobalConfig Raydium creates automatically; no announcement flow |
| Dev buy bundled atomically with the launch | [post](https://x.com/LaunchOnSF/status/2086856725538185246) [site] `launch.md` | Yes | First Buy (#15), `packages/chain/src/launch.ts` |
| Dev buy paid in SOL, up to 75% of supply | [site] `launch.md` | Partial | First Buy is paid in the Quote Asset only; no cap other than "leave coins on the curve" |
| Pay with SOL on any pair | [site] `launch.md` (dev buy) | Partial | #19: routed through Jupiter, but no xStocks (no exact-out route) and no taxed quotes |
| Creator fee about 0.5% per trade on the curve | [site] `launch.md` | Yes, on-chain | Creator Fee 0.5%, claimed by the Creator (`ClaimCard.tsx`, `/creator/[address]`, ADR 0001) |
| Creator fee about 0.5% after graduation | [site] `launch.md` ("on the curve and after graduation") | No | ADR 0001 gives every post-graduation fee to the platform |
| Reward coins: 1% or 3% transfer tax for holders | [post](https://x.com/LaunchOnSF/status/2090411453039686134) [site] `launch-reward-modes.md` | Yes | Reward Launch 1%, 3% or 5% (#16) |
| Reward tax that can never change | [tg] (team says it cannot be made immutable) | Yes, better | `reward-tax-lock` revokes the fee-config authority after Graduation (`apps/api/src/rewardTax.ts`) |
| Rewards paid in the quote asset (ZEC, HYPE, NVDAx, Pre-IPO shares) | [post](https://x.com/LaunchOnSF/status/2103238404507066689) [site] `rewards.md` | No, by design | Paid in the same coin, never sold (ADR 0006, PRD story 32) |
| $20 minimum holding, pot thresholds by market cap | [post](https://x.com/LaunchOnSF/status/2085874861738496456) | Partial | Rules in coin units: 10,000-coin minimum, 100,000-coin round threshold (`packages/db/migrations/0009_reward_rounds.sql`) |
| Continuous, staged reward pipeline | [post](https://x.com/LaunchOnSF/status/2103735185229369744) | Partial | Reward Engine every 10 minutes, at most 200 payouts per run (`apps/api/src/rewards/engine.ts`) |
| Rewards page with totals and recent payouts | [post](https://x.com/LaunchOnSF/status/2084532280354132285) [site] `rewards.md` | Yes, more verifiable | `/rewards`, `/rewards/[wallet]`, `/rewards/rounds/[id]` with snapshot and payout transactions |
| Airdrop Mode: up to 50% of supply to top holders of the quote token, no purchase needed | [post](https://x.com/LaunchOnSF/status/2089572281487941742) | Partial | Airdrop of part of the First Buy to up to 200 listed wallets (`packages/contract/src/launchModes.ts`) |
| Platform token buyback and burn, 60% of revenue | [post](https://x.com/LaunchOnSF/status/2084116492161880491) [site] `revenue.md` | Yes, dormant | Burn (`apps/api/src/burn`), idle until the Platform Token exists (#23) |
| Ecosystem flywheel: top 10 by market cap, weighted | [post](https://x.com/LaunchOnSF/status/2086856725538185246) [site] `flywheel.md` | Yes, different rule | Flywheel: top N graduated by 24h SOL volume, equal shares, skips coins with no SOL route |
| Public revenue dashboard | [post](https://x.com/LaunchOnSF/status/2087645324714336512) [site] `revenue.md` | Yes | `/revenue`, `/burns`, append-only Ledger |
| Daily revenue and milestone posts | 31 revenue and 53 rewards posts | No | No social or announcement tooling; `/burns` is not linked from any page |
| DefiLlama listing | [post](https://x.com/LaunchOnSF/status/2089912120670343468) | No | Not started |
| Public developer API, launch endpoint, no key needed | [post](https://x.com/LaunchOnSF/status/2085665517461811542) [site] `developers.md` | Yes | `docs/api.md`, #21 |
| Per-IP rate limits on every endpoint | [site] `developers.md` (300/min, 25/min for launch prepare) | No | `apiKeyMiddleware` in `apps/api/src/apiKeys.ts` skips limits when no key is sent |
| Adopt launches built by third parties against the platform id | [site] `developers.md` | Partial | Curve rules force the shape on-chain and the Indexer watches our PlatformConfig (#9, #21), so a launch built elsewhere should be picked up; not tested as such [inferred] |
| Fee-claiming API | [post](https://x.com/LaunchOnSF/status/2089123492235288667) | Yes | `POST /v1/creator-fees/prepare`, `/docs/claim-creator-fee` |
| Terminal and aggregator integrations (Axiom, GMGN, fomo, Trading Terminal, Titan, Jupiter screener) | [post](https://x.com/LaunchOnSF/status/2087960282794545453), [post](https://x.com/LaunchOnSF/status/2100043332990972230) | No | Not started; LaunchLab pools are tradeable everywhere, but the platform is not named |
| HolderScan auto-listing on graduation | [post](https://x.com/LaunchOnSF/status/2105001802328686674) | No | Not started |
| Search and holders list, copyable contract address | [post](https://x.com/LaunchOnSF/status/2085925014168035697) | Partial | Holders and addresses on the coin page; board has quote and category filters but no text search |
| Permanent Arweave metadata | [site] `launch.md` | No | R2 plus Postgres for v1 (settled in `CLAUDE.md`) |
| Geo-blocking of restricted regions | [site] `restricted.md` | No, by decision | Disclaimer only (PRD #5 out of scope) |
| Long legal disclaimers on rewards and revenue | [post](https://x.com/LaunchOnSF/status/2100356401172541492) [site] `rewards-disclaimer.md` | Partial | Disclaimer gate before first launch or trade; no rewards-specific disclaimer page |
| Ecosystem tools: lockers that keep rewards, auto-compound | [post](https://x.com/LaunchOnSF/status/2102478119420772708) | No | Third-party built on their API; nothing comparable yet |
| Public custody story for fee and tax authorities | [post](https://x.com/LaunchOnSF/status/2100043334857392484) (Turnkey) | Yes, better | ADR 0004: cold admin key, Treasury sweep, tax authority revoked |
| Announced fee changes | none found | Yes, they have none | `/announcements`, a day's notice (#22) |
| Versioned reward rules with notice | none found (rules changed abruptly) | Yes, they have none | `POST /v1/operator/rewards/rules`, `REWARD_RULES_LEAD_SECONDS` |

## Gaps, ranked by how much they matter for a launch

1. **Holder Rewards are paid in the coin, not the quote asset.**
   Paying holders in the quote asset is StonkFun's whole growth story: "$12M of ZEC sent to ZCAT holders", "$2M of NVDAx", "$1M of HYPE", the Million Dollar Club, 2.5M combined holders ([post](https://x.com/LaunchOnSF/status/2103969112951255505), [post](https://x.com/LaunchOnSF/status/2105495840731324788), [post](https://x.com/LaunchOnSF/status/2103159830769017061)) **[post]**.
   Fans repeat it: "rewards are paid in actual $NEAR, not in more of the meme" ([post](https://x.com/haenko21/status/2102010512812707956)) **[post]**.
   Ours pay in the coin itself and are never sold (ADR 0006, PRD story 32) **[repo]**, which is a reflection token: it avoids the chart selling that holders hate, but drops the "hold a meme, earn a stock" hook that is the main reason people hold reward coins there **[inferred]**.
   This is a product decision, not a bug; it is the gap most likely to decide whether Reward Launches get used at all **[inferred]**.
2. **Creators earn nothing after Graduation; StonkFun promises about 0.5% for life.**
   Their launch page says "Approximately 0.5% of every trade, on the curve and after graduation, accrues to the creator" (`research/website/pages/launch.md`) **[site]**.
   ADR 0001 says "After Graduation we copy StonkFun ... so Creators earn nothing post-graduation" **[repo]**; on the evidence of the saved page, that premise is wrong.
   Our pitch to StonkFun creators (PRD #5: "the first target users are StonkFun creators hurt by the missed off-chain creator-fee payouts") is weaker if a creator whose coin graduates earns more there, even off-chain, than with us **[inferred]**.
   Each pool's CPMM creator and Fee Key owner are fixed at migration (ADR 0001), so this has to be decided before the first mainnet Graduation **[repo]**.
3. **Asset-paired coins are hard to buy with SOL on our site.**
   StonkFun takes the dev buy in SOL on any pair (`launch.md`: "Paid in SOL with the launch fee") **[site]**.
   Our First Buy is paid in the Quote Asset only, and Pay with SOL cannot route to xStocks (Jupiter has no exact-out route) or to taxed quotes (`CLAUDE.md`, #19) **[repo]**.
   Stocks are the category StonkFun leads with, so a Creator who wants an NVDAx pair must first acquire NVDAx elsewhere, and so must every buyer **[inferred]**.
4. **No terminal or aggregator presence.**
   StonkFun spent most of August getting Axiom, GMGN, fomo, Trading Terminal, Titan and a Jupiter screener to recognise its pairs, and says routing on "exotic" pairs failed until they did ([post](https://x.com/LaunchOnSF/status/2093005361871560805), [post](https://x.com/LaunchOnSF/status/2094352080618053837): "Every aggregator, terminal, and Raydium itself had to make changes") **[post]**.
   Some of that work now benefits any LaunchLab platform with custom quotes **[inferred]**, but none of those tools will show "Stoker" as a launchpad, filter for it, or link to our coin pages until we ask **[inferred]**.
   Most memecoin volume happens in those terminals, not on launchpad sites **[inferred]**.
5. **No anonymous rate limits on the API.**
   StonkFun limits every endpoint per IP (300 a minute, 25 for launch prepares) (`developers.md`) **[site]**.
   Ours limits only callers that send a key; a caller with no key is never counted (`apiKeyMiddleware`, `apps/api/src/apiKeys.ts`) **[repo]**.
   Every prepare call simulates on our Helius RPC, so an abusive script costs us money and can slow real users **[inferred]**.
6. **Airdrop Mode is much weaker.**
   Theirs sends up to 50% of a reward coin's supply to the top 100, 1,000 or 5,000 holders of the paired token, for fees only, and is pitched as onboarding a whole community ([post](https://x.com/LaunchOnSF/status/2089572281487941742)) **[post]**.
   Ours splits part of the Creator's First Buy across up to 200 wallets the Creator lists **[repo]**.
7. **Reward Engine throughput.**
   StonkFun had to rebuild its distributor twice when pools grew from about 5K to 75K-100K **[tg]**, and its 2026-09-26 rebuild split the pipeline into independently scaled stages ([post](https://x.com/LaunchOnSF/status/2103735185229369744)) **[post]**.
   Ours pays at most 200 payouts per 10-minute run, about 28,800 a day across every Reward Launch together (`runRewardRounds(..., maxPayouts = 200)`, cron `*/10`) **[repo]**.
   One StonkFun coin alone logged 678K payouts ([post](https://x.com/MINHxDYNASTY/status/2104064780067914021)) **[post]**; at even a small fraction of their scale our rounds would back up exactly as theirs did **[inferred]**.
8. **The Flywheel may skip most asset-paired coins.**
   Our Flywheel buys each pick with a Jupiter exact-out swap from SOL and skips coins it cannot route (`planSwap` in `apps/api/src/burn/engine.ts`) **[repo]**.
   With no exact-out route to xStocks, xStock-paired coins are likely always skipped, and their shares wait **[inferred, check on mainnet]**.
   StonkFun's flywheel bought 122 distinct coins, mostly asset-paired ([site] `flywheel.md`).
9. **Board search and "which coins are paired with X".**
   Users asked for exactly this ([reply](https://x.com/KalebOnChain/status/2102479880596471975)) and complained that StonkFun's search was broken ([post](https://x.com/LaunchOnSF/status/2087628248209346881)) **[post]**.
   We have a Quote Asset filter but no text search **[repo]**.
10. **No integrations for holders: DefiLlama, HolderScan, lockers, auto-compound.**
    These came from third parties building on StonkFun's API ([post](https://x.com/LaunchOnSF/status/2102478119420772708), [post](https://x.com/LaunchOnSF/status/2105001802328686674)) **[post]**; they will only come for us after volume does **[inferred]**.
11. **No public cadence of results.**
    StonkFun posts daily revenue, burns and reward milestones, 84 posts in two months **[post]**.
    Our `/burns` page is not linked from anywhere, and `/rewards` only from a Reward Launch's coin page **[repo]**.

Lower priority, already decided by the owner, noted only so the comparison is complete:
- Geo-blocking: StonkFun blocks restricted regions (`restricted.md`) **[site]**; ours is disclaimer only (PRD #5).
- Permanent metadata: StonkFun says Arweave (`launch.md`) **[site]**; ours is R2 for v1 (`CLAUDE.md`).
- Custom quotes for any mint: needs Raydium per quote (PRD #5).

## Their problems and complaints, and whether our design avoids them

The account almost never names a problem directly; most of these come from its own fix announcements and from the replies under its posts.
After 2026-09-03 the account replies mostly with emoji and jokes, so complaints in replies go unanswered on X **[post]**.

| Problem | Evidence | Does our design avoid it? |
|---|---|---|
| Creator fees forwarded off-chain broke for weeks | "site issues, reward backlogs, and creator backlogs are being fixed" ([post](https://x.com/LaunchOnSF/status/2096627626156707962), replying to [post](https://x.com/BigNadz93/status/2096626590692081746)); "Creator-fee + ecosystem flywheel forwarding improvements are still in progress" ten days later ([post](https://x.com/LaunchOnSF/status/2100043334857392484)) **[post]**; three weeks of complaints **[tg]** | Yes on the curve: the Creator Fee is paid by LaunchLab and claimed by the Creator (ADR 0001) **[repo]**. No earnings after Graduation at all (gap 2). |
| Creators could not find how to claim | "help people that deployed on standard mode claim their dev fees, there is no option to claim on the token page" ([post](https://x.com/deveroniii/status/2085440471787036738)) **[post]** | Yes: claim card on the coin and Creator pages, plus `/docs/claim-creator-fee` for claiming without our site **[repo]**. |
| Holder rewards missing or late | Distributions "down for a bit" ([post](https://x.com/LaunchOnSF/status/2087145513141322052)); "3 days nothing distributed" ([reply](https://x.com/king_hekker/status/2102740034314961221)); "rewards distribution is broken ... I haven't gotten any" ([reply](https://x.com/Wonders0x/status/2102520692675874911)); "huge amount is still not distributed (not first time)" ([reply](https://x.com/AkizaCrypto/status/2101380290367123836)) **[post]**; the most common question in the group **[tg]** | Partly. Rounds are resumable and never pay twice, every round and wallet is public, and a stalled round raises an alert (#17, #22) **[repo]**. Throughput is capped at 200 payouts per 10 minutes (gap 7), so the same backlog can happen at scale **[inferred]**. |
| The reward wallet sells the tax into the chart | "Can your rewards bots stop dumping" ([reply](https://x.com/scanmethod/status/2103980776048222335)); "you guys have to grape charts to feed those rewards" ([reply](https://x.com/Loading_ETH/status/2101808650763551224)); "when will you be addressing alternatives to the tax wallet selling" ([reply](https://x.com/scufffd/status/2101372128356417970)) **[post]** | Yes, completely: nothing is ever sold (ADR 0006) **[repo]**. The price is gap 1. |
| Reward rules changed without notice | $20 minimum and new pot thresholds "now live for all launches ... (existing ones as well)" the same day ([post](https://x.com/LaunchOnSF/status/2085874861738496456)) **[post]**; a per-round minimum introduced silently **[tg]** | Yes: versioned rules, a day's notice, and each round names the version it used **[repo]**. |
| Holders below the threshold got nothing | "Its likely due to not meeting the minimum for the distribution period" ([post](https://x.com/LaunchOnSF/status/2084902386678522338)) **[post]** | Partly: the rule is public and a wallet can look itself up (`/rewards/[wallet]`) **[repo]**; our minimum is in coins, so its dollar value swings with price **[inferred]**. |
| Users lost SOL to bad routing and wrong pools | "swapped 3 sol for 1$ worth" ([post](https://x.com/spil8x/status/2084420417884766405)); "lost 13 sol ... routed to the wrong pool" ([post](https://x.com/TobxG/status/2084482384485839069)); "i swapped through jupiter and lost 20 sol" ([post](https://x.com/groff/status/2085377990762872908)); a coin "shows 50% tax" on a terminal that picked the wrong pool ([post](https://x.com/LaunchOnSF/status/2085377752111177908)) **[post]** | Partly. On our site every trade is server-built with a slippage limit and the wallet-side minimum (`CLAUDE.md`, #19) **[repo]**. Terminals and aggregators are outside our control. |
| Fake or look-alike quote tokens | A coin "paired to the pump one" instead of real HTZ stock ([post](https://x.com/eebder_sol/status/2085708819338846438)); a Solana co-founder asking whether a 2Z pair was real ([reply](https://x.com/Austin_Federa/status/2097396354137890885)); the SV151 collectible quote called a scam ([reply](https://x.com/Packratdotfun/status/2092737846465466784)) **[post]**; a fake PEPE whitelisted **[tg]** | Mostly. Only Raydium GlobalConfigs can be quotes, so an arbitrary pump.fun mint cannot be, and every quote carries Quote Risk Labels including "unverified" (#11) **[repo]**. Labels never block, so a GlobalConfig for a dubious token would still be launchable **[repo]**. |
| Snipers and bundles on new coins | "one guys just sniping 15% of every launch with 0 downside" ([post](https://x.com/praiseonlyone/status/2085908109843673096)); snipers named as "the biggest issues and user concerns" ([post](https://x.com/LaunchOnSF/status/2095068565476933690)) **[post]** | Partly. The First Buy lands in the launch transaction, so nothing trades before it **[repo]**. No bundle detection or display **[repo]**. |
| Pre-announced listings were front-run | Stopped pre-announcing because "it leads to people finding ways to take advantage" ([post](https://x.com/LaunchOnSF/status/2095068565476933690)) **[post]** | Not applicable yet: we do not announce quotes. Our registry adds a new GlobalConfig within 5 minutes, so watchers of Raydium's configs get the same head start on us **[inferred]**. |
| Downtime, lag, broken search, broken mobile link | "laggy, bugs, issues around scale" ([post](https://x.com/LaunchOnSF/status/2085146959636037654)); "downtime issues should now be resolved" ([post](https://x.com/LaunchOnSF/status/2096681319040184643)); search bug ([post](https://x.com/LaunchOnSF/status/2087628248209346881)); mobile wallet link ([post](https://x.com/GibbyNeutron28/status/2084488567448039539)); chart and data freezing ([post](https://x.com/TheFalconTez/status/2102916127563071950)) **[post]** | Partly. Browser tests at 1440 and 390 px with pixel baselines, alerts on failed jobs **[repo]**. Nothing is load-tested, the board polls every 4 s, and there is no status page **[repo]**. |
| Revenue misreported | About $500K booked a day late after "delayed CPMM pool claims" ([post](https://x.com/LaunchOnSF/status/2098585373555503268)); DefiLlama under-counted because Dune cannot price custom quotes ([post](https://x.com/LaunchOnSF/status/2093005361871560805)) **[post]** | Partly. The Ledger is append-only and tied to signatures, and a failed Fee Collector run raises an alert **[repo]**. No DefiLlama adapter yet. |
| Marketing that overclaims | "StonkFun will distribute dividends to every token holder" followed by a disclaimer narrowing it ([post](https://x.com/LaunchOnSF/status/2097897344293642730), [post](https://x.com/LaunchOnSF/status/2097923560547250584)); burned value "at current value" called a hedge ([reply](https://x.com/sprunky_eth/status/2098308644144128216)); rewards totals valued "at each token's current price", "not its price when the payout landed" (`rewards.md`) **[post]** **[site]** | Yes if we keep to it: the Ledger values revenue in SOL at the time, and Burns record what was actually spent (ADR 0006) **[repo]**. Our own posts will need the same discipline. |
| A single hot operator wallet | Move to LaunchLab sold as fixing "operator wallet centralization" ([post](https://x.com/LaunchOnSF/status/2090148500470485386)); Turnkey added later ([post](https://x.com/LaunchOnSF/status/2100043334857392484)) **[post]** | Better: cold admin key, sweeps to a Treasury, and the Reward Tax authority given up after Graduation (ADR 0004, `rewardTax.ts`) **[repo]**. Day-to-day roles still share one hot wallet **[repo]**. |
| Founder as support | 701 replies to other accounts, but after 2026-09-03 almost all are one-liners; a detailed bug report got "Passed your concerns to the team" ([post](https://x.com/LaunchOnSF/status/2102923496213106849)) **[post]**; 1,243 team-directed questions against 433 team replies **[tg]** | Partly. Users can check their own rewards, rounds and fees without asking **[repo]**. No support channel, FAQ or status page **[repo]**. |
| Volume falling off after the peak | Daily revenue from $2.09M (2026-09-21) to $526K (2026-09-27), then "We're so back." ([post](https://x.com/LaunchOnSF/status/2104365783598149963)) **[post]**; pump.fun added custom quotes on 2026-09-09 (`research/competitors/README.md`) | Not a design question. Context: we would launch into a category that has peaked once already **[inferred]**. |

## Where we can do better

Each idea names the evidence it answers.

1. **Pay Creators after Graduation, on-chain.**
   StonkFun promises creators about 0.5% forever but forwards it from its own wallet, and that forward is what broke ([post](https://x.com/LaunchOnSF/status/2100043334857392484)).
   "Creators earn on every trade, before and after Graduation, and the chain pays them" would beat them on both counts.
   `CLAUDE.md` notes the deployed CPMM's `collect_creator_fee` takes a `creator_fee_share` PDA keyed by creator and CPMM config, which suggests the deployed CPMM can share its creator fee on-chain **[inferred, needs a spike]**.
   If it cannot, giving the Creator the Fee Key NFT (about 0.2% of volume, an option ADR 0001 already lists) is on-chain today.
2. **Offer quote-asset payouts without chart dumping.**
   The demand is for being paid in ZEC, HYPE or NVDAx ([post](https://x.com/LaunchOnSF/status/2103238404507066689)); the complaint is the bot's large, unpredictable sells ([reply](https://x.com/scanmethod/status/2103980776048222335)).
   A choice fixed at launch, like the tax rate (coin or Quote Asset), with Quote Asset payouts sold in small slices on a published schedule shown on each round page, would answer both **[inferred]**.
   Even StonkFun now falls back to paying in the coin when selling lags ([post](https://x.com/LaunchOnSF/status/2103735185229369744)), so a hybrid is accepted by their users.
3. **Let people buy any pair with SOL.**
   Use an exact-in route to the Quote Asset followed by a curve `buy_exact_in` with what arrived, returning dust to the trader, for quotes that have no exact-out route (xStocks) **[inferred]**.
   Apply it to the First Buy too, so a Creator can launch an NVDAx pair holding only SOL, as StonkFun's launch page offers (`launch.md`).
4. **Market what we already have that they do not.**
   Every Reward Round's snapshot and payout transactions, a wallet's own reward history, versioned rules with notice, an unchangeable Reward Tax and announced fee changes answer the most common complaints on their timeline directly.
   None of that is visible from our header today: `/burns` has no link and `/rewards` is only reachable from a Reward Launch.
5. **Inherit their listings for free.**
   GlobalConfigs are shared across LaunchLab platforms, and our Quote Registry picks up each new one within 5 minutes **[repo]**.
   Every quote StonkFun lists through Raydium (90 listing posts in two months) becomes launchable with us, with Quote Risk Labels they do not show **[inferred]**.
   A "new Quote Assets" feed on the board and a bot post per listing would turn that into marketing at no listing cost.
6. **Find coins by their pair.**
   Add text search to the board and a page per Quote Asset ("every coin paired with NVDAx"), which StonkFun users asked for ([reply](https://x.com/KalebOnChain/status/2102479880596471975)).
7. **Price exotic quotes where Dune cannot.**
   Our Ledger already values every fee in SOL at the Quote Registry's prices; a DefiLlama adapter that reads `/v1/revenue` would report correctly from day one, which StonkFun has struggled with for a month ([post](https://x.com/LaunchOnSF/status/2096754746891587779)).
8. **Make Airdrop a distribution tool.**
   Let a Creator airdrop to the top holders of the Quote Asset (read from the chain at launch), not only to a pasted list, which is what made Airdrop Mode one of their most-replied launches ([post](https://x.com/LaunchOnSF/status/2089572281487941742), 88 replies).
9. **Show bundles and snipers instead of fighting them blind.**
   Their answer was larger dev buys and "measures we won't explain" **[tg]**; flagging on each coin page how much supply the first few slots' wallets took would answer the sniper complaints with facts **[inferred]**.
10. **Ask the terminals early.**
    StonkFun's integrations took two to three weeks each; Axiom, GMGN, fomo, Trading Terminal, Jupiter's screener and HolderScan all now know how to read a LaunchLab custom-quote platform, so the ask is smaller for us **[inferred]**.

## What should block or change the mainnet launch

No hard blocker was found in the posts: nothing StonkFun announced breaks an assumption our v1 code relies on, and its move to LaunchLab, its 1.25% curve fee and its 85 SOL graduation match ours.

Three things should change, or be decided on purpose, before mainnet:

1. **Decide post-graduation Creator earnings before the first coin graduates.**
   ADR 0001's premise that StonkFun gives creators nothing after graduation is contradicted by StonkFun's own launch page (`research/website/pages/launch.md`: "on the curve and after graduation") **[site]**.
   Each pool's fee owner is fixed at migration, so coins that graduate under the current setting can never be changed **[repo]**.
2. **Add anonymous rate limits to the API before it is public.**
   `apiKeyMiddleware` lets any caller without a key through uncounted, and the prepare endpoints run simulations on our paid RPC **[repo]**.
   A Cloudflare rate-limiting rule on `/v1/*prepare*` and `/v1/*quote*` would do it without code **[inferred]**.
3. **Choose the Holder Reward payout asset knowingly, and say it plainly in the launch copy.**
   Paying in the coin is the PRD's decision, but quote-asset payouts are what StonkFun's reward holders came for (2.5M combined holders, [post](https://x.com/LaunchOnSF/status/2103995871637774593)) **[post]**.
   Reward Launches made under one payout rule should not have it changed later, so this is cheapest to settle before the first Reward Launch **[inferred]**.

Watch items, not blockers:
- Reward Engine throughput (200 payouts per 10 minutes) is fine for a quiet start and will need the staged design StonkFun moved to if Reward Launches take off.
- Run the first mainnet Flywheel against an xStock-paired coin to confirm whether it is skipped.
- Pay with SOL to xStocks is the most visible missing path for an "any asset" launchpad on day one.
