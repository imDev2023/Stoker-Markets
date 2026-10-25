import { platformFacts } from "@/lib/facts";
import styles from "./StatusLine.module.css";

/**
 * The terminal's status line, under the header on every page past the home: the facts a trader checks once, every
 * one of them read from the chain or the registry at render, never a constant (src/lib/facts.ts).
 */
export async function StatusLine() {
  const facts = await platformFacts();
  return (
    <div className={styles.line}>
      <dl className={`shell ${styles.facts}`}>
        {facts.map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
