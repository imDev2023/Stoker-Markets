import { WSOL_MINT } from "@launchpad/chain";
import type { QuoteIssuer, QuoteMarket } from "@launchpad/contract";

/**
 * The market behind each Quote Asset, as TradingView names it (#124), for the chart on the asset's page. Data, never a
 * guess from a name (see categories.ts: a pump.fun coin calls itself "GoPro - Backpack Securities"): a tokenized stock's
 * market follows from its issuer, proven by the authorities on the mint, and the ticker that issuer gave the token; a
 * coin's from its mint address. An asset listed nowhere here has no chart. Every symbol below was checked against
 * TradingView's symbol search on 2026-10-28 (the primary US listing for a stock or fund; for a coin its "CRYPTO" index
 * across exchanges where TradingView keeps one, else a USD market on Coinbase or Kraken, else a USDT market). A new
 * listing is added by hand the same way; the venue is written as TradingView writes it (NYSE Arca's funds are "AMEX").
 */

/** What each stock issuer tokenizes, by the ticker it gives the token, with TradingView's symbol for the stock or fund behind it. */
const STOCKS: Record<QuoteIssuer, Record<string, string>> = {
  // Backed's xStocks: the stock's ticker with an x after it. GLDx, QQQx and SPYx track funds, STRCx a preferred share.
  xstocks: {
    AAPLx: "NASDAQ:AAPL",
    AMZNx: "NASDAQ:AMZN",
    "BRK.Bx": "NYSE:BRK.B",
    COINx: "NASDAQ:COIN",
    CRCLx: "NYSE:CRCL",
    DFDVx: "NASDAQ:DFDV",
    GLDx: "AMEX:GLD",
    GMEx: "NYSE:GME",
    GOOGLx: "NASDAQ:GOOGL",
    HOODx: "NASDAQ:HOOD",
    INTCx: "NASDAQ:INTC",
    KOx: "NYSE:KO",
    MCDx: "NYSE:MCD",
    METAx: "NASDAQ:META",
    MSFTx: "NASDAQ:MSFT",
    MSTRx: "NASDAQ:MSTR",
    NVDAx: "NASDAQ:NVDA",
    PLTRx: "NASDAQ:PLTR",
    QQQx: "NASDAQ:QQQ",
    SPCXx: "NASDAQ:SPCX",
    SPYx: "AMEX:SPY",
    STRCx: "NASDAQ:STRC",
    TSLAx: "NASDAQ:TSLA",
    VIDAx: "AMEX:VIDA",
  },
  // Backpack Securities (brought to Solana by Sunrise): the stock's own ticker. BOT is RoboStrategy, a closed-end fund;
  // COPX, DRAM, EWY, EWZ, SCHH, SQQQ, URA and USO are ETFs; ARM, BABA, NOK and SKHY trade in the US as depositary receipts.
  backpack: {
    AMBA: "NASDAQ:AMBA",
    AMC: "NYSE:AMC",
    AMD: "NASDAQ:AMD",
    ARM: "NASDAQ:ARM",
    BA: "NYSE:BA",
    BABA: "NYSE:BABA",
    BB: "NYSE:BB",
    BE: "NYSE:BE",
    BLK: "NYSE:BLK",
    BOT: "NASDAQ:BOT",
    BROS: "NYSE:BROS",
    BULL: "NASDAQ:BULL",
    CBRS: "NASDAQ:CBRS",
    COPX: "AMEX:COPX",
    COST: "NASDAQ:COST",
    CRWV: "NASDAQ:CRWV",
    CYPH: "NASDAQ:CYPH",
    DELL: "NYSE:DELL",
    DJT: "NASDAQ:DJT",
    DKNG: "NASDAQ:DKNG",
    DNUT: "NASDAQ:DNUT",
    DRAM: "CBOE:DRAM",
    EWY: "AMEX:EWY",
    EWZ: "AMEX:EWZ",
    FLWS: "NASDAQ:FLWS",
    FLY: "NASDAQ:FLY",
    FWDI: "NASDAQ:FWDI",
    GPRO: "NASDAQ:GPRO",
    GRND: "NYSE:GRND",
    HIMS: "NYSE:HIMS",
    HTZ: "NASDAQ:HTZ",
    IBM: "NYSE:IBM",
    IONQ: "NYSE:IONQ",
    IREN: "NASDAQ:IREN",
    JNJ: "NYSE:JNJ",
    LLY: "NYSE:LLY",
    LMT: "NYSE:LMT",
    LULU: "NASDAQ:LULU",
    LUV: "NYSE:LUV",
    MGM: "NYSE:MGM",
    MRNA: "NASDAQ:MRNA",
    MRVL: "NASDAQ:MRVL",
    MU: "NASDAQ:MU",
    NBIS: "NASDAQ:NBIS",
    NFLX: "NASDAQ:NFLX",
    NKE: "NYSE:NKE",
    NOK: "NYSE:NOK",
    PENG: "NASDAQ:PENG",
    PFE: "NYSE:PFE",
    PTN: "NASDAQ:PTN",
    PUSA: "NASDAQ:PUSA",
    QUBT: "NASDAQ:QUBT",
    RACE: "NYSE:RACE",
    RBLX: "NYSE:RBLX",
    RDDT: "NYSE:RDDT",
    RIVN: "NASDAQ:RIVN",
    RKLB: "NASDAQ:RKLB",
    RUM: "NASDAQ:RUM",
    SCHH: "AMEX:SCHH",
    SHOP: "NASDAQ:SHOP",
    SKHY: "NASDAQ:SKHY",
    SNAP: "NYSE:SNAP",
    SNDK: "NASDAQ:SNDK",
    SPHR: "NYSE:SPHR",
    SQQQ: "NASDAQ:SQQQ",
    TTWO: "NASDAQ:TTWO",
    UPS: "NYSE:UPS",
    URA: "AMEX:URA",
    USO: "AMEX:USO",
    WEN: "NASDAQ:WEN",
    WULF: "NASDAQ:WULF",
  },
  // PreStocks and Tessera tokenize private companies (OpenAI, Anthropic, Kalshi, Anduril): no public market to chart.
  prestocks: {},
  tessera: {},
};

