// Seeds a fixed set of coins and trades through the public API, so what the visual tests see is the same on every run.
// Names and tickers run to the contract's limits to catch text that overflows its box.
import { test as setup } from "@playwright/test";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import { claimViaApi, fundedKeypair, fundQuote, launchViaApi, SEED_CREATOR, tradeViaApi, type LaunchFields } from "./fixtures";

export const SEEDED: LaunchFields[] = [
  { name: "Harbor Lights", symbol: "HRBR", description: "A coin for the night shift at the port." },
  { name: "Q", symbol: "Q" },
  { name: "Dollar Paired", symbol: "USDP", quote: "USDC", description: "Priced and traded in USDC, with its Graduation Target set in USDC." },
  { name: "Chipmaker Pair", symbol: "CHPX", quote: "NVDAx", description: "Paired with a tokenized stock." },
  {
    name: "Maximum Length Coin Name Here 32",
    symbol: "WWWWWWWWWW",
    description:
      "The longest name and the widest ticker the form allows, with a description long enough to need clamping on the card. " +
      "It keeps going past two lines so the card has to cut it off cleanly rather than growing taller than its neighbours.",
    website: "https://example.com",
  },
  { name: "Signal Fire", symbol: "$FIRE", description: "Short." },
];

/** Trades on the first seeded coin, so its page has a chart, a history and a price. Fixed amounts keep prices fixed. */
const TRADES = [
  { side: "buy", amount: BigInt(0.2 * LAMPORTS_PER_SOL) },
  { side: "buy", amount: BigInt(0.15 * LAMPORTS_PER_SOL) },
  { side: "sell", amount: 20_000_000n * 1_000_000n },
  { side: "buy", amount: BigInt(0.05 * LAMPORTS_PER_SOL) },
] as const;

setup("seed the board", async () => {
  // One fixed Creator, so the visual tests can open the Creator Fee page as that Creator.
  const creator = await fundedKeypair(20, SEED_CREATOR);
  const mints = new Map<string, string>();
  for (const coin of SEEDED) mints.set(coin.name, await launchViaApi(creator, coin));
  const trader = await fundedKeypair(5);
  for (const t of TRADES) await tradeViaApi(trader, mints.get("Harbor Lights")!, t.side, t.amount);
  // The Creator claims the SOL Creator Fee so far, so their page has a claim in its history...
  await claimViaApi(creator);
  // ...and what trades after it is theirs to claim next. Signal Fire sells out its curve (the local Graduation Target is
  // 1 SOL), so a closed trade panel is on show too, and its Creator Fee ends at graduation.
  await tradeViaApi(trader, mints.get("Signal Fire")!, "buy", BigInt(2 * LAMPORTS_PER_SOL));
  // Dollar Paired is bought in USDC, so a non-SOL coin page has a trade and the Creator has USDC to claim.
  await fundQuote(trader.publicKey, "USDC", 30_000_000n);
  await tradeViaApi(trader, mints.get("Dollar Paired")!, "buy", 30_000_000n);
});
