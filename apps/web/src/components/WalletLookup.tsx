"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import styles from "@/app/(terminal)/rewards/page.module.css";

const ADDRESS = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

/** Takes a wallet address to its rewards page. */
export function WalletLookup() {
  const router = useRouter();
  const [address, setAddress] = useState("");
  const [error, setError] = useState<string | null>(null);
  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const value = address.trim();
    if (!ADDRESS.test(value)) return setError("Enter a Solana wallet address.");
    setError(null);
    router.push(`/rewards/${value}`);
  }
  return (
    <form className={styles.lookup} onSubmit={onSubmit} aria-label="Look up a wallet's rewards">
      <input
        className="mono"
        value={address}
        onChange={(e) => setAddress(e.target.value)}
        placeholder="Wallet address"
        aria-label="Wallet address"
        aria-invalid={error !== null}
        autoComplete="off"
        spellCheck={false}
      />
      <button type="submit">Show rewards</button>
      {error && <p role="alert" className={styles.note} style={{ flexBasis: "100%" }}>{error}</p>}
    </form>
  );
}
