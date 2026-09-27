import Link from "next/link";
import type { LaunchSummary } from "@launchpad/contract";
import { formatUnits, quoteSymbol, shortAddress, timeAgo } from "@/lib/format";
import { PairMark } from "./PairMark";
import styles from "./LaunchCard.module.css";

export function LaunchCard({ launch, now }: { launch: LaunchSummary; now: number }) {
  const quote = quoteSymbol(launch.quoteMint);
  return (
    <Link href={`/coin/${launch.mint}`} className={styles.card}>
      <div className={styles.top}>
        {launch.image ? (
          <img className={styles.image} src={launch.image} alt="" width={56} height={56} loading="lazy" />
        ) : (
          <div className={styles.image} aria-hidden />
        )}
        <div className={styles.titles}>
          <PairMark base={launch.symbol} quote={quote} />
          <span className={styles.name}>{launch.name}</span>
        </div>
      </div>
      {launch.description && <p className={styles.description}>{launch.description}</p>}
      <dl className={styles.facts}>
        <div>
          <dt>Creator</dt>
          <dd className="mono">{shortAddress(launch.creator)}</dd>
        </div>
        <div>
          <dt>Launched</dt>
          <dd>
            <time dateTime={launch.createdAt}>{timeAgo(launch.createdAt, now)}</time>
          </dd>
        </div>
        <div>
          <dt>Graduates at</dt>
          <dd>{formatUnits(launch.graduationTarget, 9)} {quote}</dd>
        </div>
      </dl>
    </Link>
  );
}
