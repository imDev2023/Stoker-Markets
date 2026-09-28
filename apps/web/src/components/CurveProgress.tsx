import type { LaunchSummary } from "@launchpad/contract";
import { formatUnits, QUOTE_DECIMALS } from "@/lib/format";
import styles from "./CurveProgress.module.css";

/** How far a Launch's curve is toward its Graduation Target. */
export function CurveProgress({ launch, quote }: { launch: LaunchSummary; quote: string }) {
  const raised = BigInt(launch.curve.raised);
  const target = BigInt(launch.graduationTarget);
  const done = launch.curve.status !== "live";
  // Rounding can leave a sold-out curve a few raw units over its target.
  const pct = done ? 100 : Math.min(100, Number((raised * 10_000n) / target) / 100);
  const left = target > raised ? target - raised : 0n;

  return (
    <section className={styles.card} aria-labelledby="progress-title">
      <div className={styles.head}>
        <h2 id="progress-title" className={styles.title}>Graduation</h2>
        <span className={styles.pct}>{pct.toFixed(pct > 0 && pct < 10 ? 1 : 0)}%</span>
      </div>
      <div
        className={styles.track}
        role="progressbar"
        aria-labelledby="progress-title"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        aria-valuetext={`${pct.toFixed(1)}% of the graduation target raised`}
      >
        {raised > 0n && <span className={styles.fill} style={{ width: `${pct}%` }} />}
      </div>
      <p className={styles.amounts}>
        <span className="mono">{formatUnits(raised.toString(), QUOTE_DECIMALS)}</span> of{" "}
        <span className="mono">{formatUnits(launch.graduationTarget, QUOTE_DECIMALS)}</span> {quote} raised
      </p>
      <p className={styles.note}>
        {launch.curve.status === "live"
          ? `${formatUnits(left.toString(), QUOTE_DECIMALS)} ${quote} more and the coin moves to a Raydium pool.`
          : launch.curve.status === "graduating"
            ? "The curve sold out. Raydium is moving the coin to its own pool."
            : "The coin has moved to a Raydium pool."}
      </p>
    </section>
  );
}
