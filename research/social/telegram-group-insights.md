# StonkFun private Telegram group: insights

Source: the owner's export of the private StonkFun community group (175,060 messages, 2026-07-24 to 2026-09-26 20:19 UTC), in the gitignored `telegram-group/` folder.
Numbers come from `telegram_insights.py`, which streams the export and writes only aggregates to `telegram-group-stats.json`.
Examples below are paraphrased and cited by message id and date only; no usernames, user ids or wallet addresses are reproduced.
Written for GitHub issue #3 (Multica PAND-428).

## Headline findings

1. **Creator-fee forwarding was the biggest trust failure.**
   The advertised ~0.5% creator fee on "standard" coins is paid off-chain, and it broke for roughly three weeks after the LaunchLab release (first complaints 2026-09-06, a partial backfill on 2026-09-19, and people still missing payouts on 2026-09-23 to 09-25).
   Creator-fee talk rose from 1.0 to 2.1 messages per 1,000 user messages, peaking at 122 messages in the week of 2026-09-07.
   An asset-paired rival should pay creators on-chain from day one.
2. **Holder rewards drive most of the support load.**
   "Where are my rewards?" is the most common question by far (857 messages from 383 people).
   Complaints about missing or late rewards rose from 6.6 to 8.7 per 1,000 user messages after LaunchLab, and peaked at 355 in the week of 2026-09-14.
   The team rebuilt its rewards distributor twice in two weeks.
3. **The rewards distributor's selling is itself a product problem.**
   Users complained first that the distributor dumped big "clips" into charts, then that it sold too slowly.
   Traders learned to wait for the clip and then buy.
   The team changed thresholds, per-round minimums and even paid out in the base token to avoid selling.
4. **Pairing demand is real but concentrated.**
   In 3,321 new-pair cards posted by the group's pair-feed bot (2026-09-06 onward), the quote asset was $STONK in 24%, gold (GLDx) in 8%, PEPE in 6% and SOL in only 4.5%.
   The long tail was ZEC, XMR, JTO, HYPE, NEAR, WBTC, community tokens, oil, SanDisk and NVIDIA or SPY xStocks.
5. **Tokenized-stock talk faded after the novelty wore off, and crypto quotes plus community-token quotes took over.**
   Stock and xStock mentions fell from 15.0 to 5.3 per 1,000 user messages after LaunchLab, and Pre-IPO (PreStocks) talk fell from 6.6 to 1.1.
   Requests shifted towards community tokens asking to become quotes ("let us pair against our token").
