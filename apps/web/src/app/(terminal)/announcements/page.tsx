import type { Metadata } from "next";
import { pageMeta } from "@/lib/meta";
import Link from "next/link";
import { getBudgets, getCreatorLadder, getPlatform, listAnnouncements } from "@/lib/api";
import { budgetLine } from "@/lib/budget";
import { explorerUrl, formatUtc } from "@/lib/format";
import { ladderLine } from "@/lib/ladder";
import styles from "../rewards/page.module.css";

export const metadata: Metadata = pageMeta({
  path: "/announcements",
  title: "Fee changes",
  description: "Every announced change to the Platform Fee or Creator Fee, to the Creator's share and to how the platform's own share is divided, before it applies and after.",
});

/** Every fee change ever announced, public: a change to every live curve at once is announced ahead and recorded after. */
export default async function AnnouncementsPage() {
  const [list, platform, budgets, ladder] = await Promise.all([listAnnouncements(), getPlatform(), getBudgets(), getCreatorLadder()]);
  const now = Date.now();
  // The first version is how the share was divided from the start; every later one was announced here first (ADR 0019).
  const tables = budgets.versions.filter((v) => v.version > 1).reverse();
  // Likewise the Creator Ladder: the first version is the ladder coins started on (ADR 0020).
  const ladders = ladder.versions.filter((v) => v.version > 1).reverse();
  return (
    <div className={`shell ${styles.page}`}>
      <h1 className={`t-h1 ${styles.title}`}>Fee changes</h1>
      <p className={styles.lead}>
        Every coin&apos;s curve pays the Platform Fee and the Creator Fee as the chain has them right now, which the <Link href="/fees">Fees page</Link> shows.
        A change is announced here at least a day ahead, with the new figures, and shows its transaction once the platform&apos;s admin has applied it.
      </p>
      <section className={`card ${styles.card}`} aria-labelledby="announcements-title">
        <h2 id="announcements-title" className={`t-h3 ${styles.cardTitle}`}>Announcements</h2>
        {list.announcements.length === 0 ? (
          <p className={styles.note}>No fee change has ever been announced.</p>
        ) : (
          <ul className={styles.list}>
            {list.announcements.map((a) => {
              const state = a.appliedSignature ? "applied" : new Date(a.effectiveAt).getTime() <= now ? "due, waiting for the admin's signature" : "announced";
              return (
                <li key={a.id}>
                  <span>
                    Platform Fee {a.platformFeeBps / 100}%, Creator Fee {a.creatorFeeBps / 100}% from {formatUtc(a.effectiveAt)} ({state})
                    {a.note && <> · {a.note}</>}
                    {a.appliedSignature && (
                      <>
                        {" "}· <a href={explorerUrl("tx", a.appliedSignature, platform)} target="_blank" rel="noreferrer">transaction</a>
                      </>
                    )}
                  </span>
                  <span className={styles.when}>announced {formatUtc(a.announcedAt)}</span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
      <section className={`card ${styles.card}`} aria-labelledby="ladder-title">
        <h2 id="ladder-title" className={`t-h3 ${styles.cardTitle}`}>The Creator&apos;s share</h2>
        <p className={styles.note}>
          A Creator&apos;s share of their coin&apos;s fees climbs with the coin by the Creator Ladder, shown on the{" "}
          <Link href="/fees#creator-ladder">Fees page</Link>. A new ladder is announced here at least a day ahead and applies only to what is
          collected from its date on; a coin keeps every tier it has reached.
        </p>
        {ladders.length === 0 ? (
          <p className={styles.note}>The ladder has not changed since the start.</p>
        ) : (
          <ul className={styles.list}>
            {ladders.map((v) => {
              const state = v.version === ladder.inForce ? "in force" : new Date(v.effectiveAt).getTime() > now ? "announced" : "replaced";
              return (
                <li key={v.version}>
                  <span>
                    {ladderLine(v)}, from {formatUtc(v.effectiveAt)} ({state})
                    {v.note && <> · {v.note}</>}
                  </span>
                  <span className={styles.when}>announced {formatUtc(v.announcedAt)}</span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
      <section className={`card ${styles.card}`} aria-labelledby="budget-title">
        <h2 id="budget-title" className={`t-h3 ${styles.cardTitle}`}>The platform&apos;s share</h2>
        <p className={styles.note}>
          What the platform keeps after the Creators&apos; share is divided by one table, shown on the <Link href="/fees">Fees page</Link>. A new
          division is announced here at least a day ahead and applies only to what is collected from its date on.
        </p>
        {tables.length === 0 ? (
          <p className={styles.note}>The division has not changed since the start.</p>
        ) : (
          <ul className={styles.list}>
            {tables.map((v) => {
              const state = v.version === budgets.inForce ? "in force" : new Date(v.effectiveAt).getTime() > now ? "announced" : "replaced";
              return (
                <li key={v.version}>
                  <span>
                    {budgetLine(v.shares)} from {formatUtc(v.effectiveAt)} ({state})
                    {v.note && <> · {v.note}</>}
                  </span>
                  <span className={styles.when}>announced {formatUtc(v.announcedAt)}</span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
      <Link href="/revenue" className={`button button-ghost ${styles.back}`}>Platform revenue</Link>
    </div>
  );
}
