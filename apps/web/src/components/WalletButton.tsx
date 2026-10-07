"use client";

import Link from "next/link";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletReadyState } from "@solana/wallet-adapter-base";
import { useEffect, useRef, useState } from "react";
import { shortAddress } from "@/lib/format";
import styles from "./WalletButton.module.css";

/** `inline` sits inside page content: it fills the width on phones, like the page's other main actions. */
export function WalletButton({ variant = "header" }: { variant?: "header" | "inline" }) {
  const { wallets, wallet, publicKey, connecting, select, connect, disconnect } = useWallet();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const menu = useRef<HTMLDivElement>(null);
  const installed = wallets.filter((w) => w.readyState === WalletReadyState.Installed || w.readyState === WalletReadyState.Loadable);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !menu.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  // Selecting a wallet only stages it; connect once the adapter has switched.
  useEffect(() => {
    if (pending && wallet?.adapter.name === pending && !publicKey) {
      setPending(null);
      connect().catch(() => undefined);
    }
  }, [pending, wallet, publicKey, connect]);

  const wrap = `${styles.wrap} ${styles[variant]}`;

  if (publicKey) {
    return (
      <div className={wrap} ref={menu}>
        <button
          type="button"
          className={styles.connected}
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          title={wallet ? `Connected with ${wallet.adapter.name}` : undefined}
        >
          <svg className={styles.glyph} viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">
            <path
              d="M3 6.5A2.5 2.5 0 0 1 5.5 4h9A1.5 1.5 0 0 1 16 5.5V6h-1V5.5a.5.5 0 0 0-.5-.5h-9A1.5 1.5 0 0 0 4 6.5v7A1.5 1.5 0 0 0 5.5 15h9a.5.5 0 0 0 .5-.5V13h1v1.5a1.5 1.5 0 0 1-1.5 1.5h-9A2.5 2.5 0 0 1 3 13.5v-7Z"
              fill="currentColor"
            />
            <path d="M11 8h5.5a.5.5 0 0 1 .5.5v3a.5.5 0 0 1-.5.5H11a2 2 0 1 1 0-4Zm0 1.25a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Z" fill="currentColor" />
          </svg>
          <span className="mono">{shortAddress(publicKey.toBase58())}</span>
        </button>
        {open && (
          <div className={styles.menu} role="menu" aria-label={wallet ? `Connected with ${wallet.adapter.name}` : "Wallet"}>
            <Link href={`/creator/${publicKey.toBase58()}`} role="menuitem" className={styles.menuLink} onClick={() => setOpen(false)}>
              Your Creator Fee
            </Link>
            <button type="button" role="menuitem" onClick={() => { setOpen(false); void disconnect(); }}>
              Disconnect
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={wrap} ref={menu}>
      <button type="button" className={styles.connect} onClick={() => setOpen((o) => !o)} aria-expanded={open} disabled={connecting}>
        {connecting ? "Connecting…" : "Connect wallet"}
      </button>
      {open && (
        <div className={styles.menu} role="menu" aria-label="Choose a wallet">
          {installed.length === 0 ? (
            <p className={styles.empty}>
              No Solana wallet found in this browser. Install{" "}
              <a href="https://phantom.com" target="_blank" rel="noreferrer">Phantom</a> or{" "}
              <a href="https://solflare.com" target="_blank" rel="noreferrer">Solflare</a>, then reload.
            </p>
          ) : (
            installed.map((w) => (
              <button
                key={w.adapter.name}
                type="button"
                role="menuitem"
                onClick={() => { setOpen(false); setPending(w.adapter.name); select(w.adapter.name); }}
              >
                <img src={w.adapter.icon} alt="" width={20} height={20} />
                {w.adapter.name}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
