import type { Metadata } from "next";
import { SwapWidget } from "@/components/SwapWidget";
import base from "../rewards/page.module.css";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "Swap",
  description: "Any Solana token for any other, through Jupiter, on mainnet.",
};

/**
 * Swap (owner, 2026-10-30): Jupiter's swap as a section of its own rather than the landing's hero. The widget is
 * `SwapWidget` (Jupiter Plugin in integrated mode, the wallet passed through from the site's adapter, a referral fee
 * once the owner's referral account is set); the page says what it is and whose it is, nothing more.
 */
export default function SwapPage() {
  return (
    <div className={`shell ${base.page}`}>
      <h1 className={`t-h1 ${base.title}`}>Swap</h1>
      <p className={base.lead}>
        Any Solana token for any other, through Jupiter, on mainnet. Stoker coins trade on their own pages, in the asset each one is priced in.
      </p>
      <div className={styles.widget}>
        <SwapWidget />
      </div>
    </div>
  );
}
