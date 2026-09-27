"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { WalletReadyState } from "@solana/wallet-adapter-base";
import { useEffect, useRef, useState } from "react";
import { shortAddress } from "@/lib/format";
import styles from "./WalletButton.module.css";

export function WalletButton() {
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

  if (publicKey) {
    return (
      <div className={styles.wrap} ref={menu}>
        <button type="button" className={styles.connected} onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          {wallet?.adapter.icon && <img src={wallet.adapter.icon} alt="" width={18} height={18} />}
          <span className="mono">{shortAddress(publicKey.toBase58())}</span>
        </button>
        {open && (
          <div className={styles.menu} role="menu">
            <button type="button" role="menuitem" onClick={() => { setOpen(false); void disconnect(); }}>
              Disconnect
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={styles.wrap} ref={menu}>
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
