/**
 * The site's legal words in one place (#156): the welcome on a first visit, the launch and trade disclaimers, the
 * footer's risk sentence and the risk and terms pages read the same strings, so the excluded regions (confirmed by the
 * owner) and the risk sentence are changed once. The welcome's own lines are the open half of the pitch, one plain
 * risk sentence and the regions as a notice; the shape was learned from a competitor's welcome, never its words.
 */

/** The regions the site is not offered in, as a phrase after "in". */
export const EXCLUDED_REGIONS = "the United States, the United Kingdom, Canada or sanctioned countries";

/** The footer's one bold sentence, and the risk page's first. */
export const RISK_SENTENCE = "Coins launched here are speculative and can lose all their value.";

/**
 * The browser's record that the visitor accepted the disclaimer: set by the welcome's Continue (or its Escape or a
 * press outside it, since the gate blocks nothing), and by the launch and trade disclaimers, which stand in when the
 * record is gone. The UI suite sets it before every page load, so no baseline carries the welcome.
 */
export const DISCLAIMER_KEY = "launchpad.disclaimer.v1";

export const WELCOME = {
  title: "Welcome to Stoker",
  lines: [
    "Anyone can launch a coin here, paired with the asset they choose, and anyone can trade it from the first second.",
    "Coins are their creators', not ours. A price can fall to zero, and nothing on this site is advice.",
    `Not for people in ${EXCLUDED_REGIONS}.`,
  ],
  button: "Continue",
} as const;
