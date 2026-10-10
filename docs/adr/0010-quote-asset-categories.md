# Quote Asset categories come from the mint, its authorities and Jupiter's tags, never from a name

Status: accepted by the owner on 2026-10-10 (#37: every asset on the site, categorised, with no warning under an asset's name).

Mainnet had 605 Quote Assets on 2026-10-10 (every Raydium LaunchLab GlobalConfig), and the board filtered them into six kinds: SOL, four stablecoins, the tokenized stocks by issuer, Hylo's three leveraged tokens, two collectibles, and about 470 "community" tokens.
That last group held memecoins, DeFi tokens, wrapped BTC and ETH, gold and the long tail of launchpad coins together.
The owner wants every asset on the site, grouped so a Creator finds the one they want, and wants the Quote Risk Labels ("Can freeze wallets", "Issuer can move tokens", "Can pause transfers", "Not on the verified list", "Low liquidity") out from under an asset's name.

## Decision

Ten categories, the `category` of every Quote Asset: `sol`, `stablecoin`, `tokenized_stock`, `rwa`, `wrapped`, `defi`, `leveraged`, `collectible`, `meme`, `community`.
The site calls them Solana, Currencies, Stocks, Real-world assets, Wrapped, DeFi, Leverage, Collectibles, Memes and Community; a tokenized stock also carries its `issuer`.

Each asset is placed by the first rule that fits, in this order (`apps/api/src/quotes/categories.ts`):

1. SOL, by mint.
2. A stablecoin: a pinned mint (USDC, USDT, USD1, EURC) or Jupiter's `stable` tag.
3. A tokenized stock: a known issuer's freeze authority or permanent delegate on the mint (xStocks, Backpack Securities, PreStocks, Tessera), or Jupiter's `stocks` tag.
4. A leveraged token or a collectible: pinned mints (Hylo's xSOL, xBTC, xHYPE; SV151, HEEBOO).
5. A real-world asset: Jupiter's `rwa` or `commodities` tag (gold, silver); stocks carry `rwa` too, which is why they come first.
6. DeFi: Jupiter's `defi`, `lst`, `original-lst`, `yield`, `yb`, `infra` or `jup-lend-earn` tag (JUP, RAY, PYTH, JTO, the staked SOL tokens, Jupiter Lend's deposits).
7. A meme: Jupiter's `meme` tag.
8. Wrapped: Portal's token bridge is the mint authority (its WBTC, ETH and BNB), a pinned Coinbase mint (cbBTC, cbADA), or Jupiter's `major` tag (OKX's xBTC). What an asset is comes before where it came from: Portal also wraps SPX6900, a meme coin first.
9. Everything else is a community token.

Jupiter's tags come from the Tokens API v2 call (`/tokens/v2/search`) the Quote Registry refresh already makes for the labels, so this adds no request and no dependency.
A change in Jupiter's tagging moves an asset at the next refresh; a new issuer of stocks or wrapped assets needs its authority added, a new stablecoin, leveraged token or collectible its mint.

Read against mainnet's 605 on 2026-10-10 these rules give 105 stocks, 131 memes, 32 DeFi tokens, 9 wrapped, 4 stablecoins, 3 leveraged, 2 real-world assets, 2 collectibles, SOL, and 316 community tokens (214 of them from pump.fun by Jupiter's `launchpad`, 45 from StonkFun).
Among the community tokens are a dozen that call themselves Dogecoin, Zcash, Sui or Chainlink, each minted by an authority nobody vouches for; they stay there until Jupiter tags them or their issuer's authority is known.

The labels stay facts in the API and move, on the site, into "Further information": the asset's own page (`/assets/<mint>`), the launch form's details under the terms, the coin page's section for its Quote Asset, and one sentence in the disclaimer.
The launch form's picker and the assets page show an asset's kind beside its name instead, a fact and not a verdict.

## Alternatives considered

- CoinGecko's categories (Meme, AI, Gaming, Liquid Staking...): richer, but a second API with one request per coin at about ten a minute on the free plan, and it lists only the better-known half of the registry; useful as a check on Jupiter's tags, not as the source.
- A hand-kept list of the 605 mints: exact on the day and wrong at the next GlobalConfig Raydium creates.
- Names and tickers: ruled out since the spike found a pump.fun coin called "GoPro - Backpack Securities"; anyone can call a token "Bitcoin" or "USD".

## Consequences

- `GET /quotes` and `GET /launches?category=` take the ten values; `quote_assets.category` is a text column, so no migration, and every row is re-categorised by the next refresh.
- The board's "Paired with" chips grow from ten to fourteen and wrap onto two lines on a laptop; the assets page shows the same chips with their counts.
- The site's own words for a kind live in `apps/web/src/lib/board.ts` (`CATEGORY_LABELS`) and `apps/web/src/lib/assets.ts` (`CATEGORY_NOTES`); the API never carries display text for a category.
- The local chain's token list (`LOCAL_QUOTE_TOKEN_LIST`) carries tags as Jupiter would give them, so the test suites exercise DeFi (JTO) and a meme (BULLWHALE) beside the kinds the chain decides.
