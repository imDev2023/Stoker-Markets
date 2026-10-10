# Site layout principles and the layout brief

Written 2026-10-10 (night) from the owner's verdict on the site in Teal (#93), for the session that builds the layout candidates and the one that builds the pick.
The colour brief (`principles.md`) stands: Teal, the surface ladder, the primitives, the type steps and the heat ramp are not reopened here.
This brief is about arrangement only: what sits where on the board, the coin page and the launch page, and why.

## 1. The verdict

The owner, 2026-10-10 (night): with Teal in place the site still reads like StonkFun's, because the colour brief fixed colour, depth, type and states but kept the genre's arrangement.
What the screenshots of the real site show, against StonkFun's saved pages (private research repo) and pump.fun's board:

- The board is a table of coins with the Quote Asset as a text column in the middle ("Paired: Solana") and the kinds as a row of fourteen chips.
  StonkFun's is a card grid with a "Paired with" chip on each card; pump.fun's is a card grid.
  The arrangement differs, the idea does not: the coin is the unit, and what it is paired with is a label on it.
- The coin page is a chart on the left, a trade box on the right, trades under the chart and holders under the trade box.
  StonkFun's token page, Robinhood's, Coinbase's, Uniswap's, Jupiter's and pump.fun's are the same frame.
  The pair is in the title and nowhere else; the Quote Asset gets a card at the bottom of the page.
- The launch page is five numbered sections with the pair third, and a summary docked right.
  StonkFun's form puts the quote token last; pump.fun has no choice at all.
  The one decision only we offer is the third thing on the form.

So the wedge, that every coin is a pair and the Creator picks the other half, is a middle column, a third section and a chip.
The layout unit makes the pair the unit of every page, and the arrangement follows from that rather than from the genre.

## 2. The principles

Each principle names its source; section 8 has the links.
They are the ones that bear on arrangement; the colour brief's eleven stand beside them.

1. **A ranked, compared, searched collection is a table, never a card grid.**
   NN/g: cards suit heterogeneous items browsed rather than searched; a vertical list is more scannable, cards hinder comparison and de-emphasise ranking.
   The board is homogeneous, ranked and searched, so it is a table; a card earns its place only where items differ in kind (an asset tile, a featured pair).
2. **The pair goes first and left.**
   NN/g: the first column is the human-readable identifier; visitors spend 80% of their time on the left half of a page and read the first words of a line most (F-pattern, serial position effect).
   In every row, panel and title the first words are BASE/QUOTE with both marks; a Quote Asset at the right end of a row hides the differentiator.
3. **One primary action per page, made loud by quietening the rest.**
   GOV.UK: more than one main call to action reduces their impact; Refactoring UI: de-emphasise to emphasise.
   The coin page has one filled button (the trade), the launch page one (the review), the board's rows none.
4. **The first screenful carries the pair, the price and the action.**
   NN/g: 57% of viewing time is above the fold and 74% in the first two screenfuls.
   On the coin page the trade panel is in view before any scroll; on the launch page the asset choice is.
5. **Headings a scanner can jump between.**
   NN/g's layer-cake pattern: fixations land on headings; it only works when the headings are easy to find and summarise their sections.
   Every panel on the coin page and every section of the form has a real heading; the row of unlabeled boxes goes.
6. **What belongs together sits together, inside one boundary.**
   Gestalt proximity and common region (NN/g): items close together, or inside one border, are read as one thing.
   The coin and its Quote Asset are never split across columns; one container holds the market (the price, the chart, the action) and everything else is uncontained or lighter.
7. **The irreducible choice gets the form's complexity, not the visitor.**
   Tesler's law: choosing a Quote Asset cannot be removed, so the form carries it (kinds first, a recommended few, then search over hundreds); Hick's law: break the choice into steps and highlight the recommended options; Miller's law: three chunks (the pair, the coin, the extras).
   Progressive disclosure (NN/g): the rarely used options (links, a first buy, an airdrop) sit behind the essentials.
8. **Fixed widths for panels, fluid for content, and no obligation to fill the screen.**
   Refactoring UI: grids are overrated; give the trade panel and the rail a fixed width and let the chart and the table flex; a wide window is not a reason to stretch.
9. **Small multiples, word-sized graphics, the smallest effective difference.**
   Tufte: every row and every tile is the same shape in the same positions so the eye reads only the differences; a sparkline is a word-sized graphic that can sit in a table cell; make visual distinctions as subtle as possible but still clear, so scaffolding (dividers, zebra, axes) stays at the faintest visible step.
10. **Conventions carry; spend novelty only on the pair.**
    Jakob's law: visitors spend most of their time on other sites and expect this one to work like them.
    The chart, Buy and Sell, a trades tape and a holders list stay recognisable; what is new is where the pair sits and what the Quote Asset gets.
