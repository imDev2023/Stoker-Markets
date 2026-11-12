import type { HoldingWeightStep, RewardRulesPage } from "@launchpad/contract";
import { HOLDING_WEIGHT_ONCE_BPS } from "@launchpad/contract";
import { formatUtc } from "@/lib/format";
import { days, diamondHands, weightMultiple } from "@/lib/holding";
import styles from "@/app/(terminal)/rewards/page.module.css";

/**
 * Diamond Hands on the Rewards page (#199, ADR 0022): the Holding Weight under the name holders see, from
 * `GET /v1/rewards/rules`. What the rule is in two sentences, the steps of the version in force as a small table,
 * every announced version that changes them with the time it applies, and the four things a holder must know.
 *
 * It renders nothing at all while no version with steps is in force or announced, so the page reads as it did before
 * the rule existed. Every step and weight is the API's; a step's wait is said in days whatever a Holding Day lasts on
 * the deployment, since a test stack alone shortens it.
 */
export function DiamondHandsRules({ rules }: { rules: RewardRulesPage }) {
  const hands = diamondHands(rules);
  if (!hands) return null;
  const { inForce, changes } = hands;
  return (
    <section id="diamond-hands" className={`card ${styles.card}`} aria-labelledby="diamond-hands-title" data-diamond-hands={inForce ? "in-force" : "announced"}>
      <h2 id="diamond-hands-title" className={`t-h3 ${styles.cardTitle}`}>Diamond Hands</h2>
      <p className={styles.note}>
        Coins you keep longer count for more in every Reward Round. A coin counts once when it is first seen in your wallet, and for more
        once you have kept it for each of the times below, so a long holder is paid more per coin than someone who bought yesterday.
      </p>
      <p className={styles.note}>
        It applies to every round alike: Holder Rewards, paid from a coin&apos;s Reward Tax, and Holder Dividends, paid from its
        Creator&apos;s earnings. In the rules this is the Holding Weight.
      </p>
      {inForce ? (
        <Steps steps={inForce.holdingWeights} label="Diamond Hands steps in force" />
      ) : (
        <p className={styles.note} data-diamond-hands-now>Until it begins, every coin counts once.</p>
      )}
      {changes.map((version) => (
        <div key={version.version} className={styles.change} data-diamond-hands-change={version.version}>
          <p className={styles.changeWhen}>
            {version.holdingWeights.length === 0 ? "Diamond Hands ends" : inForce ? "The steps change" : "Diamond Hands begins"}{" "}
            <time dateTime={version.effectiveAt}>{formatUtc(version.effectiveAt)}</time>
          </p>
          {version.holdingWeights.length === 0 ? (
            <p className={styles.note}>From then on every coin counts once again, however long it has been kept.</p>
          ) : (
            <Steps steps={version.holdingWeights} label={`Diamond Hands steps of version ${version.version}`} />
          )}
        </div>
      ))}
      <ul className={styles.points} aria-label="What a holder must know">
        <li>A sell takes your newest coins first, so the coins you keep stay as old as they were.</li>
        <li>Coins sent to another wallet start again there, as new coins.</li>
        <li>Balances are looked at once a day, so a coin&apos;s age runs from the first daily check that sees it in your wallet.</li>
        <li>The platform&apos;s treasury holds coins too, and its coins always count once.</li>
      </ul>
      <p className={styles.note}>
        A coin&apos;s page shows how your own coins of it count, once your wallet is connected, and a round&apos;s page shows what every
        payout counted for.
      </p>
    </section>
  );
}

/** A version's steps as a table: how long a coin has been kept, and what it counts for; the first row is the coin not yet at a step. */
function Steps({ steps, label }: { steps: readonly HoldingWeightStep[]; label: string }) {
  return (
    <table className={styles.steps} aria-label={label}>
      <thead>
        <tr>
          <th scope="col">Kept for</th>
          <th scope="col">Each coin counts</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <th scope="row">Under {days(steps[0]!.afterDays)}</th>
          <td>{weightMultiple(HOLDING_WEIGHT_ONCE_BPS)}</td>
        </tr>
        {steps.map((step) => (
          <tr key={step.afterDays}>
            <th scope="row">From {days(step.afterDays)}</th>
            <td>{weightMultiple(step.weightBps)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
