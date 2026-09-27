// Seeds a fixed set of coins through the public API, so the board the visual tests see is the same on every run.
// Names and tickers run to the contract's limits to catch text that overflows its box.
import { test as setup } from "@playwright/test";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import { fundedKeypair, launchViaApi, tradeViaApi } from "./fixtures";

export const SEEDED = [
  { name: "Harbor Lights", symbol: "HRBR", description: "A coin for the night shift at the port." },
  { name: "Q", symbol: "Q" },
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
  const creator = await fundedKeypair(20);
  const mints: string[] = [];
  for (const coin of SEEDED) mints.push(await launchViaApi(creator, coin));
  const trader = await fundedKeypair(5);
  for (const t of TRADES) await tradeViaApi(trader, mints[0]!, t.side, t.amount);
  // The last coin sells out its curve (the local Graduation Target is 1 SOL), so a closed trade panel is on show too.
  await tradeViaApi(trader, mints.at(-1)!, "buy", BigInt(2 * LAMPORTS_PER_SOL));
});
