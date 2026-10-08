"use client";

import { useRouter } from "next/navigation";
import { useWallet } from "@solana/wallet-adapter-react";
import { useEffect } from "react";
import type { PlatformInfo } from "@launchpad/contract";
import { creatorEarnings } from "@/lib/fees";
import { WalletButton } from "./WalletButton";
import styles from "./CreatorHome.module.css";

/** Where "Creator earnings" in the header leads: the connected wallet's own page, or a prompt to connect one. */
export function CreatorHome({ platform }: { platform: PlatformInfo }) {
  const earns = creatorEarnings(platform);
  const { publicKey } = useWallet();
  const router = useRouter();
  const address = publicKey?.toBase58();

  useEffect(() => {
    if (address) router.replace(`/creator/${address}`);
  }, [address, router]);

  return (
    <div className="shell">
      <div className={styles.page}>
        <h1 className={styles.title}>Your creator earnings</h1>
        <p className={styles.lede}>
          Creators earn {earns.summary}: half of what the platform collects on their coins, sent straight to their
          wallet with nothing to claim.
        </p>
        <div className={styles.connect} aria-busy={Boolean(address)}>
          <p>{address ? "Opening your earnings…" : "Connect the wallet you launched with to see what your coins have earned you."}</p>
          {!address && <WalletButton variant="inline" />}
        </div>
        <p className={styles.more}>Every Creator&apos;s page is public: open any coin and follow its Creator.</p>
      </div>
    </div>
  );
}
