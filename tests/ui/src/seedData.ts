// The coins the seed step launches with a First Buy and an Airdrop, shared with the visual tests that look at them.
import { fixedKeypair, type LaunchFields } from "./fixtures";

/** Their Creator: a key that is the same every run, so the visual tests can connect as them. */
export const AIRDROP_CREATOR = fixedKeypair("airdrop creator");
export const AIRDROP_WALLETS = [1, 2, 3].map((n) => fixedKeypair(`airdrop wallet ${n}`).publicKey.toBase58());
const airdrop = AIRDROP_WALLETS.map((wallet, i) => ({ wallet, amount: `${(i + 1) * 1_000_000}000000` }));

/** 0.1 SOL, in lamports. */
const FIRST_BUY = "100000000";
export const AIRDROP_SENDING: LaunchFields = {
  name: "Welcome Drop", symbol: "DROP", description: "Launched with an airdrop its creator hasn't sent yet.", firstBuy: FIRST_BUY, airdrop,
};
export const AIRDROP_PAID: LaunchFields = {
  name: "Gift Box", symbol: "GIFT", description: "Launched with an airdrop every wallet has received.", firstBuy: FIRST_BUY, airdrop,
};
