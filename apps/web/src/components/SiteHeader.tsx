import Link from "next/link";
import { WalletButton } from "./WalletButton";
import styles from "./SiteHeader.module.css";

export function SiteHeader({ cluster }: { cluster: string }) {
  return (
    <header className={styles.header}>
      <div className={`shell ${styles.bar}`}>
        <Link href="/" className={styles.wordmark}>
          Launchpad
          {cluster !== "mainnet" && <span className={styles.cluster}>{cluster}</span>}
        </Link>
        <nav className={styles.nav} aria-label="Main">
          <Link href="/" className={styles.link}>Coins</Link>
          <Link href="/launch" className={styles.link}>Launch a coin</Link>
        </nav>
        <WalletButton />
      </div>
    </header>
  );
}
