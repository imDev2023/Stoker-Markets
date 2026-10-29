# Design research, 2026-10-28 (issue #130)

The owner's verdict of 2026-10-28 was that the site "looks completely vibe-coded and isn't thoughtful", and the brief on #130 asked for professional design principles, the psychology of the people the platform must attract, new features, and a plan agreed before any frontend work.
This folder holds the five research reports that session produced, each with every finding sourced and graded (research, practice or opinion) and turned into a rule for a named part of the site.
The synthesis for the owner's review is the private artifact page "Stoker Design Research" (https://claude.ai/artifact/V72ck9Vf1nVq6TSn9wJEZV): the audiences, twenty principles, the references, the site today with screenshots, the features worth building, and the plan with the three questions the owner answers first.

## The reports

- `brief.md` - the shared brief the five research agents worked from: what Stoker is, the site's parts by name, the audiences, the constraints (never fetch stonkfun.xyz; keys read in a subshell) and the finding format.
- `psychology.md` - traders, creators, marketers and KOLs, tweeters, NFT communities and newcomers: 41 findings, an audience map, ten conflicts with resolutions, and thirteen dark patterns the research says to refuse.
- `principles.md` - 88 findings from the primary sources (Nielsen Norman Group, Baymard, Fogg, GOV.UK, Material 3, Radix, Refactoring UI, the design systems of Coinbase, Vercel, Shopify, Atlassian and Uniswap, the practitioners on motion, density and type), twenty principles for Stoker, a sixty-question audit checklist and the vibe-coded tells checklist.
- `competitors-launchpads.md` - StonkFun (from the private research repo only), pump.fun, uselaunch.fun, Torchpad, PonsVault and DEX Screener's pair page: what each does for the navbar, the hero, the footer, the board, the coin page, the launch flow and the trust signals, a comparison table, and the take and reject lists.
- `terminals-and-tools.md` - Titan Exchange, TradingView's widgets, Jupiter's products, and the terminals traders use (Jupiter, Hyperliquid, Polymarket, Axiom, GMGN, Photon, Birdeye, DEX Screener, BullX, Padre): trust and risk signals tabulated, chart and trade box layouts measured, and the features worth building.
- `current-site.md` - the running site (the preview-all worktree: main plus PRs #127, #128 and #129) shot 33 times at 1440 and 390 in both schemes and critiqued page by page: the five tells, what survives, the header, the hero and the footer in detail, every issue with a severity and a fix, what the 2026-10-10 brief missed, and keep, change and drop for fourteen components.

## The diagnosis in one paragraph

The 2026-10-10 brief diagnosed colour and treated colour, so the Teal redesign changed every hex and kept every layout.
What reads as vibe-coded is the layouts: every page is a stack of equal cards with no dominant element, labels and section numbers are set in the monospace face, the CSS uses 23 font sizes where the brief had 11, no page carries a visual, and unresolved content is left on the page.
The token system underneath is sound and survives; the page structures, the use of type, the components and the content hierarchy are rebuilt.

## The owner's rule on the engagement patterns (2026-10-28)

`psychology.md` ends with a list of patterns the evidence says cost traders or trust (confetti, points and streaks, trader leaderboards, a King of the Hill, movers rankings, platform-sent alerts, flashing ticks, countdowns, dripped fees, projected earnings, undisclosed referrals, silent rule changes, today's-price valuations).
The owner's rule, in their words: "Don't refuse anything. If it works we build it and do not offer it in those countries which do not like them."
So nothing on that list is refused; a pattern that works is built and withheld in the regions whose regulators object, through a region gate the API serves from the request's country, and the list stays as the record of what each pattern does.

## The plan, pending the owner's answers

Rework in place on the existing app (never a new app; ADR 0003 stands), in six phases: foundations with the header and the two footers; the landing; the coin page; the board and the assets; the launch flow; rewards, stats, curated, developers and the 404.
Each phase brings candidates shot from the real site at 1440 and 390 in both schemes to a private page, picked by elimination, with one UI run and every re-baselined image reviewed.
The three questions for the owner are on the review page's last section and on #130: which settled verdicts stand, whether "from scratch" means a new app, and whether a Trade section is in scope.

The screenshots and the saved page text are not committed; they stay in the session's scratchpad, and the review page carries the shots that matter.
