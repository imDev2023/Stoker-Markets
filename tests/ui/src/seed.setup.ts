// Seeds a fixed set of coins and trades through the public API, so what the visual tests see is the same on every run.
// Names and tickers run to the contract's limits to catch text that overflows its box.
import { test as setup } from "@playwright/test";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import {
  claimViaApi, coinBalance, fund, fundedKeypair, fundQuote, graduate, launchViaApi, payAirdropViaApi, runFeeCollector, runRewardRounds, SEED_CREATOR,
  SEED_HOLDER, tradeViaApi,
  type LaunchFields,
} from "./fixtures";
import { AIRDROP_CREATOR, AIRDROP_PAID, AIRDROP_SENDING, REWARD_CREATOR, REWARD_QUOTE } from "./seedData";

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

/** A coin Raydium moved into its pool, which has traded there since. */
const GRADUATED: LaunchFields = { name: "Cap and Gown", symbol: "GOWN", description: "Graduated, and trading in its Raydium pool." };

/** Trades on the first seeded coin, so its page has a chart, a history and a price. Fixed amounts keep prices fixed. */
const TRADES = [
  { side: "buy", amount: BigInt(0.2 * LAMPORTS_PER_SOL) },
  { side: "buy", amount: BigInt(0.15 * LAMPORTS_PER_SOL) },
  { side: "sell", amount: 20_000_000n * 1_000_000n },
  { side: "buy", amount: BigInt(0.05 * LAMPORTS_PER_SOL) },
] as const;

setup("seed the board", async () => {
  // Two coins launched with a First Buy and an Airdrop, one still to send and one paid, by a Creator of their own so the
  // seed Creator's page stays as it is. They go first, so the rest of the board and its latest coin are unchanged.
  await fund(AIRDROP_CREATOR.publicKey, 20);
  await launchViaApi(AIRDROP_CREATOR, AIRDROP_SENDING);
  await payAirdropViaApi(AIRDROP_CREATOR, await launchViaApi(AIRDROP_CREATOR, AIRDROP_PAID));
  // A Reward Launch paid in SOL (#43): one holder buys, the Reward Engine sells a slice of the tax and pays the round.
  await fund(REWARD_CREATOR.publicKey, 5);
  const rewardCoin = await launchViaApi(REWARD_CREATOR, REWARD_QUOTE);
  await tradeViaApi(await fundedKeypair(5), rewardCoin, "buy", BigInt(0.3 * LAMPORTS_PER_SOL));
  await runRewardRounds();

  // One fixed Creator, so the visual tests can open the Creator Fee page as that Creator.
  const creator = await fundedKeypair(20, SEED_CREATOR);
  const mints = new Map<string, string>();
  for (const coin of SEEDED) mints.set(coin.name, await launchViaApi(creator, coin));
  const trader = await fundedKeypair(5);
  for (const t of TRADES) await tradeViaApi(trader, mints.get("Harbor Lights")!, t.side, t.amount);
  // The Creator claims the SOL Creator Fee so far, so their page has a claim in its history...
  await claimViaApi(creator);
  // ...and what trades after it is theirs to claim next. Signal Fire sells out its curve (the local Graduation Target is
  // 1 SOL), so a closed trade panel is on show too.
  await tradeViaApi(trader, mints.get("Signal Fire")!, "buy", BigInt(2 * LAMPORTS_PER_SOL));
  // Dollar Paired is bought in USDC, so a non-SOL coin page has a trade and the Creator has USDC to claim.
  await fundQuote(trader.publicKey, "USDC", 30_000_000n);
  await tradeViaApi(trader, mints.get("Dollar Paired")!, "buy", 30_000_000n);

  // Cap and Gown sells out, Raydium's crank (played by the local migrate wallet) moves it to its pool, and it trades there.
  // Its trader is fixed, so a visual test can hand the test wallet some of its coins without moving the pool.
  const graduated = await launchViaApi(creator, GRADUATED);
  const holder = await fundedKeypair(5, SEED_HOLDER);
  await tradeViaApi(holder, graduated, "buy", BigInt(2 * LAMPORTS_PER_SOL));
  await graduate(graduated);
  await tradeViaApi(holder, graduated, "buy", BigInt(0.5 * LAMPORTS_PER_SOL));
  await tradeViaApi(holder, graduated, "sell", (await coinBalance(holder, graduated)) / 4n);

  // The Fee Collector's hourly run takes in the platform's revenue: the Platform Fee of every curve so far, and Cap and
  // Gown's pool fee and Fee Key LP fees, so the revenue page shows every stream. The Creator Forward then sends each
  // Creator their share, so the Creator Fee page has payments from the platform in SOL and USDC.
  await runFeeCollector();
});
