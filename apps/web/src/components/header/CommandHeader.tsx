import Link from "next/link";
import { LAUNCH_LINK } from "@/lib/site";
import { Mark } from "../Mark";
import { SearchPalette } from "../SearchPalette";
import { WalletButton } from "../WalletButton";
import { CommandChips } from "./CommandChips";
import { PhoneMenu } from "./PhoneMenu";
import styles from "./CommandHeader.module.css";

/**
 * H2, the command bar: search is the header. One wide field in the middle ("Search coins, assets, pairs", ⌘K) with the
 * mark on its left and the launch button and the account on its right; the sections are the field's chips and the
 * palette's first entries. On a narrow window the field stays and the chips move to a sheet behind the menu button.
 */
export function CommandHeader({ cluster }: { cluster: string }) {
  return (
    <header className={styles.header}>
      <div className={styles.bar}>
        <Link href="/" className={styles.wordmark}>
          <Mark className={styles.mark} />
          <span className={styles.word}>Stoker</span>
          {cluster !== "mainnet" && <span className={styles.cluster}>{cluster}</span>}
        </Link>
        <div className={styles.field}>
          <SearchPalette variant="bare" word="Search coins, assets, pairs" pages />
          <CommandChips />
        </div>
        <div className={styles.actions}>
          <Link href={LAUNCH_LINK.href} className={`button button-primary ${styles.launch}`}>
            {LAUNCH_LINK.label}
          </Link>
          <div className={styles.wallet}>
            <WalletButton />
          </div>
          <PhoneMenu kind="sheet" className={styles.menu} />
        </div>
      </div>
    </header>
  );
}
