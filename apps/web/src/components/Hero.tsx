import Link from "next/link";
import type { LaunchSummary, PlatformInfo } from "@launchpad/contract";
import { quoteTicker } from "@/lib/format";
import { FeeSplit } from "./FeeSplit";
import { PairMark } from "./PairMark";
import styles from "./Hero.module.css";

export function Hero({ latest, platform }: { latest: LaunchSummary | null; platform: PlatformInfo }) {
  return (
    <section className={`shell ${styles.hero}`}>
      <div className={styles.copy}>
        <h1 className={styles.title}>Launch a coin. Earn from every trade.</h1>
        <p className={styles.lede}>
          Creators get {platform.creatorFeeBps / 100}% of every trade on their coin&apos;s curve. The chain pays it into a vault only the creator
          can claim, so nobody, including us, can hold it back.
        </p>
        <Link href="/launch" className={styles.cta}>Launch a coin</Link>
      </div>
      <div className={styles.plate} aria-label="How a trade's fee is split">
        <span className={styles.plateLabel}>{latest ? "Latest coin" : "Your coin"}</span>
        <PairMark base={latest?.symbol ?? "YOURS"} quote={latest ? quoteTicker(latest.quote) : "SOL"} size="fit" />
        <FeeSplit platformFeeBps={platform.platformFeeBps} creatorFeeBps={platform.creatorFeeBps} />
      </div>
    </section>
  );
}
