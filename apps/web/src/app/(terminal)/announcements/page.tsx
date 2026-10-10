import type { Metadata } from "next";
import Link from "next/link";
import { getPlatform, listAnnouncements } from "@/lib/api";
import { explorerUrl, formatUtc } from "@/lib/format";
import styles from "../rewards/page.module.css";

export const metadata: Metadata = {
  title: "Fee changes",
  description: "Every announced change to the Platform Fee or Creator Fee, before it applies and after, with the transaction that applied it.",
};

/** Every fee change ever announced, public: a change to every live curve at once is announced ahead and recorded after. */
export default async function AnnouncementsPage() {
  const [list, platform] = await Promise.all([listAnnouncements(), getPlatform()]);
  const now = Date.now();
  return (
    <div className={`shell ${styles.page}`}>
      <h1 className={`t-h1 ${styles.title}`}>Fee changes</h1>
      <p className={styles.lead}>
        Every coin&apos;s curve pays the Platform Fee ({platform.platformFeeBps / 100}%) and the Creator Fee ({platform.creatorFeeBps / 100}%) as the
        chain has them right now. A change is announced here at least a day ahead, and shows its transaction once the platform&apos;s admin has
        applied it.
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
      <Link href="/revenue" className={`button button-ghost ${styles.back}`}>Platform revenue</Link>
    </div>
  );
}
