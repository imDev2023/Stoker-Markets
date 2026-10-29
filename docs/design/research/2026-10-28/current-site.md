# The current site, critiqued page by page (issue #130, 2026-10-28)

## What I looked at

- The site on the owner's dev stack: `http://localhost:3100` with the API on `http://localhost:8791`, 8 live coins in the database, none graduated, no 24h volume.
- 33 screenshots in `/private/tmp/claude-501/-Volumes-Farhan-Work-Folder-Dev-AI-stonk-fun-solana/1048aa25-7a30-4a52-a8a9-84f3a6350332/scratchpad/research/shots/`: every page at 1440 in dark and light (full page), five pages at 390 dark (full page), the header at 1440, the gooey search open at 1440, the phone menu open at 390, the coin page's first screen at 1440, and the assets directory as 4000px and 3000px viewport shots because its full page is 23,580px at 1440 and 73,315px at 390.
- Readable crops of the phone shots and the tall pages are in the sibling folder `crops/`.
- `docs/design/principles.md` (the 2026-10-10 brief), `apps/web/src/app/globals.css` and the components' `.module.css` files for the measurements quoted below.
- Two artefacts in the shots are the dev stack's, not the design's: the `localnet` tag beside the wordmark and the "This site runs on localnet" footer line (the `ClusterNotice`), and the Next.js "N" badge at the bottom left.
- One artefact is half the dev stack's: every coin image is a broken-image glyph because `GET /metadata/<mint>/image` answers 404 on this stack, but the site has no fallback for a failed image (`CoinRow.tsx:34` and `Trending.tsx:36` render a bare `<img>` with no `onError`), so a production coin whose upload is still pending shows the same glyph.

## 1. Overall

### The five things that most make it read as template-made or AI-made

1. **Everything is a card, and every card is equal.**
   The home page is a stack of one card, four cards, six cards and a footer (`home-1440-dark.png`); the coin page is eleven hairline boxes of the same radius, the same 1px line and the same padding (`coin-1440-dark.png`).
   Nothing on any page is dominant and nothing is subordinate, so the eye has no entry point and the page reads as a dashboard template filled in.
   A designed page has one element that owns the screen (the chart on a coin page, the headline and a visual on the landing, the rows on a board) and everything else sits a clear step below it.
2. **Mono uppercase labels and numbered sections everywhere.**
   `01 Paired with`, `02 Your coin` (`launch-1440-dark.png`), `PRICE`, `PAIRED WITH`, `LAUNCH SUMMARY`, `XSTOCKS`, `PRESTOCKS` (`coins-1440-dark.png`), table headers at 11px uppercase mono with 0.06em tracking (`Board.module.css:114`).
   Twelve component modules set `var(--font-mono)` on labels, chips, controls and headers, when the brief reserved the mono face for figures.
   This is the current generated "terminal" look and the single strongest tell; a professional terminal (Hyperliquid, Jupiter, Binance) sets its labels in the UI sans at 12 to 13px and keeps the mono for numbers.
3. **The type scale drifted and the site lives at 11 to 14px.**
   The CSS uses 23 distinct `font-size` values against the brief's 11 steps, and four small sizes (14, 13, 12 and 11px) account for 181 of the 262 declarations.
   The one jump is the pair mark at 96px beside a 12px name (`coin-1440-dark.png`), a 8:1 step with nothing between, so the coin page is a billboard over a settings screen.
4. **No visual anywhere, still.**
   The hero is two lines of text beside 55% empty width (`home-1440-dark.png`, the headline is 470px wide in a 1180px column), the only decoration is a 24px dot grid and a 32px-blurred blob, the mark appears at 22px in the header and 64px on the 404 and nowhere else, and the salamander, the Furnace Cat and the ring at size are absent from every page.
   The brief named this fault on 2026-10-10 ("there is no visual anywhere") and the redesign answered it with a glow.
5. **Unresolved content left on the page.**
   "Paired with SOL" as a tag beside `FCAT/SOL` beside `0.00000002995 SOL` says SOL three times per trending card (`crops/home-1440-dark-2.png`); the price is shown three times and the graduation three times on the coin page; "Solana, Solana" and "Solana · Solana" (the name and the kind collide, `coin-1440-dark.png`, `asset-sol-1440-dark.png`); "worth 85 SOL when set" (`asset-sol-1440-dark.png`); an empty `MODE` column with a header on every row of the board (`CoinRow.tsx:17`); "$0 traded today" on all six trending cards; the launch summary cut mid-sentence at the bottom of its sticky box (`crops/launch-1440-dark-1.png`); the trades panel stretched to about 1,000px around five rows (`crops/coin-1440-dark-1.png`, deliberate in `CoinMarket.module.css:1`); a broken-image glyph for every coin.
   Each is small; together they are what "not thoughtful" means, because a designer resolves every one before shipping.

### The five things that are already good and should survive

1. **The slogan and the heat as a brand device.**
   "No one picks your pair. You do." with "You do." in the amber-to-ember ramp, and the ramp reserved for the brand's moments (paid to creators, the curve bar, the graduation figure, "You earn") is a real, ownable signature.
2. **The token system underneath.**
   Role tokens, a surface ladder, hairlines at alpha, AA checked from the tokens, a light mode that is designed rather than inverted, and the scheme toggle (`globals.css`): the infrastructure a redesign needs is in place and only its use is wrong.