11. **Sticky only with a purpose.**
    NN/g: a sticky element helps only when it serves a task, and should be compact and distinct.
    The trade panel stays while the chart column scrolls; the launch summary stays only while the form is longer than a screen.
12. **On the phone, the pair, the price and the action first; the action in thumb reach.**
    NN/g (defer secondary content for mobile), Fitts's law.
    The stacking order is pair, price, trade, chart, lists, facts.

## 3. What the products do

The survey (eleven products, sources in section 8) found five arrangements that recur and three ways the layout changes where the pair is the unit.

Recurring:

- **Chart left, action right.** Robinhood, Coinbase, Uniswap, Jupiter, pump.fun, Hyperliquid and Kalshi Pro keep one trade panel in a right column that stays while the left scrolls, and every one collapses on a phone to header, chart, action, then the rest.
- **The tape and the holders live under the chart as tabs**, never beside the action (Jupiter, Birdeye, DexScreener, pump.fun, Uniswap).
- **The row is already a trade** where the product can afford it: Polymarket's Buy buttons, Jupiter's Quick Buy, Coinbase's Trade button, Kalshi's two prices in the row.
- **Filters above the table, not a rail**, except where a rail switches a whole domain (DexScreener's chains, Birdeye's chains).
- **The dense products own no page.** Bloomberg's Launchpad groups, Kalshi's Canvas and Hyperliquid's grid bind panels to one security context instead of stacking pages.

Where the pair is the unit (DexScreener, Uniswap's pools, TradingView's symbols):

- The row name doubles: BASE/QUOTE with two logos, so the first column grows and loses its badges.
- The identity moves to a rail of pair facts (price in the quote and in USD, pooled amounts of both sides, liquidity, age) rather than a stats strip.
- The default sort shifts from market cap to activity, because one asset appears in many rows and only its markets can be ranked.

Two ideas to take rather than components to lift: Bloomberg's group (one context drives every panel; for us the pair is that context) and Uniswap's create flow (the pair is the first and largest choice, then a linear stepper).

## 4. The unit: the pair

Everywhere a coin appears it appears as a pair, with both marks: the coin's image and the Quote Asset's logo in one lockup, then the `PairMark` text.
A pair has facts of its own that a coin alone does not: the price in the Quote Asset and what that is in USD, the Quote Asset's own USD price (so a USD figure is explained), its kind and issuer, its liquidity, its Quote Risk Labels, and the Graduation Target in the Quote Asset.
The API already serves all of these (`LaunchSummary.quote`, `QuoteAsset.price`, `liquidityUsd`, `labels`, `graduationTarget`, `LaunchQuote.launches`); nothing in this unit needs the API to change.

What follows for each page:

- The board filters by asset before anything else; the Quote Assets in use are the board's rail or bands, not a chip row and a dropdown.
- The coin page is the pair's page: the Quote Asset's card sits beside the coin's market, not at the foot.
- The launch page's first and biggest move is the asset.

What stays: the words (the content phase is closed), the chart, Buy and Sell, the trades tape, the holders list, the summary's facts, the controls' rule (never behind an empty state), and the landing (not in this unit).

## 5. Page by page

Where candidates differ they are listed; where they agree the arrangement is given once.
Every candidate is built on the real site behind `?layout=<id>` and shot with the seeded coins, so the pick is made on the site, not on frames (the lesson of Graphite).

### The board (`/coins`)

Common to every candidate: a table, one row a pair, the pair lockup first (coin image, Quote Asset logo, `PairMark`, the name under or beside it), the "Paired" text column gone (the lockup says it), the figures in mono right-aligned, the curve as the heat bar, the search and the sort above the table, the default sort unchanged.

