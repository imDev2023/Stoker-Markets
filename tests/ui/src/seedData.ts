// The coins the seed step launches with a First Buy and an Airdrop, and the Reward Launch paid in SOL, shared with the
// visual tests that look at them; and which seeded coins carry which Creator Earnings Destination (ADR 0011).
import { fixedKeypair, type LaunchFields } from "./fixtures";

/** Their Creator: a key that is the same every run, so the visual tests can connect as them. */
export const AIRDROP_CREATOR = fixedKeypair("airdrop creator");
export const AIRDROP_WALLETS = [1, 2, 3].map((n) => fixedKeypair(`airdrop wallet ${n}`).publicKey.toBase58());
const airdrop = AIRDROP_WALLETS.map((wallet, i) => ({ wallet, amount: `${(i + 1) * 1_000_000_000}000000` }));

/** 0.1 SOL, in lamports. */
const FIRST_BUY = "100000000";
export const AIRDROP_SENDING: LaunchFields = {
  name: "Welcome Drop", symbol: "DROP", description: "Launched with an airdrop its creator hasn't sent yet.", firstBuy: FIRST_BUY, airdrop,
};
export const AIRDROP_PAID: LaunchFields = {
  name: "Gift Box", symbol: "GIFT", description: "Launched with an airdrop every wallet has received.", firstBuy: FIRST_BUY, airdrop,
};

/**
 * The seeded coins whose Creator pointed their earnings away from the wallet, one per rule, each a coin whose page was
 * shot already, so no coin joins the board for them: the traded curve coin buys back and burns, the coin paired with
 * USDC pays its holders in USDC, and the graduated coin adds locked liquidity to its pool. A fourth, the coin nobody
 * has traded, chose liquidity too: nothing is ever collected on it, so its card stays as a new coin's is, waiting.
 */
export const EARNINGS_COINS = {
  burn: "Harbor Lights",
  holders: "Dollar Paired",
  liquidity: "Cap and Gown",
  waiting: "First Light",
} as const;

/** A Reward Launch whose Payout Asset is SOL, by a Creator of its own; the seed buys it and runs a round, so its page shows a sale and a payout. */
export const REWARD_CREATOR = fixedKeypair("reward creator");
export const REWARD_QUOTE: LaunchFields = {
  name: "Yield Desk", symbol: "YLD", description: "A Reward Launch whose 3% tax is sold for SOL and paid to holders in SOL.", rewardTax: "300", rewardPayout: "quote",
};