3. **The pair mark.**
   `FCAT / SOL` with the slash in the accent is the clearest visual statement of the product's one idea; it only needs scaling down and a rule for where it appears.
4. **The content is more honest than the competition's.**
   "Before you buy" (creator holding, snipers, top 10), the launch summary's exact fee breakdown, the public Ledger, the asset page's "Further information" and the copy-protection line are trust content no rival shows; keep the content and redesign its presentation.
5. **The small craft that exists.**
   The designed focus ring and button states, the 404 pattern (ring, one line, one action, `404-1440-dark.png`), the asset chips with counts, the sticky launch summary as an idea, and the segmented controls.

## 2. Per page

Severity: high (a visitor notices and trusts the site less), medium (a designer notices), low (polish).

### Home (`/`)

| Issue | Severity | Shot | Principle | Instead |
| --- | --- | --- | --- | --- |
| The hero has no visual; the content column is 820px of 1180px and the right 45% is empty canvas with a faint blob | high | `home-1440-dark.png`, `crops/home-1440-dark-1.png` | hierarchy | Put the product in the hero's other half: a live coin page or the board in a frameless shot, or the character, on a 12-column grid with the text in 6 columns and the visual in 6. |
| The lede runs 82 characters a line for three lines and carries two messages (the pairing and the creator's cut) | medium | `crops/home-1440-dark-1.png` | type scale | One message in two lines of at most 60 characters; the creator's cut becomes its own section with its own figure. |
| "See the ledger" is the secondary action for a first visit, which no newcomer understands | medium | `home-1440-dark.png` | affordance | Make the secondary "Explore coins" (the board) and link the ledger from the figures. |
| "Priced in any of 584 assets" proves the pitch with jlUSDC, PSOL, hSOL, PUMP, WBTC and TRUMP and not one stock, so the hero's lede ("a tokenized stock") and its proof disagree | high | `home-1440-dark.png` | trust | Curate the proof row by kind (SOL, USDC, NVDAx, SPYx, TSLAx, a meme) and show the issuers' marks (xStocks, Backpack, PreStocks) as a "pairs from" strip. |
| The asset tiles' kind labels are in mixed case: "Solana", "DeFi", "stablecoin", "wrapped", "meme" | low | `home-1440-dark.png` | consistency | One label grammar (sentence case kind names) from one source of truth. |
| The four figures read as a bento of zeros: "0 STOKER burned", "$0 traded today" on every card, "0.09 SOL paid to creators" | high | `home-1440-dark.png` | empty state | Show only figures that are non-zero at launch (coins launched, assets, volume 24h once there is some) and hide a figure until it has a value; never render a zero as a headline. |
| The figure labels are in three grammars: "assets to pair with", "STOKER burned", "revenue on the ledger" | low | `home-1440-dark.png` | consistency | Noun phrases of the same shape ("Assets", "Paid to creators", "Burned", "Revenue"). |
| Trending cards repeat the pair three times (pair mark, "Paired with SOL" tag, the price unit) and the SIGNL card wraps its market cap onto a new line so the second row's cards are unequal | medium | `crops/home-1440-dark-2.png` | consistency, alignment | Drop the tag, keep the pair mark, put the market cap on a fixed line, and give every card the same row structure. |
| The "Paired with NVDAx" tag is accent-filled on one card and plain on five, a difference nobody can decode | low | `crops/home-1440-dark-2.png` | colour meaning | One tag style; if stocks deserve a mark, make it the issuer's logo. |
| About 130px of empty canvas between the last trending card and the footer | low | `home-1440-dark.png` | spacing rhythm | End the page with a closing section (the creator pitch or the invitation) so the footer follows content. |
| The kind chips beside "Trending now" (All, xStocks, PreStocks, Backpack, Currencies, Solana) are a filter on a section of six cards | low | `home-1440-dark.png` | density | Remove the filter from the landing; it belongs to the board. |

### Header

| Issue | Severity | Shot | Principle | Instead |
| --- | --- | --- | --- | --- |
| Four elements of equal visual weight at the right (search pill, toggle, filled CTA, wallet pill) beside a six-link pill at the centre: ten targets in a 72px bar | medium | `header-home-1440-dark.png` | hierarchy | One filled action, the wallet as a quieter ghost or an avatar, the toggle inside the account menu, the search as an icon that expands. |
| The gooey search opens a field at the bar's centre, 400px left of the button pressed, and the nav pill vanishes while it is open | medium | `header-search-1440-dark.png` | affordance | Open the field where the eye is (expand from the button in place) or as a centred palette with a backdrop. |
| The search results hang as pills over the page: they cover the board's sort control and its first three rows | high | `header-search-1440-dark.png` | affordance, density | Results in a panel on `surface-3` with a shadow and a backdrop, over the page but reading as a layer; never pills blended into content. |
| The result pills show a broken image, the pair and a market cap only | medium | `header-search-1440-dark.png` | trust | A result row with the image (with fallback), pair, name, price, 24h change and curve progress. |
| The current section is marked by a `plate` fill on the pill link only; on a page that is none of the six (the coin page, the launch page) nothing is marked | low | `coin-1440-dark.png`, `launch-1440-dark.png` | consistency | Mark Explore current on a coin page, and mark the CTA current on the launch page. |
| The wordmark is 20px beside a 22px ring; the brand occupies 100px of a 1440px bar | low | `header-home-1440-dark.png` | hierarchy | 24px wordmark, the ring at 28px, and a 2px tighter pair so they read as one mark. |

### Footer

| Issue | Severity | Shot | Principle | Instead |
| --- | --- | --- | --- | --- |
| The footer is about 500px tall; on the board page it is 38% of the page (`coins-1440-dark.png` is 1399px tall, the footer starts at 890) | high | `coins-1440-dark.png` | density | A compact terminal footer (one row: mark, five links, socials, network status, legal) and the full footer on the landing only. |
| The SITE column repeats the header's six links plus two, and CREATORS is a column holding one link | medium | `home-1440-dark.png` | consistency | Group by audience: Trade (Explore, Assets, Rewards), Create (Stoke a coin, Curated, Creator earnings), Platform (Revenue, Burns, Announcements, API, GitHub), Legal. |
| The socials appear twice (icons under the wordmark and text in COMMUNITY), and an email sits among them | low | `home-1440-dark.png` | consistency | Socials once as icons; the email under a Contact or Legal group. |
| The disclaimer is a 2-line paragraph of 13px and there are no Terms, Privacy or Risk pages behind it | medium | `home-1440-dark.png` | trust | One line with a link to a full risk disclosure, and Terms and Privacy as pages; traders check for these before depositing. |
| The footer's column headings (SITE, CREATORS) are 12px uppercase with 0.08em tracking, the same style as the table headers and the eyebrows | low | `home-1440-dark.png` | consistency | Headings in the UI sans at 13px, weight 600, sentence case. |

### Board (`/coins`)

| Issue | Severity | Shot | Principle | Instead |
| --- | --- | --- | --- | --- |
| The 220px rail lists 13 kinds in 11px uppercase mono, 9 of them empty with no count and nothing under them | high | `coins-1440-dark.png` | empty state, density | Show only kinds with coins (with a "more kinds" disclosure), labels in the sans at 13px, counts as tabular figures. |
| Every asset in the rail shows "$0" under its coin count | medium | `coins-1440-dark.png` | empty state | Show volume only when it is non-zero; a zero volume says nothing. |
| The table has a `MODE` column that is empty on every row and a `LAUNCHED` column of "3d ago" | medium | `coins-1440-dark.png` | consistency | Drop MODE (show a Reward tag inside the pair cell when there is one) and rename LAUNCHED to Age. |
| Seven columns in 1000px with a 150px dead gap between CURVE and 24H VOLUME; PRICE and MARKET CAP right-aligned, CURVE left | medium | `coins-1440-dark.png` | alignment | Fixed column widths from the content, numbers right-aligned under right-aligned headers, the curve column sized to its bar. |
| No 24h change, no transactions count, no holders, no creator or sniper signal: the figures a trader scans for are absent | high | `coins-1440-dark.png` | trust, density | Columns: pair, price, 5m and 24h change in up or down, volume, market cap, curve, holders, age; the trust labels as small marks in the pair cell. |
| The sort is a mono segmented control while the chips elsewhere are sans; the search placeholder is mono too | low | `coins-1440-dark.png` | consistency | Controls in the UI sans; mono only in the cells that hold figures. |
| The row is 52px with a 28px image and the pair mark at 17px, so the board shows 8 coins in 450px; a terminal board shows 15 to 20 | medium | `coins-1440-dark.png` | density | 40px rows, 24px image, 14px pair mark, 13px figures, with a density toggle if the landing's audience needs air. |
| The "Updates every few seconds" line at the top right is the only live signal and it is static text | low | `coins-1440-dark.png` | trust | A timestamp of the last update, or rows that flash on change. |
| Rows have no hover or click affordance in the resting state (no chevron, no underline, the row is the link) | low | `coins-1440-light.png` | affordance | A `surface-2` hover with the cursor and the pair cell as the visible link. |

### Coin page (`/coin/[mint]`)

| Issue | Severity | Shot | Principle | Instead |
| --- | --- | --- | --- | --- |
| The trade panel is the third card of the right column, about 1,500px below the top at 1440x900; above the fold there is a 96px ticker, chips, a description, a stat strip and the top of the chart | high | `coin-fold-1440-dark.png`, `coin-1440-dark.png` | hierarchy | Chart and trade panel side by side at the top (the terminal canon); the pair mark at 28 to 32px in a one-line title row with price and change. |
| The pair mark at 96px with a 96px image tile dominates the page while the name is 15px in `ink-2` | high | `coin-1440-dark.png` | type scale | A title row: 40px image, `FCAT / SOL` at 28px, the name beside it at 16px, the price at 28px mono with the 24h change beside it. |
| The price is shown three times (stat strip, chart header, chart label) and the graduation three times (stat strip, Graduation card, the "1.0518 of 85 SOL" line) | medium | `coin-1440-dark.png` | consistency | Each figure once, in the place it is acted on: price in the title row, graduation as one bar under the chart. |
| The trades panel is stretched to the right column's height, leaving about 600px of empty box under five rows | high | `crops/coin-1440-dark-1.png` | spacing rhythm | Let the left column be as tall as its content and give the right column fewer, shorter cards; never stretch a panel to hide canvas. |
| "Paired with" card says "SOL, Solana, Solana" and "Labels: nothing to flag" in mono | medium | `coin-1440-dark.png` | consistency | "SOL · Solana" once; "No risk labels" as a green tag. |
| The chart is 300px tall with one candle and a TradingView logo; the time axis shows one tick ("19:15") | medium | `coin-1440-dark.png` | empty state | A chart of at least 420px; with fewer than N trades show the curve's price function as a line from the launch price to the graduation price with the trades as dots, so a new coin is never a single bar. |
| Price notation changes between "0.00000002995 SOL" (stat strip), "0.0₇2995" (chart) and "29.95 SOL" (market cap) | low | `coin-1440-dark.png` | consistency | One notation rule: subscript zeros everywhere a sub-cent price is shown, with a tooltip of the full number. |
| The description sits as a bare line of `ink-2` between chips and the stat strip | low | `coin-1440-dark.png` | hierarchy | Description inside an "About" card below the fold with the links. |
| "Before you buy" is the strongest trust content on the site and it sits at the bottom of the right column | medium | `coin-1440-dark.png` | trust, hierarchy | Three small marks in the title row (creator holding, snipers, top 10) that expand to the card; the whole card above the chart on phones. |
| The addresses card (Creator, Coin, Curve, Launch transaction) and the "Creator earns" card are two half-width cards with 70% empty width each | low | `coin-1440-dark.png` | density | A single "About" block: description, links, addresses as a dl, launched, protection, creator earnings. |
| "All coins" as a lone ghost button after the cards | low | `coin-1440-dark.png` | affordance | A breadcrumb at the top ("Explore / FCAT") and no trailing button. |

### Asset directory (`/assets`)

| Issue | Severity | Shot | Principle | Instead |
| --- | --- | --- | --- | --- |
| One table of 606 rows, 23,580px tall at 1440 and 73,315px at 390, with no pagination, virtualisation or sticky group headers | high | `assets-top-1440-dark.png`, `crops/assets-top-390-dark-1.png` | density, responsiveness | Group tabs or a sticky kind rail with counts, 50 rows a page, sticky group headers, or a virtualised list. |
| The whole table is 12px mono, so 606 names like "Micron Technology - Backpack Securities" wrap in two lines of mono | medium | `assets-top-1440-dark.png` | type scale | Names in the sans at 14px, tickers in the sans at 600, only price and target figures in mono. |
| A "Launchable" tag on every one of 606 rows | medium | `assets-top-1440-dark.png` | consistency | Tag only the exceptions (not launchable, risk labels) and let the count "584 launchable" carry the rule. |
| The 3-line explanatory paragraph under the title, repeated in style on every terminal page | low | `assets-top-1440-dark.png` | hierarchy | One line of 60 characters, the rest behind a "How assets are chosen" disclosure. |
| The table has no 24h change, no coins' volume and no "last launched", so it is a price list rather than a market map | medium | `assets-top-1440-dark.png` | trust | Columns: asset, kind and issuer, price with 24h change, liquidity, coins (with their volume), graduation target. |

### Asset page (`/assets/[mint]`)

| Issue | Severity | Shot | Principle | Instead |
| --- | --- | --- | --- | --- |
| "Solana · Solana" under the title (the name and the kind) and "worth 85 SOL when set" in the facts card | medium | `asset-sol-1440-dark.png` | consistency | Hide a kind that equals the name; omit "worth X when set" when the quote is the asset itself. |
| Two fact cards of unequal height side by side, the right one 60px shorter, with the "See them on the board" link underlined by a full-width hairline | low | `asset-sol-1440-dark.png` | alignment | One dl in two columns on a single card, or two cards aligned to the taller one. |
| The TradingView widget brings its own fonts (Trebuchet), its own greens and reds and its own toolbar into the page | medium | `asset-sol-1440-dark.png` | consistency | Pass the widget the site's colours and hide its toolbar, or draw the candles with the same lightweight-charts the coin page uses. |
| "Coins priced in SOL" is four rows of mono with a broken image and no price, change or curve | medium | `asset-sol-1440-dark.png` | trust | Reuse the board's row component, filtered to this asset. |
| The price timestamp "at Oct 25, 2026, 5:31 PM UTC" is three days stale on this stack and sits in 13px beside the price | low | `asset-sol-1440-dark.png` | trust | Relative time ("updated 5 min ago") with the absolute time on hover; stale beyond an hour gets a caution tag. |
| "Further information" is two paragraphs of prose for a risk-label system that has a tag vocabulary | low | `asset-sol-1440-dark.png` | hierarchy | A row of label tags (verified, no freeze authority, no transfer fee) with the prose behind each. |

### Launch flow (`/launch`)

| Issue | Severity | Shot | Principle | Instead |
| --- | --- | --- | --- | --- |
| The sticky summary is cut mid-sentence ("Liquidity locked for good once it graduates" clipped) because it has `max-height: calc(100dvh - 112px)` with `overflow-y: auto` and no scrollbar or fade is visible | high | `crops/launch-1440-dark-1.png` | trust | A summary short enough to fit 800px, or a visible fade and a "more" affordance; a cut line reads as a bug. |
| SOL appears twice as selected: in the recommended three and again in the 3x3 grid below the chips | medium | `launch-1440-dark.png` | consistency | The recommended three replace the first grid rows, or the grid starts after them without the duplicates. |
| The form is 2,978px tall with five numbered sections and no progress indicator; the numbers "01" to "05" are mono accent decoration | medium | `launch-1440-dark.png` | hierarchy | Either steps with a stepper and one section a screen, or one page with a real sticky index on the left; the section numbers go. |
| "Paired with" (section 01) presents 3 + 9 asset cards, 13 chips and a search before the creator has typed a name | medium | `launch-1440-dark.png` | hierarchy | Lead with the coin (image, name, ticker), then the pair as a compact chooser (the recommended three plus "Choose another" that opens the full picker). |
| The "Copy check" box shows three empty states ("Type one to check it") before anything is typed, 110px of nothing | medium | `launch-1440-dark.png` | empty state | Inline check marks beside each field once it has a value; no box until a result exists. |
| The image uploader is an 80px dashed square beside two 40px fields, so the coin's most important asset is the smallest element | medium | `launch-1440-dark.png` | hierarchy | A 160px drop zone above the fields with a live preview that feeds the summary's pair mark. |
| The Reward Launch cards split their title over two lines in two colours ("Reward Launch" then "paid in SOL" in accent) | low | `launch-1440-dark.png` | consistency | One-line titles ("Standard", "Rewards in the coin", "Rewards in SOL") with the detail in `ink-2`. |
| The bottom bar "Connect a wallet to launch..." plus a 13px disclaimer line after the form | low | `launch-1440-dark.png` | affordance | The primary action lives in the sticky summary ("Stoke FCAT for ~0.02 SOL") with the wallet prompt in its place. |
| The summary's "Trading fee" entry is a 6-line paragraph of fractions | low | `crops/launch-1440-dark-1.png` | density | "1.25% a trade" with a disclosure that shows the split. |

### Rewards (`/rewards`)

| Issue | Severity | Shot | Principle | Instead |
| --- | --- | --- | --- | --- |
| The page is a 4-line paragraph, an address input and three paragraphs of rules; no Reward Launch, no round, no payout is shown | high | `rewards-1440-dark.png` | empty state | Lead with "Coins paying holders now" (rows with tax rate, pot, next round) and a designed empty state when there are none; the rules behind a disclosure. |
| "Where are my rewards?" asks for a pasted wallet address when the header has a wallet connection | medium | `rewards-1440-dark.png` | affordance | Read the connected wallet by default; the address field as the fallback. |
| The rules' four figures (Version, Minimum holding, A round runs once, In force since) are the page's only numbers and they are rule parameters | low | `rewards-1440-dark.png` | hierarchy | Rules as a caption line; the figures a holder cares about (paid so far, next round in) as the stat row. |
| The title says "Holder rewards" while the nav and footer say "Rewards" | low | `rewards-1440-dark.png` | consistency | One name. |

### Stats (`/revenue`, `/burns`)

| Issue | Severity | Shot | Principle | Instead |
| --- | --- | --- | --- | --- |
| Revenue shows four per-asset cards in a 3-column grid, so USDC sits alone with two empty slots, and no total in one currency | high | `revenue-1440-dark.png` | hierarchy | One headline figure (total revenue in USD and SOL) with a sparkline, then per-asset rows in a table. |
| The figures are raw ("0.0809", "1.8", "0.045", "6.4") with the unit in the card's title only | medium | `revenue-1440-dark.png` | consistency | Unit beside every figure and a USD equivalent in `ink-3`. |
| "By day" is a table with one day; the Ledger is a list with the date right-aligned under a hairline and the amount above it | medium | `revenue-1440-dark.png` | consistency | The Ledger as a table (time, kind, asset, amount, to, transaction) with the transaction as the link. |
| Burns: three cards whose content is "Not launched yet", "No graduated coin yet" and "Nothing burned yet" | high | `burns-1440-dark.png` | empty state | One designed empty state explaining what will appear and when, with the one live figure (revenue waiting) as the headline. |
| The heat bars under "Burned... with" and "Flywheel spent" are empty black lines at 0% | low | `burns-1440-dark.png` | colour meaning | Hide a progress bar at zero or show the budget as a figure. |
| Revenue and Burns are "Stats" in the header but the footer lists "Burns" and "Revenue" as two pages and there is no Stats landing | low | `revenue-1440-dark.png` | consistency | A Stats page with tabs (Revenue, Burns, Rewards) or two named links everywhere. |

### Curated (`/curated`)

| Issue | Severity | Shot | Principle | Instead |
| --- | --- | --- | --- | --- |
| A numbered prose list and a "No Curated launch yet" card with a ghost button; 60% of the page is footer | medium | `curated-1440-dark.png` | empty state | A short pitch, a "Notify me" or "Follow on X" action, and a mock of what a Curated row will look like so the section has a shape. |
| The list numbers "1." "2." "3." are set in mono | low | `curated-1440-dark.png` | consistency | Ordinary list numerals in the body face. |
| The copy addresses stakers of a token that is not launched, with no date or stage | low | `curated-1440-dark.png` | trust | A stage line ("Opens after the STOKER launch") with a link to announcements. |

### API (`/api`)

| Issue | Severity | Shot | Principle | Instead |
| --- | --- | --- | --- | --- |
| A 6,839px reference whose only navigation is a row of chips at the top that scrolls away | high | `api-1440-dark.png` | affordance | A sticky left index (the eight sections and their endpoints) with the content in the remaining columns, as every API reference does. |
| Endpoint descriptions are 60 to 120 word paragraphs with inline code, in a two-column grid where the left column is a 13px mono path | medium | `crops/api-1440-dark-2.png` | density | Each endpoint as a block: method tag, path, one-line summary, then parameters and the response as tables. |
| The quickstart's answer box is cut off at the bottom with no scroll affordance | low | `crops/api-1440-dark-1.png` | affordance | A fixed-height code block with a visible scrollbar or "Show all". |
| The page title "The API" against the nav's "Developers" | low | `api-1440-dark.png` | consistency | One name ("Developers" or "API reference"). |

### 404

| Issue | Severity | Shot | Principle | Instead |
| --- | --- | --- | --- | --- |
| Every missing route says "No coin at this address. It may still be confirming" including `/does-not-exist` | medium | `404-1440-dark.png` | trust | A coin-specific message only under `/coin/`; a generic "This page does not exist" elsewhere with the board and home as actions. |
| The card floats in 530px of canvas above a 500px footer | low | `404-1440-dark.png` | spacing rhythm | Centre the card in the viewport and use the compact footer. |

### Phone (390)

| Issue | Severity | Shot | Principle | Instead |
| --- | --- | --- | --- | --- |
| The header's primary action is an unlabeled teal "+" among four 40px icon buttons (search, +, wallet, menu) | high | `crops/home-390-dark-1.png` | affordance | A labelled "Stoke" button or the CTA inside the menu, with at most three icons in the bar. |
| The open menu blurs the header (no visible close), lists six 48px links of equal weight and ends with two filled buttons of equal weight | medium | `header-menu-390-dark.png` | hierarchy | A close button, one primary and one ghost, and secondary links (Stats, Developers) a step smaller. |
| The board opens with a 17-chip cloud in mono (13 kinds and 4 assets, six rows, 300px) above the title "Coins" | high | `crops/coins-390-dark-1.png` | hierarchy, responsiveness | The title first, then one horizontal scrolling row of kind chips that have coins. |
| The figures "0.09 SOL" and "0.12 SOL" wrap onto two lines at 390 in the 2x2 bento | medium | `crops/home-390-dark-1.png` | type scale, responsiveness | A figure step that fits (28px at 390) or a single-column stat list. |
| The coin page is 4,623px tall; the chart is the fifth screen, below graduation, the trade panel and the trust card | medium | `crops/coin-390-dark-1.png`, `crops/coin-390-dark-2.png` | hierarchy | Title row, price and change, a compact chart (220px), then a sticky Buy/Sell bar at the bottom of the viewport, then the facts. |
| The launch page is 5,751px tall; the summary comes after the form and is itself clipped at 788px | high | `crops/launch-390-dark-4.png` | responsiveness | Steps on phones (coin, pair, type, review) with the summary as the review step. |
| The asset directory at 390 is 73,315px tall, every row a 5-line card in mono | high | `crops/assets-top-390-dark-2.png` | responsiveness | Paged groups; rows of two lines (ticker and name, price and coins). |
| Trending cards are 200px each, six in a column, each with a broken image | medium | `crops/home-390-dark-2.png` | density | A horizontal carousel of three, or compact rows. |

## 3. Header, hero, footer in detail

### Header

What it contains now: a 72px sticky bar with `backdrop-filter: blur(12px)`; the 22px ring and a 20px "Stoker" wordmark at the left; a detached pill at the centre on `surface-3` with a raised shadow holding six links (Explore, Curated, Assets, Rewards, Stats, Developers) at 15px in `ink-2`, the current one on `plate`, each link's word sliding up on hover; at the right a search pill ("Search", a ⌘K key cap), a 40px square scheme toggle, the filled "+ Stoke a coin" with the glow, and a "Connect wallet" ghost pill (`header-home-1440-dark.png`).
Under 1300px the pill gives way to a menu button and a full-height overlay; under 640px the CTA loses its label and becomes a "+".
The search expands at the centre of the bar and its results hang below as pills joined by the goo filter (`header-search-1440-dark.png`).

What is wrong: it is three headers in one bar, a marketing nav (the pill), a terminal's tools (search, toggle) and an app's account strip (CTA, wallet), with ten targets and four pill shapes of different radii and materials at the same weight, so no single thing is primary.
The pill's six words are all nouns of the same size with no grouping, and the sections a trader uses (Explore) and a developer uses (Developers) sit as equals.
The gooey search is a demo brought whole into a product: the field opens 400px from where it was pressed, the nav disappears, and the results drop as opaque pills over the page's own controls and rows, which is what a layer must never do.
The wallet button is a second pill the same size as the CTA, so on every page there are two buttons asking for the same first act.
The scheme toggle is a top-level control for a preference used once.

What a professional version contains: the mark and wordmark as one lockup at 24px; five links at most in the UI sans at 14px with weight 500 for the current one and an underline indicator or a `plate` chip, grouped as "Explore, Assets, Launch" (the product) and "Rewards, Stats, Developers" (the platform) with the second group a step quieter or inside a "More" menu; a search icon that expands in place into a 320px field (Linear, Jupiter) with results in a panel on `surface-3` with a backdrop; the CTA as the one filled button; the wallet as a ghost with an avatar once connected, holding the scheme toggle, the creator page and disconnect in its menu.
On phones: the lockup, the search icon, a labelled "Stoke" button, and the menu, with the menu's close button visible and its links grouped as on desktop.

### Hero

What it contains now: a 72px two-line headline in Bricolage at 92% width with "You do." in the heat gradient; a 20px lede of three lines at 82 characters each carrying both the pairing and the creator's cut; a filled "Stoke a coin" and a ghost "See the ledger"; a 640px radial glow blurred 32px behind the headline and a 24px dot grid on the canvas; then a card titled "Priced in any of 584 assets" with a 3-line paragraph, a link, and a 4x2 grid of asset tiles ordered by liquidity (`crops/home-1440-dark-1.png`, `home-1440-dark.png`).

What is wrong: the hero is text on the left and nothing on the right, which is the shape of a template whose image slot was never filled; the 820px text column leaves the 1440px viewport's right 45% to the dot grid.
The headline makes a promise about pairs and the proof under it is eight DeFi and meme tiles with no stock, so the first screen contradicts itself.
The lede's 82 characters a line is beyond the 45 to 75 range that reads comfortably, and it tries to say two things.
There is no proof of life: no live coin, no volume, no count of launches, no logos of the issuers whose stocks are the wedge, no character.
The secondary action sends a first-time visitor to the Ledger, a word the site has not explained yet.
The glow is too faint to register as a design element in dark mode and reads as a stain in light mode (`home-1440-light.png`).

What a professional version contains: a 12-column grid with the headline in 6 to 7 columns at 64 to 80px and the lede in two lines of at most 60 characters; the primary "Stoke a coin" and a secondary "Explore coins" as a text link with an arrow; in the other 5 to 6 columns the product itself, a real coin page or the board in a frameless shot that updates, or the pair mark cycling through SOL, USDC, NVDAx and SPYx, or the salamander with the ring; under the hero a strip of proof (live launches scrolling, or "paired with" logos: xStocks, Backpack, PreStocks, Jupiter, Raydium), then one section per idea (the pair, the creator's cut with its figure, the trust layer) each with its own visual, then the trending coins and the invitation.

### Footer

What it contains now: on `sunken`, 48px top padding, a `1.2fr 3fr` split; the lockup, a 2-line description, X and Telegram icons; four columns with 12px uppercase headings (SITE with 8 links, CREATORS with 1, DEVELOPERS with 2, COMMUNITY with X, Telegram and the email); a hairline; a 2-line disclaimer at 13px and the dev line in mono (`home-1440-dark.png`).

What is wrong: it is the same 500px footer on a landing and on a 450px board, so terminal pages are a third footer; the SITE column is the header again; CREATORS exists to fill a fourth column; the socials are listed twice; the legal is a paragraph without the pages that make it legal (terms, privacy, risk); no network or status line a trader looks for; the headings share the uppercase mono style of every other label on the site.

What a professional version contains: on the landing, a four-group footer by audience (Trade, Create, Platform, Legal) with the lockup, one line, the socials once, a status line ("Mainnet · all systems normal" from the API's health), and the disclaimer as one line linking to the risk page; on terminal pages a 56px single-row footer with the lockup, five links, the socials and the status, so the page ends with the data.

## 4. What the 2026-10-10 brief missed

### Principles the brief states that the site does not meet

- **Principle 1 (trust by craft).** Broken images with no fallback, the summary cut mid-sentence, a panel stretched around empty space, "Solana, Solana", "worth 85 SOL when set", an empty MODE column: every one is a craft signal a visitor reads as "unfinished".
- **Principle 2 (depth by tone before borders).** The ladder exists in the tokens, but every card still carries a 1px line and the ladder is used for almost nothing: the raised card, the floating card and the plain card look the same on the home page (`home-1440-dark.png`).
- **Principle 3 (60-30-10).** The accent is scarce as the brief asked, but the "30% secondary surfaces" became 100%: every piece of content is a surface, so the canvas never shows and the proportion is lost.
- **Principle 5 (one family, a short scale, mono for figures).** 23 distinct sizes against 11 steps; the mono face on labels, chips, controls, headers and list numerals in twelve modules; labels "one step smaller and two lighter" is met on the stat cards but not in the tables, where the header is smaller and lighter and uppercase and tracked, a fourth variable the brief never defined.
- **Principle 6 (designed empty states).** Rewards, Burns and Curated are sentences in boxes, the fault the brief named in its own section 1 ("the empty state is a sentence in a box").
- **Principle 7 (generous on the landing, tight in the terminal).** The landing is generous but ends with 130px of nothing; the terminal is not tight (52px rows, 500px footers, 24px padding on cards that hold one line).
- **Principle 11 (trends only where they carry meaning).** The bento of four figures carries zeros; the gooey search is Codrops' demo adopted for its effect, and the effect covers the page's content.
- **Section 7, the landing.** "Trending coins as cards with the coin's image, the pair mark, the curve's progress as a heat bar, and 24h change in `up` or `down`": there is no 24h change anywhere on the site; the cards say "$0 traded today".
- **Section 7, the coin page.** "The chart dominant, the trade panel docked right": the trade panel is the third card of the right column, 1,500px down, and the chart is 300px tall under a 96px title.
- **Section 7, the board.** "Rows that fit sixty coins on a laptop screen" (`globals.css`, the `.terminal` comment): the rows are 52px, so a 900px laptop shows eight.

### Principles the brief never had

- **Information architecture.** No page inventory with each page's one job, no journey per audience (a trader lands on a coin link from X, a creator lands on the launch page, a KOL lands on the home page to judge the brand), so every page became a list of everything known: the coin page has eleven cards, the home page has everything the platform has.
- **Content hierarchy per page.** No rule for what is primary, secondary and tertiary on each page, or what must be above the fold at 1440x900 and 390x844; the coin page's trade panel and the board's rows lost to decoration because nothing ranked them.
- **A layout grid.** No column grid (12 columns at 1180 and 1320 with 24px gutters) that the hero, the cards, the board and the coin page share; each module chose its own split (`220px 1fr`, `1fr 380px`, `1.2fr 3fr`, `repeat(3)`, `repeat(4)`), which is why nothing aligns across sections.
- **Imagery.** The brief named the absence of any visual and prescribed a glow and a dot grid; it never said where the character, the ring at size, coin images, issuer logos, charts and product shots appear, or what a page shows when an image is missing.
- **A component inventory.** The brief defined primitives (button, chip, input, card) but not compositions: a stat tile, a data row, a definition list, a section header with its action, a table with its alignment rules, a tag vocabulary; the asset page, the coin page and the launch summary each built their own dl, and the board, the asset directory and the asset page each built their own row.
- **A page template system.** A landing template, a directory template (board, assets), a detail template (coin, asset), a form template (launch), a ledger template (revenue, burns, rewards) and a document template (API, curated, announcements), each defined once; today each page is a one-off.
- **Data display rules.** Number formatting (four notations for one price), units beside figures, time ("3d ago" against "Oct 27, 2026, 8:17 PM UTC"), what to render at zero (never a headline), address truncation, image fallbacks, stale-data marking.
- **Table design.** Alignment (numbers right under right headers), fixed widths from content, row height per density, sort affordance, hover and the row as a link.
- **Responsive rules.** Beyond "1440 and 390", nothing: no rule for what collapses, what scrolls horizontally, what becomes a sticky bar; the phone got a chip cloud, 5,751px forms and 73,315px lists.
- **Copy and label grammar.** The brief fixed "coin" and sentence case but not label shapes, so "assets to pair with", "STOKER burned", "collected, all time" and "A round runs once" sit together.
- **Trust as a layer.** No design for verification marks, live indicators, risk tags, status, legal pages or social proof, the things a trader checks before trusting a site with money (the brief's own principle 1 says trust is decided in seconds; it never said by which elements).
- **Navigation design.** The header was decided by candidate rounds on its look; no rule for how sections group, how the current place is shown off the six pages, or how search results layer over content.
- **The audiences.** The brief designed for one visitor; the owner's list (traders, creators, marketers, KOLs, influencers, NFT projects) implies at least three entry points with different first screens, and none is named.

The brief diagnosed the right symptoms on 2026-10-10 and treated them with colour and tokens, so the redesign changed every hex and kept every layout; the owner's verdict of 2026-10-28 is about the layouts.

## 5. Keep, change, drop

- **The header's pill.** Change. Keep a detached nav group as the idea, but five links at most in the UI sans, grouped, with the account and the toggle folded into one menu; drop the fourth and fifth pill shapes so the bar has one material.
- **The gooey search.** Drop as built. Keep search as a first-class action (⌘K, an icon that expands in place) with results in a proper panel over a backdrop; the goo filter is a demo effect that obscures content and will not survive a real results list.
- **The light-dark toggle.** Keep the behaviour (follow the system, hold the choice). Move the control into the account menu or the footer; it is not a top-level action.
- **The heat gradient text.** Keep, and keep it scarce: the slogan's "You do.", the one figure paid to creators, "You earn", the graduation percentage. Drop it from secondary ledger figures ("Still to be sent") where it competes with the accent.
- **The mark.** Keep the ring. Use it at size: 160 to 240px with its bloom on the landing's creator section, the empty states and the share cards, and re-render the tile for the chosen canvas; today it exists only at 22px and 64px.
- **The asset rail.** Change. Only kinds with coins, labels in the sans, counts as figures, no "$0"; on phones a single scrolling row under the title. Keep it as the board's one "Paired with" control.
- **The pair marks.** Keep as the brand's device. Set a scale: 14px in rows, 20px in cards and search results, 28 to 32px in the coin page's title row, and the 96px size only on share cards and the launch summary; never a page title.
- **The bento figures.** Change. Figures only when non-zero, a label grammar, units beside figures, USD equivalents, and one figure in the heat; four `surface-2` cards become one stat row on the canvas so the landing has fewer boxes.
- **The trending cards.** Change. Keep the card shape; fix the row structure (image with fallback, pair mark, name, price with 24h change, curve bar, volume), drop the "Paired with" tag, and show a 24h change in up or down; six in a 3x2 grid at 1440, a scrolling row of three at 390.
- **The empty-state invitation.** Keep the pattern (ring at size, one line, one action) and apply it to Rewards, Burns, Curated and the chart with few trades; fix the 404's copy by route.
- **The launch type radio cards.** Keep. One-line titles, the detail in `ink-2`, the tick and the `plate` for the chosen one; move the section after the coin's identity.
- **The launch summary.** Keep, it is the best component on the site. Fit it in 800px (fee split behind a disclosure), a visible scroll or fade when it must scroll, the primary action inside it, and the uploaded image feeding its pair mark.
- **The trade panel.** Change its place, keep its content. Dock it beside the chart at the top of the coin page at 1440 and as a sticky bottom bar at 390; add the wallet's balance and the expected output as a live figure before the wallet connects (from the quote endpoint), and name the order ("Buy FCAT with 0.5 SOL") on the button.
- **The footer.** Change. The landing's full footer grouped by audience with legal pages and a status line; a one-row footer on every terminal page; the socials once; the disclaimer as one line with a link.