6. **Listing speed and sniping collide.**
   Pre-announced stock listings such as GPRO (2026-09-01) were sniped.
   People scraped the issuer's lists for new quote mints, so the team stopped pre-announcing listings.
   Quote vetting also slipped: a fake PEPE from a known rugger was whitelisted as a quote (#206031, 2026-09-18).
7. **Members report that pump.fun shipped custom or stock pairings around 2026-09-09.**
   The group mocked it, and one member criticised the team for answering with about 20 new coins at once (#138531, 2026-09-10).
   Asset pairing is no longer unique to StonkFun; this needs to be checked on-chain before we treat the niche as open.
8. **The group is a shilling floor, not a support desk.**
   12.6% of user messages contain a contract address, 35% are under 20 characters, and the top 100 of 3,351 posters wrote 65% of user messages.
   Moderation runs on bots (697 `/report` uses, 166 bans, 187 "no shilling below $10K market cap" replies).
   Only 433 of 1,248 team posts reply to a user, against 1,243 questions aimed at the team.
9. **Volume followed product events, not marketing.**
   Activity peaked at about 3,300 messages a day in mid-August and sank to 650 to 1,000 a day during the LaunchLab wait.
   After the public LaunchLab release on 2026-09-05 it jumped to about 4.5x the pre-release week's average (peak 8,953 on 2026-09-06, 501 active posters on 2026-09-11).
   It has been falling since, to about 2,600 to 3,000 a day on 2026-09-25 and 09-26.
10. **Geo-blocking and regulation barely register.**
    Only 26 VPN mentions and about 46 geo or regulatory messages appear in total, mostly about the site not loading in some regions.
    News of the SEC's tokenized-stock exemption was treated as bullish, not as a threat.

## Data and method

- 175,060 messages: 168,747 from users, 1,248 anonymous admin posts (the group posting as itself), 4,874 from 2 bot accounts, and 191 service messages.
- Bots were detected by behaviour (at least 30% of an account's messages match bot templates such as new-pair cards, "reported to admins", "User was banned", welcome lines and rule replies), not by id.
- Anonymous admin posts are the team's voice; team members or moderators posting from personal accounts are counted as users.
- Themes are regex matches over each user message; a message can hit several themes, and counts are indicative rather than exact.
- "Per 1,000" compares the 49,442 user messages before 2026-08-28 with the 119,305 from 2026-08-28 on.
- Coverage gaps:
  - Message ids run to about 245,000, so roughly 30% of ids are absent (deleted messages and cleared history).
  - Admin posts before 2026-08-23 were cleared; the team said so on 2026-08-23 (#68259).
  - Bot messages only survive from 2026-09-06.
- Dates: `research/README.md` puts the first LaunchLab pools at 2026-08-28, but the chat shows the public release on 2026-09-05; the admin said on 2026-09-03 that the update was live in production but not yet public (#85198).

## 1. Volume over time

| Period | Messages per day | User messages per day | Active posters per day |
|---|---|---|---|
| 2026-07-24 to 08-27 (launch, CLMM era) | 1,417 | 1,413 | 108 |
| 2026-08-28 to 09-04 (LaunchLab switch, pre-release) | 1,155 | 1,122 | 119 |
| 2026-09-05 to 09-26 (LaunchLab public) | 5,283 | 5,015 | 332 |

- The first week after the 2026-07-23 launch was quiet (60 to 240 messages a day), and it nearly died on 2026-07-31 and 08-01 (9 and 4 messages).
- The team later blamed X flagging its new account in week one (#73392, 2026-08-27).
- The first X post on 2026-08-02 started a surge: from 432 messages that day to 3,309 on 2026-08-11, with up to 273 active posters.
- A slow bleed followed while users waited for LaunchLab: 650 to 1,000 messages a day from 2026-08-21 to 08-31, and only 376 on 2026-08-28, the switch date.
- The hyped GPRO stock listing on 2026-09-01 doubled activity for a day (1,912).
- The public LaunchLab release caused the step change: 3,934 messages on 2026-09-05, 8,953 on 09-06, and 6,400 to 8,600 a day to 2026-09-12.
- After that came a steady decline to about 2,600 a day by 2026-09-25 and 09-26, as the rewards and creator-fee problems dragged on.
- Weekly user messages: 16,066 (week of 08-03), 18,211 (08-10), 10,331 (08-17), 5,366 (08-24), 19,679 (08-31), 48,852 (09-07, 1,344 distinct posters), 28,184 (09-14), 20,659 (09-21).

## 2. Who talks

- 3,351 distinct users posted; 827 posted exactly once and 257 posted 100 or more times.
- The top 10 posters wrote 27% of user messages and the top 100 wrote 65%.
- The team speaks as the anonymous group identity: 1,248 posts, or 0.7% of all messages.
- Of those team posts, 433 are direct replies to users and 155 were pinned.
- Pins are mostly X links: 118 of 155 pins are bare links to @LaunchOnSF posts, and 35 of them say "NEW LISTING".
- Two bots produce 2.8% of messages:
  - A new-pair feed card showing name, ticker, quote, market cap, 24h volume and rewards paid, with links to the site and terminals.
  - A command and moderation bot (`/ca`, `/website`, `/flywheel`, `/report`, welcome messages, ban notices, flood mutes and the shilling rule).
- Content shape: 21,318 user messages (12.6%) carry a contract address, 58,604 are under 20 characters, and 15,703 contain a question mark.
- Hype and price talk (ATH, send it, jeets, dumps) is the single largest theme, with 6,713 messages from 840 people.

## 3. What users ask for and complain about

Question intents (messages with "?"):

| Intent | Messages | Distinct askers |
|---|---|---|
| Where are my rewards, or when do they pay | 857 | 383 |
| What is the contract address or link | 360 | 165 |
| When is the next listing, or which asset is next | 174 | 113 |
| Is this legit, safe or a scam | 113 | 84 |
| Where are my creator fees | 96 | 47 |
| How do I launch, pair or add a quote | 78 | 62 |
| How do I claim fees | 78 | 47 |
| Why is the chart dumping, or who is selling | 54 | 46 |
| When is LaunchLab, the next update or a feature | 38 | 31 |
| I can't sell, swap or claim | 31 | 22 |

Theme counts in user messages (per 1,000 user messages before and after 2026-08-28):

| Theme | Messages | Before | After | Distinct posters |
|---|---|---|---|---|
| Rewards (any) | 5,133 | 27.8 | 31.5 | 851 |
| Pairing or quote talk | 4,509 | 33.6 | 23.9 | 754 |
| Site, UI or mobile | 1,778 | 11.3 | 10.2 | 545 |
| Scam, rug, fake or drainer | 1,726 | 10.0 | 10.3 | 395 |
| Tokenized stocks and xStocks | 1,372 | 15.0 | 5.3 | 417 |
| Rewards missing or late | 1,358 | 6.6 | 8.7 | 433 |
| Snipers, bundles or MEV | 913 | 5.0 | 5.6 | 204 |
| Bonding or graduation | 878 | 2.0 | 6.5 | 257 |
| Bug or error | 719 | 4.1 | 4.3 | 294 |
| Rewards clog, clip or sell pressure | 382 | 1.1 | 2.7 | 114 |
| Creator fees (any) | 293 | 1.0 | 2.1 | 94 |
| Launch failed or stuck | 130 | 0.9 | 0.7 | 86 |
| Creator fees missing | 110 | 0.3 | 0.8 | 45 |
| Graduation failed | 21 | 0.0 | 0.2 | 19 |

- Stuck or failed launches were a CLMM-era problem and stayed rare, for example:
  - A launch errored but the token went live anyway, and its fees could not be claimed (#7865, 2026-08-04).
  - A user was charged the launch fee but no token appeared (#7879, 2026-08-04).
  - Two launches got stuck (#30159, 2026-08-10).
  - A bundle launch failed (#52791, 2026-08-16).
- LaunchLab-era launch errors are about quote assets:
  - One error says a quote token charges a transfer fee, which LaunchLab cannot pay back out on the quote side (#127044, 2026-09-09).
  - Another says the launch cannot be priced right now (#189904, 2026-09-15).
  - A big wrapped coin could not be a quote because its mint is still mintable (#33819, 2026-08-11).
- Failed graduations are almost absent (21 messages).
  - Graduation talk is mostly "about to bond" shilling and "I'll pay for DexScreener once it bonds".
  - One holder said payouts stopped once their coin migrated (#98542, 2026-09-06).
- Routing and fills:
  - Some swaps hit 50% slippage from the tax (#35731, 2026-08-11).
  - One user said they lost about $7K to a bad route (#134458, 2026-09-09).
  - A coin could not be sold through Jupiter or Phantom (#104657, 2026-09-06).
  - Terminals showed launch liquidity as unlocked, which hurt trader trust (#70288, 2026-08-25).
  - The team repeatedly blamed Axiom's own router; Axiom later moved to Jupiter routing and was then building a custom swap engine (admin posts 2026-08-23, 09-07 and 09-13).
- UI and site:
  - Mobile font overlap (#54128, 2026-08-17).
  - The site was down or would not load (#101246 on 2026-09-06, #169690 on 2026-09-12).
  - The daily buyback chart maxed out its axis (#151424, 2026-09-11).
  - Search for a quote did not surface paired tokens (#239026, 2026-09-25).
  - Volume figures were wrong across the site until the new indexer landed (admin #219586, 2026-09-21).
- Developers and integrators:
  - A user said a Helius API key was exposed in the frontend (#112588, 2026-09-07).
  - Launches through the public API from another platform lost their socials metadata (#193739, 2026-09-16).
  - A team asked for Squads vault addresses to be whitelisted (#224386, 2026-09-21).
  - Others asked whether PDA or multisig-owned accounts receive rewards (#187053, 2026-09-15); the team shipped "PDA whitelisting" on 2026-09-15.
- Support workload:
  - 1,243 user questions name the dev, admin, mod, team or support, peaking at 311 in the week of 2026-09-07.
  - People ask for DMs, complain nobody answers (#132222, 2026-09-09), and some were told to DM the X account for refunds on failed dev-buy fills (admin #73294, 2026-08-27).
  - The founder personally wrote recovery scripts for users who sent tokens to the operator wallet (admin #135195 and #189880).
  - The team explained that fee NFTs burned by mistake in Axiom lose the fee claim for good (admin #190137, 2026-09-15).

## 4. Quote-asset pairing

New-pair feed bot, 3,321 cards (2026-09-06 to 09-26), top quotes:

| Quote | Cards | Share |
|---|---|---|
| STONK | 806 | 24.3% |
| GLDx (tokenized gold) | 258 | 7.8% |
| PEPE | 200 | 6.0% |
| SOL | 148 | 4.5% |
| ZEC | 108 | 3.3% |
| XMR | 105 | 3.2% |
| GP (a community token) | 88 | 2.6% |
| JTO | 78 | 2.3% |
| HYPE | 70 | 2.1% |
| NEAR | 66 | 2.0% |

Next come xHYPE, WBTC, KNOTS (a community reward token), xSOL, USO (oil), PURR, SNDK, USDC, AVAX, NVDAx, SPYx, JUP, SUI, AAVE and Polymarket.

Assets named in user messages (messages, distinct posters):
- STONK: 9,590 messages from 1,030 posters.
- HYPE and PURR: 717 from 154.
- ZEC and XMR: 649 from 169.
- Gold and GLDx: 463 from 119.
- BTC: 458 from 153.
- Pre-IPO (Anthropic, OpenAI, SpaceX): 424 from 142.
- Memecoin quotes such as PEPE and BONK: 348 from 134.
- Silver, oil and copper: 244.
- ETH: 211.
- McDonald's and Wendy's: 198.
- GME and AMC: 188.
- Stablecoins: 184.
- Leveraged tokens: 173.
- Big tech: 131.
- SPY and QQQ: 111.
- Pokemon and collectibles: 100.
- NVDA: 93.
- TSLA: 33.

- $STONK pairing is the ecosystem's backbone.
  - Holders see STONK-paired coins as leveraged STONK bets that also pay STONK rewards (#30529, 2026-08-10; #179095, 2026-09-14).
  - Some complained that STONK-paired coins all bled together when STONK fell (#236018, 2026-09-24).
- Tokenized stocks were the launch narrative and the early-August peak (323 stock messages in the week of 2026-08-03), when people asked:
  - whether holding a GME-paired coin gets you GME stock (#1158, 2026-07-25);
  - where to see the stocks they earned (#3997, 2026-08-03);
  - why only 22 of xStocks' roughly 700 assets were supported (#59635, 2026-08-18).
- Some holders framed stock-paired reward coins as "daily dividends" and preferred them to pure memes (#54391, 2026-08-17).
- PreStocks and Pre-IPO:
  - Anthropic, OpenAI, SpaceX and Anduril pairs were hot in early August (152 messages in the week of 2026-08-03) and then almost vanished (3 in the week of 09-21).
  - People worried that pre-IPO tokens become worthless about 9 months after an IPO (#86459, 2026-09-04).
  - The team posted a PreStocks explanation of post-IPO conversion to xStocks, plus a $25K liquidity commitment for one pool (admin #86342, 2026-09-04).
  - Lore coins launched against the wrong pre-IPO ticker caused confusion (#120199, 2026-09-08).
- Requests moved from stocks to crypto and community tokens:
  - A pump.fun-listed stock (#194096, 2026-09-16).
  - A token that had just migrated to pump.fun (#205005, 2026-09-18).
  - KMNO (#219918) and Marinade (#240931).
  - A community-token dev at about $500K market cap asking for their token as a quote (#235875, 2026-09-24).
  - Repeated "when can we pair against KNOTS" (#138368, 2026-09-10).
  - People asked what the criteria are and how to request a quote (#211695, #214632, #226161).
- SOL pairing is a minority view:
  - Some argued exotic pairs are the whole point (#60728, 2026-08-19).
  - A SOL-paired reward coin complained its payouts had stopped for a week and holders were leaving (#242295 and #242307, 2026-09-26).
  - The team said it would look at a low-tax mode and at competing on SOL pairings (admin #103706 and #105671, 2026-09-06).
- Liquidity on exotic quotes matters:
  - A silver pair drifted off peg and needed LP to re-peg (#184445, 2026-09-15).
  - The team paused XMR over liquidity concerns (admin #121775, 2026-09-08).
  - The team conceded that exotic pairs such as a Pokemon quote start with volatile pricing (admin #71938, 2026-08-26).
- Community tokens defend their turf: one community asked the team not to add more penny stocks because that would split its own ecosystem (#78584, 2026-09-01).
- pump.fun launched stock or custom pairings around 2026-09-09.
  - Members reacted with scorn and "war" posts (#131790, #134488, #135390).
  - Earlier, someone asked whether "we are fucked" if pump.fun adds stock pairs (#112156, 2026-09-07).
  - A member criticised the team for dropping about 20 coins at once in response (#138531, 2026-09-10).
  - This is chat hearsay; check pump.fun's quote support directly before relying on it.
- Team process for quotes:
  - It stopped pre-announcing listings after the GPRO snipe (admin #80215, 2026-09-01).
  - It found snipers scraping Sunrise for newly added quotes (#115463, 2026-09-07).
  - It rebuilt a quote-request endpoint with approval because users had been adding low-liquidity quotes (#123757, 2026-09-08).
  - It plans to make users burn $STONK to add a custom quote (#143572, 2026-09-10).

## 5. Creator fees (the off-chain ~0.5% forward)

- Early on (July and August), the absence of a creator fee on reward coins was debated rather than disputed.
  - One member argued no dev fee discourages serial ruggers (#69383, 2026-08-24).
  - Others said creators need an incentive (#1368, 2026-07-25).
- After LaunchLab went public, "standard" coin creators reported fees not arriving:
  - A token with $1.5M volume paid no dev rewards (#101734, 2026-09-06).
  - The token page said fees could not be claimed without the fee-key NFT (#95910, 2026-09-06).
  - Someone pointed out the site promises automatic creator fees while thousands were owed (#107157, 2026-09-07).
  - A member wrote up days of complaints that the documented 0.5% on standard LaunchLab coins was not being paid (#134356, 2026-09-09).
  - Frustration peaked around "10 days" and still nothing (#174430, 2026-09-13).
  - Payments were still missing after almost a week (#231518, 2026-09-23).
  - A new rule of a $5 minimum per payout and $10 total claimable appeared (#240075, 2026-09-25).
- The team's own timeline confirms it:
  - Creator fees were "being solved" (2026-09-06).
  - An RPC overload backlogged the database and broke creator rewards on standard coins (#108227, 2026-09-07).
  - LaunchLab creator forwarding was "a broader issue" handed to outside devs (#120961, 2026-09-08).
  - A fix needed "a deep detailed audit" (#147205, 2026-09-11).
  - Creator forwarding became the next priority (#185386, 2026-09-15).
  - A large backfill was paid (#206839, 2026-09-19).
  - A helper still acknowledged open issues on 2026-09-25 (#241908).
- Trust impact: creators said their holders would not buy their next launch because rewards and dev fees never arrived (#191919, 2026-09-16), and others asked what the point of launching on StonkFun was (#184078, 2026-09-14).

## 6. Holder rewards, transfer tax and the buyback flywheel

- Rewards are the reason people are here, and positive posts exist:
  - "Profit or not, rewards keep coming" (#227892, 2026-09-22).
  - When the rewards wallet clipped heavily, everyone got paid (#205758, 2026-09-18).
- Complaints cluster in three waves: early August (179 in the week of 08-03), then 255, 355 and 303 in the weeks of 09-07, 09-14 and 09-21.
- Typical complaints:
  - A holder bought 5 to 7 reward coins and received nothing (#101370, 2026-09-06).
  - One token's holders got no rewards while its price fell (#230840, 2026-09-23).
  - Old pairs "glitched out" (#235883, 2026-09-24).
  - A user claimed the distributor sold and a different wallet received the payout (#214142, 2026-09-20).
- Sell pressure from the distributor is a constant theme:
  - The rewards wallet dumped into charts (#61834, 2026-08-19).
  - Some feared a 12-hour backlog would be sold at once (#217523, 2026-09-20).
  - Some traders explicitly wait for the clip before buying (#207677, 2026-09-19).
- The team's view: users first asked for smaller sells, then complained they were too small, so it "met in the middle" (#188573 and #193219, 2026-09-15 and 09-16).
- Rules users had to learn from helpers, not docs:
  - Pot thresholds by market cap (admin #86365, 2026-09-04).
  - A minimum holding of about $20 at the moment of a drop (#203010, 2026-09-18).
  - Pots and "cranks" mean a filled pot does not pay instantly (#204047, 2026-09-18).
  - A per-round minimum of $0.25 was introduced silently and then cut to $0.02 after complaints (admin #237350 and #237821, 2026-09-24).
  - If more than 2% of supply accumulates, the excess is paid in the base token instead of being sold (#238866, 2026-09-25).
- Architecture the team described:
  - Harvester, sweeper and distributor jobs.
  - Snapshot at swap time, with "lanes" for hot, legacy and stale mints.
  - Fee-payer wallets and a move from polling to Geyser streaming (admin #216755, 2026-09-20; #219887, 2026-09-21).
  - The trigger: pools grew from about 5K to 75K-100K in a couple of weeks and the original logic could not keep up (#208138, 2026-09-19).
- Buyback and burn:
  - Generally seen as the core bull case, often compared favourably with pump.fun (#227097, 2026-09-22).
  - One user checked the burn ratio against the claimed 60% (#229407, 2026-09-22); the team explained a next-day catch-up mechanism (#233086, 2026-09-23).
  - An outage in claiming CPMM pools left over $500K of revenue unclaimed for a day (admin #146924, 2026-09-11).
  - "Flywheel starvation" was fixed with a $100K-150K catch-up buy of the top 10 coins (admin #200154, 2026-09-17).
  - A community-built "flywheel radar" noticed tokens dropping out of the flywheel rankings and API (#204512, 2026-09-18).

## 7. Scams, bots, moderation

- Scam, rug and fake talk: 1,726 messages from 395 people, steady at about 10 per 1,000.
  - A copycat channel ran a fake StonkFun airdrop with a drainer (#20810, 2026-08-07).
  - Impersonators DM users (#120004, 2026-09-08).
  - Fake STONK tokens were airdropped to holders (#181640, 2026-09-14).
  - Daily tagging by fake airdrop accounts (#225562, 2026-09-22).
  - Veterans tell newcomers never to trust a contract address posted in chat and to check the website (#31445, 2026-08-10).
- Snipers and bundles: 913 messages, peaking in the week of 2026-09-07 (276).
  - One wallet launched about 30 coins through fresh wallets (#52306, 2026-08-16).
  - Other examples: 14.7% bundled at launch (#173606) and 20% bundled at $10K (#240742).
  - The team's answer was per-creator deployer wallets on LaunchLab (instead of one operator wallet), not pre-announcing listings, and "measures we won't explain" (#80226, #115463).
- Moderation load:
  - 697 `/report` uses and 274 "reported to admins" acknowledgements.
  - 166 bot-posted bans, plus `/ban` issued 13 times by 9 accounts.
  - 26 flood mutes and 336 welcome messages.
  - The "don't shill coins below $10K market cap" rule was enforced 187 times from 2026-09-15.
- Members complained that the $10K rule favours insiders' bundled coins (#202113, 2026-09-18; #210537, 2026-09-19).
- Others complained of bans for no reason (#85910, 2026-09-04) and of support deleting messages that disagreed (#215567, 2026-09-20).
- Members asked for more moderators as the chat flooded after LaunchLab (#100678, 2026-09-06).

## 8. Trust, custody and decentralization

- Few messages (94 matches), but they are pointed:
  - The hot wallet could rug every coin at once (#3847, 2026-08-03).
  - One user urged moving payouts off a single hot key to Squads or a program (#175855, 2026-09-13).
  - One user's model was that tax goes to a multisig and the backend distributes it (#169947, 2026-09-12).
- Others praised transparency: the on-chain revenue and burns, and the founder posting in the open (#59591, 2026-08-18; #146653, 2026-09-11).
- One asked who the team behind it is (#59591).
- Team statements:
  - Plans for STRIDE audits and an on-chain distributor modelled on Flap (BNB) (#92794, 2026-09-05).
  - A plan to use Solana's audited rewards program (#105668, 2026-09-06).
  - The transfer-fee authority cannot be made immutable and is secured through Turnkey (pinned #229614, 2026-09-22).

## 9. Regulatory and geo-block friction

- Minimal: 26 VPN mentions and about 46 geo or regulatory messages in 168,747.
- Examples:
  - Having to use a VPN (#22940, 2026-08-08).
  - The site not loading with or without a VPN (#127625, 2026-09-09; #166165, 2026-09-12).
  - A UK user noting that the fomo app is banned in the UK (#243626, 2026-09-26).
- Nobody discussed securities risk of stock-paired memecoins or reward tax as a worry.
- Instead, the SEC's tokenized-stock and 24/7 trading moves were celebrated as bullish (#40768, 2026-08-12; #198345, 2026-09-17).
- One member did ask whether Robinhood tokenized stocks are debt securities (#111800, 2026-09-07).

## 10. Team announcements and roadmap (admin posts, 2026-08-23 onward)

- 2026-08-23 to 08-26: Gitbook user docs.
  - LaunchLab custom quotes waiting on Raydium.
  - Axiom moving to Jupiter routing.
  - CPMM instead of CLMM for smoother charts and a compounding LP fee.
  - A UI and mobile redesign after LaunchLab.
  - "Pair anything with anything" beyond RWAs.
- 2026-08-27: a DefiLlama adapter patch, because Dune cannot price custom quotes.
  - Refunds for failed dev-buy fills on HEEBOO and MRVL.
- 2026-08-31 (pinned): LaunchLab benefits: permissionless deploys, 0.03 SOL instead of 0.29, bonding curves, CPMM.
  - Metrics: $1.21M revenue, $705K STONK buybacks, $5.35M rewards distributed.
  - Next: an on-chain reward distributor, listings and a frontend redesign.
- 2026-09-01: no more pre-announced listings; max dev buy raised to 50% as a short-term anti-sniper step.
- 2026-09-04: pot threshold table; PreStocks post-IPO conversion; "low-tax modes" and SOL pairings considered.
- 2026-09-05 to 09-07: hiring developers, STRIDE audits, a possible mobile app.
  - Titan swap integration on the site.
  - An on-chain distributor via Solana's audited rewards program.
  - Pinned "moat" posts: transfer tax cannot be undercut by LP fees, and dynamic market-cap fees need oracles that do not exist for hundreds of quotes.
- 2026-09-08 to 09-10: a custom-quote request endpoint with approval; quote adds gated by burning STONK; outside developer teams onboarded.
- 2026-09-11 to 09-12 (pinned): the CPMM claim outage ($500K+ revenue delayed); WEN (Wendy's), ORE and DKNG listed; $35M ecosystem rewards; $2.2M revenue.
- 2026-09-14 to 09-17: PDA whitelisting; an indexer replacing polling; creator and flywheel forwarding rewrite; flywheel starvation fixed.
- 2026-09-18 to 09-22 (several pins): rewards distributor rebuilt twice.
  - Stated scale: "10,000+ tokens a day, 100K+ tokens".
  - No VCs or raise; "built in public".
- 2026-09-24 to 09-26: reward minimum changes; base-token payout above 2% clog; "product updates next"; transfer hooks and Token-2022 experiments.
- Tone: the founder posted at length and often ("20 hours straight", "building a house needs a foundation").
  - Many posts ask for patience, and several blame third parties (Raydium program updates, aggregators, Axiom, X).

## 11. What an asset-paired LaunchLab competitor should copy or avoid

Copy:
- Lead with pairing, but let community tokens become quotes.
  - Their holders become distribution, and quote demand in chat shifted to community and crypto tokens once stocks lost novelty.
  - Publish clear quote criteria up front: verified mint, not mintable, no Token-2022 transfer fee on the quote, minimum liquidity, and no known rugger.
  - Offer a self-serve request flow with approval.
- Keep a tight issuer pipeline for tokenized assets (Sunrise and Backpack style), and list without pre-announcing, so snipers cannot front-run new quote mints.
- Ship a new-pair feed bot that shows the quote asset, and a command bot (`/ca`, `/website`, `/report`); they carried a large share of support and moderation.
- Post changelogs and headline metrics (revenue, buybacks, rewards paid) often, and make revenue verifiable on DefiLlama with pricing for exotic quotes.
- Make builders first-class: a public API, PDA and multisig-safe rewards, and a locker integration.
  The community built scanners, lockers, flywheel trackers and buy bots on StonkFun within weeks.

Avoid:
- Off-chain creator-fee forwarding.
  - It produced about three weeks of "where are my dev fees" and damaged creators' reputations with their own holders.
  - Use LaunchLab's on-chain creator fee.
- A rewards distributor built on polling and a few hot wallets.
  - Design for 100K+ mints from day one: streaming indexer, per-mint lanes, deterministic swap cadence.
  - Publish the rules (thresholds, minimum holding, per-round minimum) before launch, and never change them silently.
  - Give every wallet a status page ("accrued, pending, paid").
- Distributor sells that traders can front-run.
  Publish a predictable schedule, or pay in the base token when a pot is large.
- Single operator wallets and mutable fee authorities with no public custody story.
  Put fee and reward flows behind a multisig or program and document it.
- Quote whitelisting without vetting (the fake PEPE incident), and search that cannot find tokens by their quote.
- Founder-as-support.
  - 1,243 team-directed questions against 433 team replies, plus refunds and recovery scripts handled by hand in chat.
  - Budget for a ticket queue, a status page and FAQ docs before launch.
- Leaking provider API keys in the frontend, and launch APIs that drop metadata.
- Expecting stock pairings alone to sustain volume.
  They drove the August hype and then faded, and pump.fun has reportedly copied the feature.
- Geo-blocking is a minor user friction and not a reason to change plans, but the chat gives no evidence either way on regulatory exposure.
