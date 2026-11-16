/**
 * The Liquidity Launch (#215) in the site's words, in one place: a coin whose whole tax is added to its own pool as
 * locked liquidity, and whose holders are paid nothing from it. Its name is the main session's pick and the owner's to
 * overrule, so every page, card and form reads it from here: code, the contract, the database and the Ledger say
 * `liquidity`, and only this file says the name. Nothing here is a figure of its own: a rate is the coin's, as fixed at
 * its launch.
 */
const lineFor = (pool: string) => `The whole tax is added to ${pool} as locked liquidity, and holders are paid nothing from it.`;

export const LIQUIDITY_LAUNCH = {
  /** The launch type's name, beside "Reward Launch". */
  name: "Stoke Launch",
  /** Its tax's name, beside "Reward Tax". */
  tax: "Stoke Tax",
  /** The line that goes with the name wherever the type is offered or shown, so nobody takes it for a Reward Launch. */
  line: lineFor("the coin's pool"),
  /** The same in a few words, after the name on the launch form's row: "Stoke Launch, the tax goes to its pool, not to holders". */
  short: "the tax goes to its pool, not to holders",
} as const;

/** The line about one coin, by its ticker: "The whole tax is added to DEEP's pool as locked liquidity, and ...". */
export function liquidityLine(symbol: string) {
  return lineFor(`${symbol}'s pool`);
}

/**
 * The tax as a card's badge, where a Reward Launch says "3% tax" (the board) or "3% to holders" (a coin card): "3% Stoke
 * Tax". It names the type and is as short as the Reward Launch's words, so it fits a phone's card where they fit; the
 * line is its title, and the coin's page says the rest.
 */
export function liquidityTaxBadge(bps: number) {
  return `${bps / 100}% ${LIQUIDITY_LAUNCH.tax}`;
}

/** The type on a coin's share card, where a Reward Launch says "Reward Launch · 3% of every trade to its holders". */
export function liquidityShareLine(bps: number) {
  return `${LIQUIDITY_LAUNCH.name} · ${bps / 100}% of every trade to its pool, locked`;
}
