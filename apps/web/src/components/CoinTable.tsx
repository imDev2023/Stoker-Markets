import type { LaunchSummary } from "@launchpad/contract";
import { COLUMNS, CoinRow } from "./CoinRow";
import styles from "./CoinTable.module.css";

/**
 * The board's table (#135): the column names once in a line that stays under the site header as the page scrolls,
 * then one row a coin. The board and an asset's page draw the same table, so a coin reads the same wherever it is
 * listed. `label` names the list for assistive technology and the tests; `busy` dims the rows while a new answer is
 * on its way.
 */
export function CoinTable({ launches, now, label = "Coins", busy = false, className = "" }: {
  launches: LaunchSummary[];
  now: number;
  label?: string;
  busy?: boolean;
  className?: string;
}) {
  return (
    <div className={`card ${styles.table} ${className}`}>
      {/* The names once, above the rows; each row names its own figures where the window is too narrow for columns. */}
      <div className={styles.columns} aria-hidden>
        {COLUMNS.map((c) => (
          <span key={c.key} className={"numeric" in c && c.numeric ? styles.numeric : undefined}>{c.name}</span>
        ))}
      </div>
      <ul className={styles.rows} aria-busy={busy} aria-label={label}>
        {launches.map((l) => (
          <li key={l.mint}>
            <CoinRow launch={l} now={now} />
          </li>
        ))}
      </ul>
    </div>
  );
}
