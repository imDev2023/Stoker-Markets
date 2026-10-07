import Link from "next/link";
import { NAV_LINKS } from "@/lib/site";
import { SocialLinks } from "./SocialLinks";
import { WalletButton } from "./WalletButton";
import styles from "./SiteHeader.module.css";

export function SiteHeader({ cluster }: { cluster: string }) {
  return (
    <header className={styles.header}>
      <div className={`shell ${styles.bar}`}>
        <Link href="/" className={styles.wordmark}>
          {/* The same mark the PlatformConfig names on-chain; served from /icon.png (runbook, section 2). */}
          <img className={styles.mark} src="/icon.png" alt="" width="28" height="28" />
          Stoker
          {cluster !== "mainnet" && <span className={styles.cluster}>{cluster}</span>}
        </Link>
        <nav className={styles.nav} aria-label="Main">
          {NAV_LINKS.map((l) => (
            <Link key={l.href} href={l.href} className={styles.link}>{l.label}</Link>
          ))}
        </nav>
        <div className={styles.social}>
          <SocialLinks />
        </div>
        <WalletButton />
      </div>
    </header>
  );
}
