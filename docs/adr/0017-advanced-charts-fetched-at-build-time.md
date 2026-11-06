# Advanced Charts on the coin pages: TradingView's library fetched at build time, fed from our own candles

Status: built on 2026-11-06 for #126 (the owner's go of 2026-11-05 and 2026-11-06), waiting for the owner's review.

On 2026-10-27 the owner's GitHub account was granted TradingView's private `tradingview/charting_library` (Advanced Charts).
Its licence allows use on our own site only, and this repository is public, so the library can never be committed here, published to a public CDN or served from anywhere but our own origin.
The coin page's chart was Lightweight Charts (`PriceChart`), the owner's verdict of 2026-10-26 being that Advanced Charts with our own data is the upgrade path.

## Decision

- The web build fetches the library: `apps/web/scripts/charting-library.mjs` downloads one pinned release (`VERSION`, v33.0.0) of the private repository as a tarball through GitHub's API, with a token that can read it (`GITHUB_TOKEN`, `GH_TOKEN` or the signed-in GitHub CLI's), and unpacks only its `charting_library/` folder into `apps/web/public/charting_library/`, which is git-ignored and ignored by the lint.
  `pnpm build` runs it first and fails without a token, since a deploy without the library has no chart; `pnpm dev` runs it with `--optional` and the chart then says it could not load.
  A folder that already holds the pinned release is left alone, so only the first build of a checkout downloads it.
- The library is served from our own origin as a static asset: OpenNext copies `public/` into the web Worker's `ASSETS`, and the page loads `/charting_library/charting_library.standalone.js` once (`loadChartingLibrary` in `apps/web/src/lib/charting.ts`).
- The few parts of the library's API the page uses are typed in `apps/web/src/lib/charting.ts` by hand, with the library's own names and shapes, because its typings ship inside the library; they were checked against v33.0.0's `charting_library.d.ts` by assigning one to the other, and a new release is checked the same way.
- The datafeed is a JavaScript object in the web app (`apps/web/src/lib/datafeed.ts`), a pure client of the public API (ADR 0003): history from `GET /v1/launches/:mint/candles`, which gained `before` (Unix seconds, exclusive, by where a candle starts) and `limit` (up to 500) so the chart pages back through a coin's whole history, and the live candle from the same endpoint every four seconds, the coin page's own refresh.
  No UDF adapter on the API: it would add three endpoints in a format of TradingView's for one client that can read ours.
- The chart follows the site's tokens: the theme from `data-scheme`, the canvas's colours through `overrides`, and the toolbars' and menus' through the library's `--tv-color-*` custom properties, read again whenever `data-scheme` or `data-theme` changes (`apps/web/src/lib/chartTheme.ts`).

## Considered Options

- A private git submodule: every checkout, agent and cloud session would need access to the private repository just to clone ours, and a submodule's commit pointer in a public repository names the private one in every clone.
- Committing the library to a private fork of this repository: two repositories to keep in step for one folder.
- The UDF-compatible datafeed against a UDF adapter on the API: see above.

## Consequences

- A build machine needs a GitHub token with read access to `tradingview/charting_library`; the owner's Mac has one through `gh`. A cloud session without it can type-check, lint and run the backend suite, but not build the web or run the UI suite, which needs the library (its global setup fetches it).
- A new release of the library is a change of `VERSION`, the typings check above and a UI run.
- The library's own attribution stays as it draws it.
