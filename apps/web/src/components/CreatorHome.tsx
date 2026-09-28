"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useWallet } from "@solana/wallet-adapter-react";
import { useEffect } from "react";
import { WalletButton } from "./WalletButton";
import styles from "./CreatorHome.module.css";

/** Where "Creator Fee" in the header leads: the connected wallet's own page, or a prompt to connect one. */
export function CreatorHome({ creatorFeePct }: { creatorFeePct: number }) {
  const { publicKey } = useWallet();
  const router = useRouter();
  const address = publicKey?.toBase58();

  useEffect(() => {
    if (address) router.replace(`/creator/${address}`);
  }, [address, router]);

  return (
    <div className="shell">
      <div className={styles.page}>
        <h1 className={styles.title}>Your Creator Fee</h1>
        <p className={styles.lede}>
          Creators earn {creatorFeePct}% of every trade on their coins&apos; curves, paid by the chain into a vault only
          their wallet can claim from.
        </p>
        <div className={styles.connect} aria-busy={Boolean(address)}>
          <p>{address ? "Opening your Creator Fee…" : "Connect the wallet you launched with to see and claim your Creator Fee."}</p>
          {!address && <WalletButton variant="inline" />}
        </div>
        <p className={styles.more}>Every Creator&apos;s page is public: open any coin and follow its Creator.</p>
        <p className={styles.more}>
          <Link href="/docs/claim-creator-fee">How to claim without this website</Link>
        </p>
      </div>
    </div>
  );
}