- **B1 Asset rail.**
  A fixed 240px rail on the left lists the Quote Assets coins are paired with, "All" first, then each asset with its logo, ticker, how many coins and the 24h volume across them, grouped under the kinds (Solana, stablecoins, the issuers, the rest), the chosen one in `plate`.
  The table takes the rest.
  The chip row and the Quote Asset dropdown go; the rail is both.
  Principle: list-detail; the choice is among the handful of assets in use, not six hundred (Hick); the pair is the row and the asset is the context (Bloomberg's group).
  Phone: the rail becomes a horizontal strip of asset chips with logos above the table.
- **B2 Grouped tape.**
  No rail; the table is grouped under asset bands, each band a row of its own with the logo, the ticker, the asset's USD price, the number of coins and their volume, sticky while its rows scroll past, the bands ordered by activity.
  The chips stay as they are above the table, and the dropdown goes (a band is the filter: click it to see only its coins).
  Principle: the layer cake (bands are the headings a scanner jumps between), small multiples, common region.
  Phone: the same, the bands shorter.
- **B3 Asset strip.**
  A horizontal strip of asset tiles above the table, each tile the logo, the ticker, the kind, the number of coins and the volume, the deepest first, scrolling sideways past the first six; a tile filters the table, "All" is the first tile.
  The chips fold into a segmented "kind" control at the strip's left; the dropdown goes.
  Principle: the row is the tape and the strip is the filter (Coinbase's movers strip, Uniswap's pool chips); the pair is still first in every row.
  Phone: the strip scrolls sideways; the table stacks as today.

The owner's own sketch (an asset rail instead of chips, both marks in every row) is B1; B2 and B3 are the two other honest answers to the same brief.

### The coin page (`/coin/<mint>`)

Common to every candidate: the header is the pair lockup at size (both images, the `PairMark` as the h1, the name and the links under it), followed by a stats strip of the pair's figures (price in the Quote Asset, in USD, market cap, 24h volume, the curve's progress as the heat bar with the target); one filled button on the page (the trade panel's); the trades and the holders as tabs under the chart in one panel with a heading each; the facts and the addresses in one "About this pair" panel at the foot, the Quote Asset's labels inside it.
This also ends the empty band the Teal baselines showed (the left column's facts card started where the right column's holders ended): the columns no longer share a row grid.

- **C1 Pair rail.**
  The chart on the left, fluid; a fixed 380px column on the right, sticky, holding the Quote Asset's card first (logo, ticker, kind and issuer, USD price, liquidity, the labels' count with a link to its page) and the trade panel under it, Graduation progress inside the trade panel's head.
  Principle: DexScreener's identity rail; the supporting pane; sticky with a purpose.
  Phone: pair, stats, trade, chart, tabs, the Quote Asset's card, about.
- **C2 Two sides.**
  Under the stats strip, two equal cards side by side that name the pair's two halves: the coin (image, supply, holders, launched, the Creator's share) and the Quote Asset (logo, kind, USD price, liquidity, labels, "everything about SOL"); beneath them the chart left and the trade panel right as today, the tabs under the chart.
  Principle: proximity and common region make the pair visible as two things in one frame; conventions carry for the market below.
  Phone: pair, stats, the two cards stacked, trade, chart, tabs.
- **C3 Action left.**
  The trade panel in a fixed 380px column on the left, sticky, with the Quote Asset's card under it; the chart and the tabs on the right, fluid.
  Principle: horizontal attention leans left, so the one action and the pair's facts sit in the strong zone; the chart, which every trader knows how to find, takes the weak one.
  The cost is Jakob's law: no product in the survey does this, so it is the candidate that tests whether novelty is worth it.
  Phone: identical to C1.

### The launch page (`/launch`)

Common to every candidate: the asset is chosen before the coin is named; the chooser shows a recommended few first (SOL, the deepest stablecoin, the deepest stock) ahead of the kinds and the search; the summary's lockup shows both images as soon as an asset is chosen; the sections keep their words.

- **L1 Asset first.**
  The form as built, re-ordered: 01 Paired with (the chooser at the card's full width, the recommended three as larger cards above the grid, the asset's Graduation Target and labels folded under its card when chosen), 02 Your coin, 03 Launch type, 04 Links, 05 Launch options; the summary docked right as today.
  Principle: the first and biggest move; Hick with a recommended set; Miller's three chunks.
  Phone: the sections in that order, the summary last.
- **L2 Two stages.**
  The page opens on the asset alone, at full width: the search, the kinds, the grid of assets with the recommended three first, and beside the grid a facts panel for the one under the pointer or chosen (kind, USD price, liquidity, Graduation Target, labels).
  Choosing collapses the stage into a band at the top of the form ("Paired with SOL", with its logo and a Change link), and the form appears under it: Your coin, Launch type, Links, Launch options, with the summary right.
  Principle: progressive disclosure and Tesler, one decision per screen, Uniswap's create flow; the asset is the page until it is chosen.
  Phone: the same two stages, the band sticky under the header.

Two candidates, not three: a third (a live pair lockup at display size above the form) is a motion idea for unit (5), not an arrangement.

## 6. The phone and the tablet

- Under 900px every page is one column in the orders given above; the trade panel is never below the chart on a coin page.
- Under 640px the board's controls stack (search, sort two by two, the rail or strip as sideways-scrolling chips), as they do today.
- The tablet (900 to 1100px) keeps two columns on the coin page with the fixed column at 340px, and the launch summary moves under the form.
- The phone and tablet menu is the unit after this one (owner, 2026-10-10) and is not designed here.

## 7. The pick, the build, the verification