/**
 * Coins by mint: the coin's own market, or for a wrapped coin the market of what it wraps (Portal's WBTC wraps Ethereum's
 * WBTC, which has an index of its own; Coinbase's cbBTC and cbADA redeem one for one and have none, so Bitcoin's and
 * Cardano's). Only mints whose issuer or origin is a matter of record are here; a bridged token that cannot be tied to
 * its origin (an "AAVE" or "HYPE" minted by an authority nobody vouches for) waits until it can. Beware look-alike
 * indices: TradingView's CRYPTO:METUSD is Metronome, not Meteora, and CRYPTO:SKRUSD is Saakuru, not Seeker.
 */
const COINS: Record<string, string> = {
  [WSOL_MINT.toBase58()]: "CRYPTO:SOLUSD",
  // Stablecoins (the same mints categories.ts pins).
  EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v: "CRYPTO:USDCUSD", // USDC
  Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB: "CRYPTO:USDTUSD", // USDT
  USD1ttGY1N17NEEHLmELoaybftRBUSErhqYiQzvEmuB: "COINBASE:USD1USD", // USD1
  HzwqbKZw8HxMN6bF2yFZNrht3c2iXXzpKcFu7uBEDKtr: "CRYPTO:EURCUSD", // EURC
  // Wrapped coins: Portal's (Wormhole's token bridge) and Coinbase's.
  "3NZ9JMVBmGAqocybic2c7LQCJScmgsAZ6vQqTDzcqmJh": "CRYPTO:WBTCUSD", // WBTC (Portal)
  "7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs": "CRYPTO:ETHUSD", // ETH (Portal)
  "9gP2kCy3wA1ctvYWQk75guqXuHfrEomqydHLtcTCqiLa": "CRYPTO:BNBUSD", // BNB (Portal)
  cbbtcf3aa214zXHbiAZQwf4122FBYbraNdFqgw4iMij: "CRYPTO:BTCUSD", // cbBTC, Coinbase Wrapped BTC
  cbADAmv9issuPfhFwyQG3xac4DGPd1LDSt1oz7vwJsg: "CRYPTO:ADAUSD", // cbADA, Coinbase Wrapped ADA
  J3NKxxXZcnNiMjKw9hYb2K4LUxgwB6t1FtPtQVsv3KFr: "COINBASE:SPXUSD", // SPX6900 (Portal)
  "3iQL8BFS2vE7mww4ehAqQHAsbmRNCrPxizWAT2Zfyr9y": "CRYPTO:VIRTUALUSD", // VIRTUAL (Virtuals Protocol's Solana mint)
  // Solana's own DeFi and infrastructure tokens.
  JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN: "KRAKEN:JUPUSD", // JUP
  "4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R": "CRYPTO:RAYUSD", // RAY
  jtojtomepa8beP8AuQc6eXt5FriJwfFMwQx2v2f9mCL: "CRYPTO:JTOUSD", // JTO
  HZ1JovNiVvGrGNiiYvEozEVgZ58xaU3RKwX8eACQBCt3: "CRYPTO:PYTHUSD", // PYTH
  pumpCmXqMfrsAkQ5r49WcJnRayYRqmXz6ae8H7H9Dfn: "COINBASE:PUMPUSD", // PUMP
  METvsvVRapdj9cFLzq4Tr43xK4tAjQfwX76z3n6mWQL: "COINBASE:METUSD", // MET (Meteora)
  orcaEKTdK7LKz57vaAYr9QeNsVEPfiu6QeMU1kektZE: "CRYPTO:ORCAUSD", // ORCA
  Grass7B4RdKfBCjTKgSqnXkqjwiGvQyFbuSCUJr3XXjs: "COINBASE:GRASSUSD", // GRASS
  MNDEFzGvMt87ueuHvVU9VcTqsAP5b3fTGPsHuuPA5ey: "CRYPTO:MNDEUSD", // MNDE
  METAewgxyPbgwsseH8T16a39CQ5VyVxZi9zXiDPY18m: "CRYPTO:MPLXUSD", // MPLX
  SKRbvo6Gf7GondiT3BbTfuRDPqLWei4j2Qy2NPGZhW3: "COINBASE:SKRUSD", // SKR (Seeker)
  // Meme coins born on Solana.
  "6p6xgHyF7AeE6TZkSmFsko444wqoP15icUSqi2jfGiPN": "COINBASE:TRUMPUSD", // TRUMP
  ukHH6c7mMyiWCf1b9pnWe25TSpkDDt3H5pQZgZ74J82: "CRYPTO:BOMEUSD", // BOME
  EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm: "CRYPTO:WIFUSD", // $WIF
  "9BB6NFEcjBCtnNLFko2FqVQBq8HHM13kCyYcdQbgpump": "CRYPTO:FARTCOINUSD", // Fartcoin
  DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263: "CRYPTO:BONKUSD", // Bonk
  "7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr": "COINBASE:POPCATUSD", // POPCAT
  "2qEHjDLDLbuBgRYvsxhc5D6uDWAivNFZGan56P1tpump": "COINBASE:PNUTUSD", // Pnut
  "2zMMhcVQEXDtdE6vsFS7S7D5oUodfJHE8vd1gnBouauv": "COINBASE:PENGUUSD", // PENGU
  Dz9mQ9NzkBcCsuGPFJ3r1bS4wgqKMHBPiVuniW8Mbonk: "CRYPTO:USELESSUSD", // USELESS
  FeR8VBqNRSUD5NtXAj2n3j1dAHkZHfyDktKuLXD4pump: "CRYPTO:JELLYJELLYUSD", // jellyjelly
  Dfh5DzRgSvvCFDoYc2ciTkMrbDfRKybA4SoFbPmApump: "CRYPTO:PIPPINUSD", // pippin
  CzLSujWBLFsSjncfkh59rUFqvafWcY5tzedWJSuypump: "KRAKEN:GOATUSD", // GOAT
  "8x5VqbHA8D7NkD52uNuS5nnt3PwA8pLD34ymskeSo2Wn": "CRYPTO:ZEREBROUSD", // ZEREBRO
  ED5nyyWEzpPPiWimP8vYm7sD7TD3LAt3Q3gRTWHzPJBY: "CRYPTO:MOODENGUSD", // MOODENG
  "63LfDmNb3MQ8mw9MtZ2To9bEA2M71kZUUGq5tiJxcqj9": "COINBASE:GIGAUSD", // GIGA
  A8C3xuqscfmyLrte3VmTqrAq8kgMASius9AFNANwpump: "KRAKEN:FWOGUSD", // FWOG
  GJAFwWjJ3vnTsrQVabjBVK2TYB1YtRCQXRDfDgUnpump: "KRAKEN:ACTUSD", // ACT
  Df6yfrKC8kZE3KNkrHERKzAetSxbrWeniQfyJY4Jpump: "CRYPTO:CHILLGUYUSD", // CHILLGUY
};

/** The market behind a Quote Asset, or null when none is known. A stock's needs its issuer (proven by the mint's authorities) and the ticker the issuer gave it. */
export function quoteMarket(r: { mint: string; symbol: string | null; issuer: QuoteIssuer | null }): QuoteMarket | null {
  const symbol = (r.issuer && r.symbol ? STOCKS[r.issuer][r.symbol] : undefined) ?? COINS[r.mint];
  if (!symbol) return null;
  const [venue, ticker] = symbol.split(":") as [string, string];
  return { symbol, venue, ticker };
}
