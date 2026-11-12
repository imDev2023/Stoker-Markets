# Traps: the web app, Next.js and TradingView

Read before touching `apps/web`: a server or client component boundary, the header, a chart, a coin's links or the share images.
Moved out of `CLAUDE.md` on 2026-11-12 so it is read on demand; `CLAUDE.md` keeps the index.
The text is the original's, one sentence a line.

## Next.js and React

- `apps/web` never imports `@launchpad/chain`, the Raydium SDK or Anchor (GPL, ADR 0003); ESLint and a UI test enforce it.
- A server-rendered tree handed to a client component as a prop (the coin page's title row as `title={<div>...</div>}`) warns "Each child in a list should have a unique key prop ... It was passed a child from CoinPage" on some coins and not others (2026-10-31): a server component inside that tree (`PairLockup`) arrives as a lazy Flight chunk when the page's data takes long, and the reconciler then checks the static children array around it as if it were a list.
  The UI suite fails on the warning.
  Hand a client component data (`links`, `quoteAsset`) and let it draw the tree, as `CoinMarket` does; a single element in a prop (`notice`) is fine.
  To find such a thing, bisect against a kept stack: `startStack({ web: true })` from a throwaway `.mts` in `tests/ui` keeps a seeded stack up (the seed project run through a throwaway config with `LAUNCHPAD_STACK` from the stack's env), a Playwright script opens the page and prints the console in ten seconds, and `Runtime.consoleAPICalled` over a CDP session gives the owner stack (`<div> ... CoinPage`) that `page.on("console")` leaves out.
- A server component that imports a constant from a `"use client"` module gets a client reference, not the value: the root layout read `SCHEME_COOKIE` from `SchemeToggle.tsx` and `cookies().get(<reference>)` was always undefined, so the toggle never held across a load (2026-10-13).
  Shared constants live in `src/lib/*`.
- A sentence split into two JSX expressions is two text nodes, and the browser shapes each on its own: making the first half of the Rewards page's "Each wallet's share..." note conditional (`{weighed ? "..." : "..."}{" "}The curve's...`) moved about 100 pixels of that line in the four `rewards-empty.png` baselines, with every word unchanged (2026-11-12).
  When part of a sentence a baseline shows becomes conditional, keep each whole sentence one string, so it stays one text node.
- Test `next dev` runs rewrite `apps/web/next-env.d.ts` to point at their throwaway build folder; the web `typecheck` runs `next typegen` first, so ignore that file.
- `next dev` names every file-based metadata image (`opengraph-image`) at `http://localhost:<port>` whatever the request's host or `metadataBase` (Next's development fallback; a production build resolves it against `metadataBase`), and a dynamic segment's image route carries a hash suffix (`/coin/<mint>/opengraph-image-1ta1z0`): a test fetches the path the page names on the stack's own address, never a URL it builds.
  Satori (`next/og`) lays text out only inside a box with a set width (a flex column that grows takes its content's width and the line runs off the card), and can't place a WebP picture, so a coin with one gets its monogram on the card.

## CSS

- A `container-type: inline-size` box has no width of its own: in a column flex with `align-items: flex-start` it collapses to 0 and anything sized in `cqi` vanishes.
  `PairMark` measures its glyphs to fit, because per-character estimates break on wide letters like W.
- A `backdrop-filter` on the site header makes it the containing block of anything `position: fixed` inside it: the old search palette's backdrop covered the header's band alone (found 2026-10-13); portal any menu or sheet that opens from the header or the tab bar (`BottomTabs` does).
  The header has had no search since 2026-10-31; the site's one search is the board's `searchbox` "Search coins".

## TradingView

- TradingView's widget docs show their embed code only after a sign-up, and the module scripts (`widgets.tradingview-widget.com/w/en/tv-*.js`) answer 403 to curl: read a widget's attributes from the docs page's live preview in a browser (`customElements.get("tv-advanced-chart").observedAttributes`; its symbol search, `symbol-search.tradingview.com/symbol_search/v3/`, answers curl with a browser `Origin` and found every market in `markets.ts`).
  The UI suite serves that script empty (`thirdParty` in `tests/ui/src/fixtures.ts`), so `asset.png` shows the frame's loading line and a real look at the chart needs the dev site; an aborted request would log a failed load and trip the console guard.
  A `<script>` added in an effect must not keep its error handler in that mount's closure: React's development double-mount hands the script to a cleaned-up closure, and a blocked script left the frame on "loading" (2026-10-28); `MarketChart` keeps one module-level promise instead.
- TradingView's Advanced Charts (#126) draws in a same-origin iframe of its own, so nothing of the page reaches it: a UI test reads it through `frameLocator("[data-chart] iframe")`, a mask covers the whole plot (`[data-chart]`, a mask on the page cannot reach the frame's canvases), and a shot waits for `data-chart` to leave `loading`.
  Its `--tv-color-*` properties set by `setCSSCustomProperty` land on the frame's `body`, not its `html`.
  A path its typings list can still be unknown to its defaults: `scalesProperties.fontSize` and `paneProperties.legendProperties.showBackground` warn in the console from `overrides`, and `scalesProperties.showStudyLastValue` warns from the constructor or the widget's `applyOverrides` but is taken quietly by `activeChart().applyOverrides`.
  A copied `@font-face` keeps its stylesheet's relative `url()`, which the frame resolves against `/charting_library/`, so `shareFonts` makes it absolute.
  With no bars the library prints its own "No data here" over the plot, which is why the chart waits for a coin's first trade.
  Cloudflare's static assets redirect `/charting_library/sameorigin.html` to `/charting_library/sameorigin` (307) and the library loads through it (checked with `opennextjs-cloudflare build` and `wrangler dev`, 2026-11-06).
  TradingView's datafeed checker (`.agents/skills/charting-library-datafeed/scripts/check-datafeed.mjs` in the library's repository) runs on `datafeed.ts` through a throwaway module that exports `createDatafeed(...).datafeed`, with `NEXT_PUBLIC_API_URL` set to a stack's API and `npx tsx` from `apps/web`.

- The library asks the datafeed for marks on its own schedule, and an answer can arrive after the visitor changed what the marks show: a read sent with the trades on, answered after "Trades" was switched off and the marks cleared, drew the trades' rings again and left `data-marks` at 4 where the posts alone are 1 (a UI run under load, `visual-phone-dark`, 2026-11-12).
  `getMarks` in `src/lib/datafeed.ts` answers such a read with nothing: it compares what the marks show and the wallet at the answer with what they were at the request.
  Anything else that answers the library later than it was asked needs the same check.

## Content

- A coin's links are the seven `LINK_KINDS` of the contract (Telegram, X, Website, then Discord, TikTok, Instagram and YouTube behind the form's "More links"; owner, 2026-11-02), each a column of `launch_metadata` (migration 0023), a key of the Arweave document's `extensions` and a chip with its mark (`LinkIcon`, `src/lib/links.ts`) on the coin page; a new kind is added there, never as a one-off field.
  The review page "Stoker Launch Flow" is reshot with the throwaway scripts in `~/.claude/projects/-Volumes-Farhan-Work-Folder-Dev-AI-stonk-fun-solana/handoff/review-shots/` (its README has the command), never while a UI suite runs in the same worktree: a second `next dev` of one checkout fails on Turbopack's font cache and the stack never becomes ready.
