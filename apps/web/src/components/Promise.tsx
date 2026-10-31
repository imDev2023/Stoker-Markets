import styles from "./Promise.module.css";

/** What the team holds itself to, in the owner's words of 2026-10-31, each a card. */
const PROMISES = [
  {
    title: "We listen",
    text: "The community sets the roadmap. Creators, developers and traders tell us what is missing, we build it, and we say what changed and why.",
  },
  {
    title: "We experiment",
    text: "Asset pairing, Holder Rewards and the Creator's cut are each a bet that both sides of a trade can win. We will keep trying new ways to benefit everyone here, keep what works and drop what does not.",
  },
  {
    title: "We make rugs rare, and small",
    text: "Copy Protection, liquidity locked at graduation, risk labels on every pair and a public ledger make a rug hard to pull. When one still happens, the damage stays as small as we can make it.",
  },
];

/**
 * The team's own section (owner, 2026-10-31): why this launchpad exists and what it holds itself to, after the ideas
 * and the coins, before the invitation. Plain claims a visitor can hold us to, never a promise of returns.
 */
export function Promise() {
  return (
    <section className={`shell ${styles.section}`} aria-labelledby="promise-title">
      <div className={styles.head}>
        <span className="eyebrow">Why we build this</span>
        <h2 id="promise-title" className={`t-h2 ${styles.title}`}>Here for the long run</h2>
        <p className={`t-body ${styles.lede}`}>
          Stoker has been a long time in the making, by people who have built on Solana for longer. We want to leave the ecosystem better than we found it, and to become one of the best launchpads on it. That is earned, so here is what we hold ourselves to.
        </p>
      </div>
      <ul className={styles.list} aria-label="What we hold ourselves to">
        {PROMISES.map((p) => (
          <li key={p.title} className={`card ${styles.item}`}>
            <h3 className={styles.itemTitle}>{p.title}</h3>
            <p className={styles.itemText}>{p.text}</p>
          </li>
        ))}
      </ul>
      <p className={`t-caption ${styles.close}`}>No promise of returns. A promise of work, every day, in the open.</p>
    </section>
  );
}
