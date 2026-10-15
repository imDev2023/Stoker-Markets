import styles from "./ClusterNotice.module.css";

/**
 * The devnet rehearsal's notice, on every page while the site runs on devnet (owner, 2026-10-15): Raydium's LaunchLab
 * quotes only two priced assets there, so the pages say "any of the 2 assets" where the mainnet site says 614, and a
 * visitor sent here before go-live should know the two pairs are devnet's, not the product. The mainnet count is the
 * Quote Registry's on 2026-10-15; it is marketing copy here, not a live figure, since this site cannot read mainnet.
 */
export const MAINNET_QUOTE_ASSETS = 614;

export function ClusterNotice() {
  return (
    <aside className={styles.banner} role="status">
      <div className={`shell ${styles.inner}`}>
        <strong>Not live yet.</strong> This is Stoker&apos;s devnet rehearsal: Raydium quotes only 2 assets on devnet, so the site
        offers two pairs. At launch on mainnet you pair your coin with any of the {MAINNET_QUOTE_ASSETS} assets Raydium quotes there, SOL,
        stablecoins and tokenized stocks among them.
      </div>
    </aside>
  );
}
