import type { CreatorEarningsDestination } from "@launchpad/contract";

/**
 * The Creator Earnings Destination in the site's words (ADR 0011), one source for the launch form, the coin page, the
 * Creator's own page and the Ledger: where a Creator's earnings on a coin go, fixed at its launch. A rule is any
 * destination but the wallet. Nothing here is a figure: what a Creator earns is the Fees page's (owner, 2026-10-30).
 */
export type EarningsRule = Exclude<CreatorEarningsDestination, "wallet">;

/** The four choices as the launch form names them to the Creator, in the form's order. */
export const DESTINATION_NAMES: Record<CreatorEarningsDestination, string> = {
  wallet: "Your wallet",
  holders: "Your holders",
  burn: "Buy back and burn",
  liquidity: "Liquidity",
};

/** What each choice does, in one line under its name on the launch form. */
export function destinationChoiceLine(destination: CreatorEarningsDestination, coin: string, quote: string) {
  switch (destination) {
    case "wallet":
      return "Paid to you, with nothing to claim.";
    case "holders":
      return `Paid to everyone holding ${coin}, in ${quote}, by the size of their holding.`;
    case "burn":
      return `Buys ${coin} in its own market and burns what it buys.`;
    case "liquidity":
      return `Buys ${coin}, pairs it with ${quote} and locks both in its pool for good.`;
  }
}

/** How the launch summary's "You earn" row goes on for a rule, after "Half of what we collect". */
export const DESTINATION_SUMMARY: Record<EarningsRule, string> = {
  holders: "paid to your holders",
  burn: "bought back and burned",
  liquidity: "added as locked liquidity",
};

/**
 * A rule short enough for a tag or a pill: where the coin's earnings go. Never in the past tense: a coin carries its
 * tag from its launch, before its rule has done anything.
 */
export const DESTINATION_TAGS: Record<EarningsRule, string> = {
  holders: "To holders",
  burn: "To buyback and burn",
  liquidity: "To liquidity",
};

/** What a rule has done with a coin's earnings so far, after the amount: "0.02 SOL paid to holders so far". */
export const DESTINATION_APPLIED: Record<EarningsRule, string> = {
  holders: "paid to holders so far",
  burn: "spent on buybacks so far",
  liquidity: "spent on liquidity so far",
};

/**
 * Where a coin's earnings go, as the sentence the coin page's About block ends its "Creator earns" row with. `symbol`
 * is the coin's ticker and `quote` its Quote Asset's; a coin still on its curve says so, since liquidity waits for the
 * pool and the other two run on either venue.
 */
export function destinationSentence(destination: EarningsRule, coin: { symbol: string; quote: string; graduated: boolean }) {
  const venues = coin.graduated ? "" : ", on the curve and after graduation";
  switch (destination) {
    case "holders":
      return `Paid to this coin's holders in ${coin.quote}${venues}, as its Creator fixed at launch.`;
    case "burn":
      return `Used to buy ${coin.symbol} back and burn it${venues}, as its Creator fixed at launch.`;
    case "liquidity":
      return coin.graduated
        ? "Added to its pool as liquidity locked for good, as its Creator fixed at launch."
        : "Kept until the coin graduates, then added to its pool as liquidity locked for good, as its Creator fixed at launch.";
  }
}
