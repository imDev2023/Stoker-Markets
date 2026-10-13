import Link from "next/link";
import { Mark } from "../Mark";
import { SearchPalette } from "../SearchPalette";
import { SocialLinks } from "../SocialLinks";
import { WalletButton } from "../WalletButton";
import { Dock, RailNav } from "./RailNav";
import styles from "./RailHeader.module.css";

/**
 * The wordmark, once in the rail and once in the narrow window's top line. A component rather than one element rendered
 * twice: the two marks would share their gradient ids, and the rail's, hidden on a narrow window, paints nothing.
 */
function Brand({ cluster }: { cluster: string }) {
  return (
    <Link href="/" className={styles.wordmark}>
      <Mark className={styles.mark} />
      Stoker
      {cluster !== "mainnet" && <span className={styles.cluster}>{cluster}</span>}
    </Link>
  );
}

/**
 * H1, the side rail: no top bar on a wide window. A rail on the window's left edge with the mark on top, the launch
 * button, the sections as glyph-and-word items in two groups, and search, the socials and the account at its foot
 * (a terminal's shape, Bloomberg's and Hyperliquid's, not a launchpad's). Under 1100px the rail is gone: a thin top line
 * carries the mark, search and the account, and a dock on the window's foot the four sections with the launch button
 * raised in its middle (the phone pattern the layout brief names). globals.css gives the body the rail's width.
 */
export function RailHeader({ cluster }: { cluster: string }) {
  return (
    <header className={styles.header}>
      <div className={styles.rail}>
        <Brand cluster={cluster} />
        <RailNav />
        <div className={styles.foot}>
          <SearchPalette variant="wide" />
          <div className={styles.footRow}>
            <SocialLinks />
          </div>
          {/* The ghost, as in the bar: the launch button above is the rail's one filled action. */}
          <div className={styles.wallet}>
            <WalletButton />
          </div>
        </div>
      </div>
      <div className={styles.top}>
        <Brand cluster={cluster} />
        <div className={styles.topActions}>
          <SearchPalette variant="glyph" />
          <WalletButton />
        </div>
      </div>
      <Dock />
    </header>
  );
}
