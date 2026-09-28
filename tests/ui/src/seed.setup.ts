// Seeds a fixed set of coins through the public API, so the board the visual tests see is the same on every run.
// Names and tickers run to the contract's limits to catch text that overflows its box.
import { test as setup } from "@playwright/test";
import { fundedKeypair, launchViaApi } from "./fixtures";

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

setup("seed the board", async () => {
  const creator = await fundedKeypair(20);
  for (const coin of SEEDED) await launchViaApi(creator, coin);
});
