import Link from "next/link";
import { EmptyState } from "@/components/EmptyState";
import styles from "./not-found.module.css";

/** Nothing at this address: the one EmptyState, one line and the way back (principles, section 7). */
export default function NotFound() {
  return (
    <div className={`shell ${styles.page}`}>
      <h1 className="visually-hidden">Not found</h1>
      <EmptyState title="No coin at this address" className={styles.card} action={<Link href="/coins" className="button button-primary">All coins</Link>}>
        It may still be confirming. Check the address, or wait a few seconds and reload.
      </EmptyState>
    </div>
  );
}
