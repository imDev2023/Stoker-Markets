import Link from "next/link";
import { LAUNCH_LINK } from "@/lib/site";
import { Ring } from "./Mark";
import styles from "./Invite.module.css";

/** The ring at size here, as the research asks for the landing's own invitation (160 to 240px with its bloom). */
const RING = 200;

/**
 * The page ends with content (#133): the invitation, with the ring at size, so the footer follows a section and not a
 * gap. On a new platform it is the first launch's invitation and stands where the trending coins will; afterwards it
 * closes the page for anyone the sections above have persuaded.
 */
export function Invite({ empty }: { empty: boolean }) {
  return (
    <section className={`shell ${styles.invite}`} aria-labelledby="invite-title">
      <div className={styles.band}>
        <Ring size={RING} className={styles.ring} />
        <h2 id="invite-title" className={`t-h2 ${styles.title}`}>{empty ? "Be the first to stoke a coin" : "Your coin, your pair"}</h2>
        <p className={`t-body ${styles.text}`}>
          {empty
            ? "Nothing has launched here yet. Pick the asset your coin trades in and open the board."
            : "Pick the asset your coin trades in. Launching takes a minute, and you earn from the first trade."}
        </p>
        <Link href={LAUNCH_LINK.href} className="button button-primary button-lg">{LAUNCH_LINK.label}</Link>
      </div>
    </section>
  );
}
