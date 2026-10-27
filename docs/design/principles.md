# Site design principles and the redesign brief

Written 2026-10-10 (evening) from the owner's verdict on the site as built on PRs #90 to #92, for the session that builds the redesign.
This supersedes the colour decision of 2026-10-09 (E Graphite primary, Oxblood and Midnight as alternates): the owner saw Graphite across the whole site and rejected it.
The brand decisions that stand are unchanged: the name and words, the slogan, the E2 heating ring with its amber-to-ember heat ramp, the character; the home page as the spacious landing and every page past it as the terminal; light and dark following the visitor.

## 1. The verdict

The owner, 2026-10-10: "I did not like the color scheme for our website at all. Look at our website: it's ugly. It's very bad. We need to make it beautiful, professional, and attractive. I think you're not following any design principles. Go search and find some design principles for the work we are doing and design our website according to that principle. Change the color scheme too. It seems too dull."

What the screenshots show, and why "dull" is the right word:

- The scheme has no hue by design (Graphite: "no brand hue at all"), so the 60-30-10 split is roughly 99-1-0: the only colour on the landing is three words of the slogan, one figure and one link.
- The primary button is a black pill and the secondary a white one; in dark mode both become grey pills, and nothing on the page says "press me".
- Everything is flat: each card is a hairline rectangle on a tone one step from the page, with no surface ladder, no glow and no shadow in dark mode, so the dark look is the light look with the lights off.
- Warm ivory with rust is paper and clay, an editorial palette; the brand is fire and markets and should read as luminous.
- There is no visual anywhere: no mark at size, no image, no chart, no character; the hero is a paragraph beside a five-row table.
- The figures read as a spreadsheet: four numbers under thin rules, their labels in the same grey as the status strip.
- Mono grey labels at 13px (the status strip, the chips, the section numbers) make the terminal pages read as a settings screen.
- The empty state is a sentence in a box, and the owner judges the site on an empty database.

## 2. The principles

Each principle names its source; section 9 has the links.

