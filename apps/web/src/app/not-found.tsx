import Link from "next/link";
import { Ring } from "@/components/Mark";
import styles from "./not-found.module.css";

/** Nothing at this address: the ring at size on a raised card, one line and the way back (principles, section 7). */
export default function NotFound() {
  return (
    <div className={`shell ${styles.page}`}>
      <div className={`card card-raised ${styles.card}`}>
        <Ring size={96} className={styles.ring} />
        <h1 className={`t-h2 ${styles.title}`}>No coin at this address</h1>
        <p className={styles.note}>It may still be confirming. Check the address, or wait a few seconds and reload.</p>
        <Link href="/" className="button button-primary">All coins</Link>
      </div>
    </div>
  );
}
