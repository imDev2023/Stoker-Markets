import type { LaunchSummary } from "@launchpad/contract";
import { explorerUrl, formatUnits, quoteTicker } from "@/lib/format";
import styles from "./CurveProgress.module.css";

/** How far a Launch's curve is toward its Graduation Target, and where the coin trades once it gets there. */
export function CurveProgress({ launch, platform }: { launch: LaunchSummary; platform: { cluster: string; rpcUrl: string } }) {
  const quote = quoteTicker(launch.quote);
  const decimals = launch.quote.decimals;
  const raised = BigInt(launch.curve.raised);
  const target = BigInt(launch.graduationTarget);
  const { status } = launch.curve;
  const done = status !== "live";
  // Rounding can leave a sold-out curve a few raw units over its target.
  const pct = done ? 100 : target === 0n ? 0 : Math.min(100, Number((raised * 10_000n) / target) / 100);
  const left = target > raised ? target - raised : 0n;

  return (
    <section className={`card ${styles.card}`} aria-labelledby="progress-title">
      <div className={styles.head}>
        <h2 id="progress-title" className={`t-h3 ${styles.title}`}>Graduation</h2>
        {status === "graduated" ? (
          <span className={styles.graduated}>Graduated</span>
        ) : (
          <span className={`${styles.pct} ${pct > 0 ? "heat-text" : ""}`}>{pct.toFixed(pct > 0 && pct < 10 ? 1 : 0)}%</span>
        )}
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
        {(raised > 0n || done) && <span className={`${styles.fill} ${status === "graduated" ? styles.fillDone : ""}`} style={{ width: `${pct}%` }} />}
      </div>
      <p className={styles.amounts}>
        <span className="mono">{formatUnits(raised.toString(), decimals)}</span> of{" "}
        <span className="mono">{formatUnits(launch.graduationTarget, decimals)}</span> {quote} raised
      </p>
      <p className={styles.note}>
        {status === "live" && `${formatUnits(left.toString(), decimals)} ${quote} more and the coin moves to a Raydium pool.`}
        {status === "graduating" && "The curve sold out. Raydium is moving the coin to its own pool, which takes a few seconds."}
        {status === "graduated" && launch.graduation && (
          <>
            The coin moved to its own{" "}
            <a href={explorerUrl("address", launch.graduation.pool, platform)} target="_blank" rel="noreferrer">
              Raydium pool
            </a>{" "}
            and trades there now.
          </>
        )}
      </p>
    </section>
  );
}
