# StonkFun social presence

Collected 2026-09-26 from X (@LaunchOnSF) and Telegram (@StonkFunXyz).
We did not visit stonkfun.xyz or any link on it.

## Summary

StonkFun is a Solana token launchpad whose pitch is "Launch coins / paired with anything".
Instead of pairing new coins with SOL or USDC, creators pick any quote asset: tokenized stocks and ETFs (via Sunrise and Backpack, and earlier xStocks), pre-IPO shares (via PreStocks), commodities, leveraged tokens, other memecoins or other StonkFun coins.
It first launched coins into its own one-sided Raydium CLMM pools.
Since 2026-09-05, all new launches go through Raydium LaunchLab: a bonding curve with a custom quote asset, then a CPMM pool.
Its signature product is "reward coins".
A reward coin carries a 4% Token-2022 transfer tax, and most of it is converted into the quote asset and paid to holders.
Part of platform revenue buys back and burns the platform token $STONK.

## Key facts

- The X account @LaunchOnSF has 54,102 followers, 69 following and 1,209 posts, with a blue check.
  It was created 2023-06-12, but its first visible post is 2026-08-02.
- Website on X: stonkfun.xyz.
  The Telegram pinned post says "Launchpad: stonkpad.xyz", which conflicts with X and is unverified.
- $STONK mint: `6GmAFSYs4gk3FDao5FzzySQpPZaWsa4rUJHacpMpUNgx`.
- Fee claims (Rewards V3, 2026-08-10):
  - The total tax is 4%.
  - 2.925% goes to holders.
  - 0.756% is platform fee.
  - 0.084% goes to buying back and burning the top 10 platform coins.
  - The launch fee is 0.29 SOL, down from 0.342.
  - Creator buys are capped at 2.5%.
- LaunchLab changes (2026-09-05): deploy cost falls to about 0.03 SOL, each creator uses their own deployer wallet, and launches are permissionless.
- Partners and integrations named by the account: Raydium, Sunrise, Backpack, xStocks, PreStocks, Axiom, fomo, Jupiter (screener), Trading Terminal, DefiLlama, Gate, Lighter, Phoenix, Hylo, Ethena, Zama and Injective.
- Meteora is not mentioned by the account.
- Claimed milestones:
  - $2.6B total trading volume by 2026-09-14.
  - $85M in rewards paid by 2026-09-26.
  - 18% of $STONK supply burned by 2026-09-24.
  - 2M combined reward-coin holders.
  - Daily revenue around $1.0-1.5M in late September.
- Timeline:
  - 2026-07-24: Telegram channel created.
  - 2026-08-02: First X launch post.
  - 2026-08-05: Pre-IPO pairings.
  - 2026-08-07: Public API.
  - 2026-08-10: Rewards V3.
  - 2026-08-18: Airdrop Mode.
  - 2026-08-23: Pinned relaunch post.
  - 2026-09-05: LaunchLab.
  - 2026-09-26: Rewards pipeline upgrade.
- No team members are named in any post we collected.
- Telegram @StonkFunXyz is a portal channel with 3,617 members and only 2 public posts.
  Its pinned post has a Safeguard "Tap to verify" button that leads to a private community group.

## What we could and could not collect

- X profile: complete, from Bright Data's X profiles dataset.
- X posts: 70 of 1,209.
  - Covered: 2026-08-02 to 2026-09-26, mostly original announcements, with full metrics and media URLs.
  - Bright Data's profile-based discovery returns only 3 posts for a logged-out view.
    We found the other post URLs through Tavily, SERP and Jina Reader, then collected them all through Bright Data by URL.
  - Missing: most replies and any original posts that search engines have not indexed.
  - A complete timeline needs X cookies or the official X API.
- Telegram channel: complete.
  The channel has only #1 ("Channel created") and #7 (pinned); IDs 2-6 are deleted.
- Telegram group: not collected.
  - The owner's bot `@Approval44_bot` can read the public channel's metadata but is not an admin there.
    Its privacy mode is on.
  - Bots cannot read past messages in any chat.
  - The private group behind Safeguard needs a user-account MTProto client, such as Telethon, logged in by the owner.
  - We did not call `getUpdates` and did not send any messages.

## Files

- `x-posts.md`: profile, claims (features, fees, metrics, partners, addresses, timeline), and the full chronological post log.
- `x-posts.json`: normalized profile and 70 posts, with metrics, media, resolved links, mentions, cashtags and addresses.
- `telegram.md`: channel facts, both messages, the bot's view, and limits on reading the group.
- `telegram.json`: the same data in structured form.
- `links.md`: every link found, with context, plus third-party links found during discovery.
- `telegram-group-insights.md`: findings from the owner's export of the private group (175,060 messages), by theme, paraphrased and cited by message id.
- `telegram_insights.py`: streams the gitignored export in `telegram-group/`, writes aggregates to `telegram-group-stats.json`, and prints redacted samples with `--sample <theme>`.
- `telegram-group-stats.json`: aggregate counts only (volume per day, themes, questions, quote assets, moderation); no ids, names, addresses or message text.
