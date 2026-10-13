import Link from "next/link";
import type { HeaderKind } from "@/lib/header";
import { LAUNCH_LINK } from "@/lib/site";
import { CommandHeader } from "./header/CommandHeader";
import { PillHeader } from "./header/PillHeader";
import { RailHeader } from "./header/RailHeader";
import { TiersHeader } from "./header/TiersHeader";
import { Mark } from "./Mark";
import { NavLinks } from "./NavLinks";
import { SearchPalette } from "./SearchPalette";
import { SocialLinks } from "./SocialLinks";
import { WalletButton } from "./WalletButton";
import styles from "./SiteHeader.module.css";

/**
 * Every page's head. The built one is the bar: the mark, the sections, and on the right what a visitor does here:
 * search, follow, launch, connect. The others are the candidates of #37 (src/lib/header.ts), shown by `?header=`.
 */
export function SiteHeader({ cluster, kind }: { cluster: string; kind: HeaderKind }) {
  if (kind === "rail") return <RailHeader cluster={cluster} />;
  if (kind === "command") return <CommandHeader cluster={cluster} />;
  if (kind === "tiers") return <TiersHeader cluster={cluster} />;
  if (kind === "pill") return <PillHeader cluster={cluster} />;
  return (
    <header className={styles.header}>
      <div className={styles.bar}>
        <Link href="/" className={styles.wordmark}>
          {/* The same mark the PlatformConfig names on-chain, /icon.png (runbook, section 2), drawn inline. */}
          <Mark className={styles.mark} />
          Stoker
          {cluster !== "mainnet" && <span className={styles.cluster}>{cluster}</span>}
        </Link>
        <NavLinks />
        <div className={styles.actions}>
          <SearchPalette />
          <div className={styles.social}>
            <SocialLinks />
          </div>
          <Link href={LAUNCH_LINK.href} className={`button button-primary ${styles.launch}`}>
            <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
              <path d="M8 2.5v11M2.5 8h11" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
            <span className={styles.launchWord}>{LAUNCH_LINK.label}</span>
          </Link>
          <WalletButton />
        </div>
      </div>
    </header>
  );
}