1. Work in `.claude/worktrees/site-redesign` on branch `site-layout` (from `main`; its web on 3101 reads the seeded API on 8793, ten coins across SOL, USDC, NVDAx and JTO).
2. Each candidate is a layout switch read from `?layout=` by the page (server `searchParams`; the board keeps it in its URL state), so every candidate is the real page with the real data; the default stays the built site until the pick.
3. Shoot every candidate at 1440 and 390 in dark, and the current page beside them, into the artifact "Stoker Layout": one page per site page with jump links, the candidate list at the foot of each, the owner picks by elimination, and when the answer is "more", ask for the axis in the same message.
4. After the pick: the losers' code goes, the winner becomes the page (no `?layout=` left), light mode is checked, then one UI run with `pnpm test:ui --update-snapshots=all` (the board, every coin page state and every launch state change, about 150 images), reviewed by contact sheet as #93 was.
   `pnpm lint` and `pnpm typecheck` before the run; the backend suite is untouched (no API change).
5. One PR on `main`, a status comment on #37, and the memory `design-candidates-review-style` applies.

## 8. Sources

- NN/g: [cards](https://www.nngroup.com/articles/cards-component/), [data tables](https://www.nngroup.com/articles/data-tables/), [F-pattern](https://www.nngroup.com/articles/f-shaped-pattern-reading-web-content/), [layer cake](https://www.nngroup.com/articles/layer-cake-pattern-scanning/), [horizontal attention leans left](https://www.nngroup.com/articles/horizontal-attention-leans-left/), [scrolling and attention](https://www.nngroup.com/articles/scrolling-and-attention/), [progressive disclosure](https://www.nngroup.com/articles/progressive-disclosure/), [defer secondary content for mobile](https://www.nngroup.com/articles/defer-secondary-content-for-mobile/), [visual hierarchy](https://www.nngroup.com/articles/visual-hierarchy-ux-definition/), [proximity](https://www.nngroup.com/articles/gestalt-proximity/), [common region](https://www.nngroup.com/articles/common-region/), [button states](https://www.nngroup.com/articles/button-states-communicate-interaction/), [filters vs facets](https://www.nngroup.com/articles/filters-vs-facets/), [applying filters](https://www.nngroup.com/articles/applying-filters/), [empty states](https://www.nngroup.com/articles/empty-state-interface-design/), [dashboards](https://www.nngroup.com/articles/dashboards-preattentive/), [sticky headers](https://www.nngroup.com/articles/sticky-headers/).
- GOV.UK Design System: [button](https://design-system.service.gov.uk/components/button/) (one main call to action).
- Refactoring UI (Wathan and Schoger, 2018), the Layout and Spacing and Hierarchy chapters: [refactoringui.com](https://www.refactoringui.com/).
- Tufte: [The Visual Display of Quantitative Information](https://www.edwardtufte.com/book/the-visual-display-of-quantitative-information/) (data-ink), [Envisioning Information](https://www.edwardtufte.com/book/envisioning-information/) (small multiples, layering), [sparkline theory and practice](https://www.edwardtufte.com/notebook/sparkline-theory-and-practice-edward-tufte/), Visual Explanations ch. 4 (the smallest effective difference).
- Laws of UX (Yablonski): [Fitts](https://lawsofux.com/fittss-law/), [Hick](https://lawsofux.com/hicks-law/), [Miller](https://lawsofux.com/millers-law/), [serial position](https://lawsofux.com/serial-position-effect/), [Jakob](https://lawsofux.com/jakobs-law/), [Tesler](https://lawsofux.com/teslers-law/).
- Canonical layouts: [Android list-detail, supporting pane, feed](https://developer.android.com/develop/ui/views/layout/canonical-layouts), [Windows list-details](https://learn.microsoft.com/en-us/windows/apps/design/controls/list-details).
- Products: [TradingView SOLUSDT](https://www.tradingview.com/symbols/SOLUSDT/) and [screeners](https://ru.tradingview.com/support/solutions/43000718885-quick-and-easy-guide-to-tradingview-screeners), [Polymarket markets](https://polymarket.com/markets), [Kalshi Pro Canvas](https://kalshi.com/pro/help/canvas-workspace), [Robinhood stock pages](https://robinhood.com/us/en/support/articles/viewing-stock-detail-pages), [Hyperliquid trade](https://app.hyperliquid.xyz/trade), [Jupiter Studio](https://docs.jup.ag/user-docs/launch/studio/launching-a-token.md), [DexScreener docs](https://docs.dexscreener.com/), [Birdeye](https://birdeye.so/), [Uniswap Explore](https://support.uniswap.org/hc/en-us/articles/9818094509453-How-to-use-the-Uniswap-Explore-page), [Coinbase explore](https://www.coinbase.com/explore), [pump.fun board](https://pump.fun/board), [Bloomberg Launchpad](https://www.globalcustodian.com/bloomberg-introduces-new-desktop-39launchpad39/).
  StonkFun's pages were read from the private research repo, never from the site.