1. **Trust is decided in the first seconds, by craft, not copy.** A visitor asks "can I trust this with my money?" before reading a word, and the answer comes from layout density, type weight, colour precision and the quality of every microinteraction (fintech design guides, 2026). Every pixel of chrome is a trust signal, so there is no such thing as a page that only needs its information.
2. **One canvas, tonal surfaces, depth by tone before borders.** Material 3 replaces elevation shadows with a ladder of surface tones (lowest, low, container, high, highest), lighter as they rise in dark mode; Hyperliquid's terminal does the same with four steps from canvas to elevated and hairlines at 8 to 16% white; Refactoring UI says use borders sparingly and lean on background contrast, shadow and spacing. Our site has one surface and borders everywhere; it needs the ladder.
3. **A scale per hue, roles on top, proportion by 60-30-10.** Build 9 or more neutral shades and 5 to 7 of each colour before designing (Refactoring UI); Radix's 12-step scale gives each step a job (1 to 2 backgrounds, 3 to 5 components, 6 to 8 borders, 9 to 10 solids, 11 to 12 text) with APCA contrast guaranteed between its text and background steps. Then 60% neutral canvas, 30% secondary surfaces, 10% accent on the actions and the live data, and the accent reads because it is scarce.
4. **Colour means something, and each meaning has one colour.** On a trading surface green and red are direction and nothing else may compete; one signature accent flags primary actions, live datapoints and the brand mark (Hyperliquid: "numbers are the content; mint is the highlight; everything else recedes"); Stripe keeps its purple for interactive surfaces and uses other hues only decoratively. For us: one accent for action and focus, red and green for direction only, amber for caution chips only, and the heat ramp (amber to ember) reserved for the brand's moments: the mark, the slogan's "You do.", a curve warming towards Graduation, a burn, what a Creator earns.
5. **Typography is the brand; numbers are the content.** Premium products use one family with a short modular scale (4 to 6 sizes), tight tracking on display sizes (Hyperliquid 80px at -0.03em; Stripe 56px at -1.4px), navy-not-black body text, and tabular figures with `tnum` on every value that can change so digits never reflow (Stripe, Linear, Hyperliquid). Weights stay between 400 and 700 (Refactoring UI).
6. **Every interactive element has designed states.** Default, hover, focus, active, disabled and loading, each distinct in colour, transition and feel, with a designed focus ring and never the browser's; sparse visually, dense behaviourally (Stripe, Linear, Vercel). Skeletons match the layout they replace; empty states are designed, not stubbed.
7. **Spacing from one base unit, generous on the landing, tight in the terminal.** A 4px base with a scale to 96px; marketing sections at 96px, content panels at 24px, dense rows at 8 to 12px (Hyperliquid); start with too much whitespace and remove (Refactoring UI).
8. **Dark is the hero look, light is designed, not inverted.** Dark mode is the standard on every exchange and the terminal canon is a blue-shifted near-black canvas with one luminous accent (Hyperliquid, Linear); the landing and the light mode take the same roles with the same accent on a clean cool white with blue-tinted shadows (Stripe). Light and dark follow the visitor (settled).
9. **Depth comes from a light source and from glow, used once.** Two-layer shadows with one light direction in light mode (Stripe's blue-tinted far layer plus a neutral close layer); in dark mode tone steps and hairlines first, an ambient shadow for raised cards, and a glow only on the primary action and the focus ring (Hyperliquid).
10. **Accessibility is the floor.** AA (4.5:1) for every text role on every surface it sits on, computed from the tokens, never eyeballed; never colour alone for meaning (a tick beside the chosen card, an arrow beside a change).
11. **Trends only where they carry meaning.** 2026's bento grids, soft gradients, refined glass and kinetic type earn their place when they organise information (a bento of live figures) or carry the brand (the heat as a gradient, a glow behind the ring); never as decoration on a page that has nothing to say.

## 3. The colour system to build

### Roles

The components already use role tokens, so a redesign starts by giving the roles new values and new siblings, then upgrading the components that need more than a token.
Existing roles keep their names: `bg`, `surface`, `sunken`, `line`, `ink`, `ink-2`, `ink-3`, `accent`, `accent-strong`, `on-accent`, `plate`, `button`, `on-button`, `brand`, `up`, `up-bg`, `down`, `down-bg`, `caution`, `caution-bg`, `heat-low`, `heat-high`, `shadow`.
New roles: `surface-2` (a raised card, a hovered row, the trade panel), `surface-3` (a popover, a dialog, a menu), `line-strong` (a focused or hovered edge), `glow` (the primary action's halo), `ring` (the focus ring), `shadow-raised` (a raised card), `heat` (the ramp as a gradient, already derived), `brand-gradient` (the heat as text fill for the slogan and for big figures that are the brand's).

Rules of use:

- `button` is the accent fill, with `on-button` text; the black pill is gone. The secondary button is a ghost with `line-strong`, and the tertiary a text link in `accent`.
- `accent` is text and icons on `surface`; on `plate` use `accent-strong`.
- `up` and `down` only ever mean direction; `caution` only on label chips.
- The heat ramp appears as a gradient (`heat`) on a curve's fill and a burn's bar, as `brand-gradient` text on the slogan's "You do." and on the figure paid to Creators, and as a soft glow behind the ring; never as a button.
- Hairlines are white or ink at low alpha, never a grey hex, so they sit right on every surface.

### Three directions

Every direction keeps the same heat ramp, the same direction colours and the same caution, so the mark and the live data are identical across them; what changes is the neutral's tint and the signature accent.
All text roles below meet AA on the surfaces they are used on (checked 2026-10-10 with a contrast script; the few that missed were corrected before this table).

**A. Cobalt (recommended).** A blue-shifted near-black canvas and an electric cobalt for action: blue is the hue finance uses for trust, and cobalt against the ember's orange is a complementary pair, so the heat glows harder next to it. Nobody large on Solana owns blue-and-ember. The furnace story holds: cold steel and the ember.

| Role | Dark | Light |
| --- | --- | --- |
| bg | `#070a12` | `#f6f8fc` |
| surface | `#0e1320` | `#ffffff` |
| surface-2 | `#141b2c` | `#f0f3f9` |
| surface-3 | `#1b2338` | `#ffffff` with shadow-raised |
| sunken | `#04060c` | `#eceff6` |
| line | `rgb(255 255 255 / 8%)` | `#dfe4ef` |
| line-strong | `rgb(255 255 255 / 16%)` | `#c6cfe2` |
| ink | `#eef2ff` | `#0b1020` |
| ink-2 | `#a9b3cc` | `#4a5470` |
| ink-3 | `#7d88a3` | `#606a86` |
| accent | `#5b84ff` | `#2457f5` |
| accent-strong | `#8aa6ff` | `#1a45cc` |
| button / on-button | `#3560ff` / `#ffffff` | `#2457f5` / `#ffffff` |
| plate | `#152650` | `#e6edff` |
| brand (heat as text) | `#ff9a5c` | `#c7410c` |
| heat-low / heat-high | `#ffb020` / `#ff5a1f` | `#f59e0b` / `#ea4a1c` |
| up / up-bg | `#34d399` / `#0f2b22` | `#0b7a52` / `#dff5ea` |
| down / down-bg | `#ff5c6c` / `#3a1a22` | `#c4262f` / `#fde6e8` |
| caution / caution-bg | `#fbbf24` / `#3a2d12` | `#9a5d05` / `#fef5df` |
| glow | `0 0 0 1px rgb(91 132 255 / 35%), 0 0 24px rgb(91 132 255 / 25%)` | `0 0 0 1px rgb(36 87 245 / 25%), 0 8px 24px -8px rgb(36 87 245 / 35%)` |
| ring | `0 0 0 3px rgb(91 132 255 / 55%)` | `0 0 0 3px rgb(36 87 245 / 35%)` |
| shadow | `0 4px 16px rgb(0 0 0 / 50%)` | `0 1px 2px rgb(11 16 32 / 6%), 0 12px 32px -12px rgb(36 87 245 / 18%)` |

**B. Violet.** The same structure with an indigo-shifted neutral and a violet accent between Stripe's purple and Phantom's periwinkle; reads Solana-native and editorial. The risk is that purple on dark is Phantom's and Solana's own look, so the brand borrows its identity.

| Role | Dark | Light |
| --- | --- | --- |
| bg / surface / surface-2 / surface-3 / sunken | `#09081a` / `#110f26` / `#181534` / `#201c42` / `#05040f` | `#f7f6fc` / `#ffffff` / `#f1effa` / `#ffffff` / `#ecebf6` |
| line / line-strong | `#221f3d` / `#332e58` | `#e1def0` / `#c9c4e3` |
| ink / ink-2 / ink-3 | `#f0eefc` / `#aca7cc` / `#8882aa` | `#120f2a` / `#4d4870` / `#6d678f` |
| accent / accent-strong | `#8b7cff` / `#aa9fff` | `#5b45e6` / `#4633bf` |
| button / on-button | `#8b7cff` / `#0b0a1f` | `#5b45e6` / `#ffffff` |
| plate | `#241f55` | `#ebe7ff` |
| heat, up, down, caution | as A | as A |

**C. Teal.** The terminal canon as traders know it: a near-black canvas with a mint-teal accent, dark text on the accent fill. The risk is that it is Hyperliquid's and Jupiter's territory, and the light mode's teal has to go deep (`#077466`) to pass AA, which loses the luminosity that makes the dark side work.

| Role | Dark | Light |
| --- | --- | --- |
| bg / surface / surface-2 / surface-3 / sunken | `#05090e` / `#0b1219` / `#111a24` / `#17222e` / `#03060a` | `#f5f8f9` / `#ffffff` / `#eef3f5` / `#ffffff` / `#e9eff2` |
| line / line-strong | `#182330` / `#26364a` | `#dbe4e8` / `#c2d0d6` |
| ink / ink-2 / ink-3 | `#eaf3f5` / `#a3b4bc` / `#768a94` | `#0a1418` / `#45565e` / `#5c6d75` |
| accent / accent-strong | `#2fd3c0` / `#6fe8d8` | `#077466` / `#065c51` |
| button / on-button | `#2fd3c0` / `#04120f` | `#077466` / `#ffffff` |
| plate | `#0f3330` | `#dcf4ef` |
| heat, up, down, caution | as A | as A |

Seen before and not offered again: an ember or amber accent (the owner excluded orange as the signature on 2026-10-09, and it would collide with caution and with the heat's meaning); warm neutrals (the dullness).

### The mark on the new canvas

The E2 ring keeps its amber-to-ember ramp.
Its tile is dark graphite today (`#141312`) so that one image serves both modes; on a blue-shifted canvas a warm-black tile reads as a mistake, so the tile becomes the chosen direction's `bg` (dark) and the marketing folder re-renders `icon.png` and the avatars from the same values.
`stoker-marketing/brand/tokens.css` and the colour section of `brand/decisions.md` are stale from this verdict on; tell that folder's session.

## 4. Depth

- Dark: the surface ladder does the work (canvas, surface, surface-2, surface-3), hairlines at 8% white, a 1px inner top highlight at 4% white on raised cards, `shadow` only on surface-3 and on a card that floats (the launch summary, the trade panel), `glow` only on the primary button and on a live datapoint that just changed.
- Light: white cards on the cool canvas with the two-layer blue-tinted shadow, hairlines in `line`, the inner highlight dropped.
- One light source, top-left, in both modes.
- A soft radial glow of the heat (the ring at about 600px, blurred, 15 to 20% opacity) behind the landing's headline, and a faint dot grid or mesh at 3% on the canvas, are the only decoration.

## 5. Type

The families were Archivo display, Public Sans body and IBM Plex Mono figures until 2026-10-11, when the owner picked T3 on "Stoker Type" (https://claude.ai/artifact/Hh1kFK1tBbfjS4i1uBEpE6, nine pairings rendered as the same slice of the real site): Bricolage Grotesque display (its optical-size axis gives the headline and the wordmark their voice; its width axis runs 75% to 100%, so the display step sits at 92% and everything else at 100% where Archivo sat at 112% and 125%), Instrument Sans body, JetBrains Mono figures.
The same day the owner saw the spacing and padding as wrong since the change; measured against the old families on every page at 1440 and 390, no box had moved, but Bricolage's full width is a fifth narrower than Archivo's 125%, so the pair marks, the wordmark and the headings at 92% sat small in cells cut for the wider face.
The fix was proportion, not padding: the heading steps at 100% with the tracking opened (`-0.015em`, `-0.01em`, `0`), the pair marks a step up (`sm` 17px, `md` 24px, `lg` up to 44px, `fit` up to 96px), the wordmark 20px, the tickers in the trade panel and the filter 16px; the hero keeps the 92% at opsz 96 the owner picked.
The scale and the discipline below are unchanged.

| Step | Size / line / tracking | Weight | Use |
| --- | --- | --- | --- |
| display | 72px / 0.95 / -0.03em (56px at 900px, 40px on phones) | 700 | the landing's headline only |
| h1 | 40px / 1.1 / -0.02em | 700 | a terminal page's title |
| h2 | 28px / 1.2 / -0.015em | 600 | a section |
| h3 | 20px / 1.3 / -0.01em | 600 | a card's title |
| lede | 20px / 1.5 | 400 | the landing's lede, in ink-2 |
| body | 16px / 1.55 | 400 | running text |
| ui | 14px / 1.4 | 500 | buttons, chips, labels, table cells |
| caption | 13px / 1.4 | 400 | hints, timestamps, in ink-3 |
| figure-xl | 44px mono / 1 / -0.02em | 500 | a bento figure |
| figure | 16px mono / 1.3 | 500 | a price, a balance |
| figure-row | 13px mono / 1.3 | 400 | a dense row |

Every figure sets `font-variant-numeric: tabular-nums` and `slashed-zero`.
Labels sit above or beside their value one step smaller and two steps lighter; a value is never the same colour and weight as its label.
Sentence case everywhere; small caps labels only as the eyebrow over a card, at +0.08em.

## 6. Spacing, radius, motion constants

- Spacing: 4px base; 4, 8, 12, 16, 24, 32, 48, 64, 96. Landing sections at 96px, terminal panels at 24px, dense rows at 8 to 12px.
- Radius: landing 16px cards and 12px controls; terminal 10px panels, 8px controls, 6px inputs in rows; chips and avatars pill. The existing `--radius` and `--radius-sm` carry these per group.
- Motion constants are set now and used by unit (5) later: `--ease: cubic-bezier(0.2, 0.8, 0.2, 1)`, `--fast: 120ms`, `--base: 200ms`, `--slow: 320ms`; hover and focus at fast, panels and menus at base, page-level reveals at slow; `prefers-reduced-motion` stays honoured.

## 7. Page by page

**The landing (`/`).** The headline at display size with "You do." in `brand-gradient`, the heat glow behind it; the lede in ink-2 at 20px, 60 characters wide; the primary button in `button` with `glow`, the secondary a ghost. The "Priced in any of N assets" table becomes a live asset strip: logos of the deepest markets (the chooser already orders by `liquidityUsd`) with the kind chips, and the count as a figure-xl. The four figures become a bento of four `surface-2` cards (figure-xl in mono, the label in caption, a delta chip where there is one), with the paid-to-creators figure in `brand-gradient`. Trending coins as cards with the coin's image, the pair mark, the curve's progress as a heat bar, and 24h change in `up` or `down`. The empty database shows the invitation card with the ring at size, never a sentence in a box.

**The terminal shell (every page past the home).** The header (owner, 2026-10-13, H4 on "Stoker Header", picked over a side rail, a command bar and two tiers): a 72px bar with no hairline, translucent over the page, the sections (Explore, Curated, Assets, Rewards, Stats, Developers last, which is the API page; owner, 2026-10-25, the day four lighter candidates were seen on the real site and none picked: the pill stays, Burns and Revenue under one section, Ledger, renamed Stats the same night; the same night Curated was added, #118, and the API link turned from GitHub to the site's own reference page) in a detached pill at its middle on `surface-3` with the raised shadow, the current one on `plate`, a link's word sliding up and its twin in from below on hover; the mark far left; far right the gooey search (a pill in the nav pill's own material that stretches into a field, a disc breaking off its end and the coins found dropping out of its underside as pills joined by Lucas Bebber's goo filter, after Codrops' gooey search), the light-or-dark toggle (owner, 2026-10-13: the page follows the system setting until the toggle is pressed, then the choice holds as a cookie), "Stoke a coin" as the one filled action, and the account; under 1300px (1200px until the sixth word, Developers) the pill gives way to a menu button and a full-height overlay with the links set large; the footer on `sunken`. The status strip (a ticker bar on `sunken` under the header with the network, the quote asset count, the fees and the Graduation Target) was removed by the owner on 2026-10-25, the day the merged header was judged congested: every figure it carried is on the page that concerns it.

**The board (`/coins`).** The controls as they are (the owner's rule: never behind an empty state), the active chip in `plate` with `accent-strong` text, the sort as a segmented control on `sunken`; rows on `surface` with `surface-2` on hover, the coin's image, the pair mark, mono figures, the curve's progress as a thin heat bar, change in `up` or `down` with an arrow.

**The coin page.** The chart dominant in a `surface` panel, the trade panel docked right on `surface-2` with the primary button in `button`, the curve's progress as the heat gradient, trades and holders as dense rows.

**The launch page.** The form's cards on `surface`, inputs on `sunken` with `line` and `ring` on focus, the chosen type card and the chosen Quote Asset card edged in `accent` with `plate` behind; the summary on `surface-2` with `shadow-raised`, its "You earn" figure in `brand-gradient`, the trust lines with `up` ticks; the action in `button` with `glow`.

**Assets, rewards, burns, revenue.** Panels on `surface`, figures in mono, a page's one key figure as figure-xl, the burn's bar and a curve's fill in heat.

**Empty states and errors.** The ring at size on `surface-2` with one line and the primary action; the character takes these over when the marketing folder delivers the transparent PNG.

## 8. The build plan for the next session

1. Work in `.claude/worktrees/site-redesign` on branch `site-redesign` (stacked on `launch-page`, PR #92, so it has the terminal build, the asset pages and the launch page); if #90 to #92 have merged by then, `git merge origin/main` (never rebase a pushed branch). Its own stack is the one in the memory `worktree-own-api-stack`: chain 8950, stand-ins 8807 and 8808, API 8793 on `launchpad_launchpage`, web 3101.
2. Tokens first (`apps/web/src/app/globals.css`): the three directions as `data-theme` blocks `cobalt`, `violet`, `teal`, the new roles, cobalt as `NEXT_PUBLIC_THEME`'s default; the Graphite, Oxblood and Midnight blocks go (git has them).
3. The primitives next, in the shared modules: buttons (primary, ghost, text), chips, inputs with the ring, cards on the ladder, the status strip, the type steps as classes, the glow.
4. Then the pages in the order of section 7, each screenshotted at 1440 and 390 in light and dark through the unlisted `?theme=` override, in all three directions.
5. The owner picks on a private artifact page ("Stoker Redesign": every page in every direction, both modes, jump links, the candidate list at the foot of each), by elimination; when the answer is "more", ask for the axis in the same message. The lesson of Graphite: the owner must see the real site, not candidate frames, before a direction is settled.
6. Verification for the PR: `pnpm lint`, `pnpm typecheck`, one UI run with `pnpm test:ui --update-snapshots=all` (every pixel changes, so `changed` would miss nothing but `all` is honest), every re-baselined image reviewed by the aligned diff, the key grind paused for the run and resumed after. The backend suite is untouched (no API change).
7. One PR, stacked on #92; a status comment on #37; the marketing folder told about the tokens and the tile.
8. Unit (5), motion, follows on the chosen direction and consumes the ring's vector; the constants in section 6 are its hooks.

## 9. Sources

- Fintech design guides, 2026: [Eleken, modern fintech design guide](https://www.eleken.co/blog-posts/modern-fintech-design-guide), [Fuselab, fintech UX design guide 2026](https://fuselabcreative.com/fintech-ux-design-guide-2026-user-experience), [The Skins Factory, fintech UI/UX](https://www.theskinsfactory.com/uiux-design-blog/fintech-ui-ux-design).
- Trading terminals: [Hyperliquid's design tokens and rules](https://www.webdesignhot.com/api/design-md/hyperliquid.md), [trading dashboard design examples](https://adminlte.io/blog/trading-dashboard-design-examples/), [Kraken's design notes](https://getdesign.md/kraken/design-md).
- Premium product design: [Stripe's design tokens and rules](https://webdesignhot.com/design.md/stripe/), [what makes Stripe, Linear and Vercel feel premium](https://mantlr.com/blog/stripe-linear-vercel-premium-ui).
- Colour systems: [Refactoring UI, the tactical principles](https://cdn.jsdelivr.net/npm/claude-code-skills@0.5.0/data/skills/ux-ui-design-system/references/refactoring-ui.md), [the 60-30-10 rule](https://blog.logrocket.com/ux-design/60-30-10-rule), [Radix Colors](https://radix-ui.com/themes/docs/theme/color), [Material 3 tone-based surfaces](https://material.io/blog/tone-based-surface-color-m3), [Material dark theme](https://m2.material.io/design/color/dark-theme).
- Crypto brands' palettes: [Hyperliquid vs Coinbase](https://www.webdesignhot.com/design.md/hyperliquid/diff/coinbase/), [Phantom](https://www.webdesignhot.com/api/design-md/phantom-app.md).
- 2026 trends, used with restraint: [Line25, web design trends 2026](https://line25.com/articles/web-design-trends-2026/), [Studio Meyer, web design trends 2026](https://studiomeyer.io/en/blog/webdesign-trends-2026).
