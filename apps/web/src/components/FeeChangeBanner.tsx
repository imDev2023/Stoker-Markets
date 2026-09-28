import Link from "next/link";
import type { FeeAnnouncement, PlatformInfo } from "@launchpad/contract";
import { formatUtc } from "@/lib/format";
import styles from "./FeeChangeBanner.module.css";

/**
 * An announced Platform Fee or Creator Fee change, shown on every page from the moment it is announced until it is
 * applied: a change to every live curve at once never comes as a surprise (#22).
 */
export function FeeChangeBanner({ announcement, platform }: { announcement: FeeAnnouncement; platform: PlatformInfo }) {
  const due = new Date(announcement.effectiveAt).getTime() <= Date.now();
  const same = (bps: number, now: number) => bps === now;
  const changes = [
    same(announcement.creatorFeeBps, platform.creatorFeeBps) ? null : `the Creator Fee to ${announcement.creatorFeeBps / 100}%`,
    same(announcement.platformFeeBps, platform.platformFeeBps) ? null : `the Platform Fee to ${announcement.platformFeeBps / 100}%`,
  ].filter((c): c is string => c !== null);
  return (
    <aside className={styles.banner} role="status">
      <div className={`shell ${styles.inner}`}>
        <strong>Fee change {due ? "due" : "announced"}:</strong>{" "}
        {changes.length ? `${changes.join(" and ")} on every coin's curve` : "the fees on every coin's curve stay as they are"}
        {due ? ", applied once the platform's admin signs it." : ` from ${formatUtc(announcement.effectiveAt)}.`}
        {announcement.note && <> {announcement.note}</>}{" "}
        <Link href="/announcements">Every announcement</Link>
      </div>
    </aside>
  );
}
