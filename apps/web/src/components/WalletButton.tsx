"use client";

import Link from "next/link";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletReadyState } from "@solana/wallet-adapter-base";
import { useEffect, useRef, useState } from "react";
import { listLaunches } from "@/lib/api";
import { shortAddress } from "@/lib/format";
import { SchemeToggle } from "./SchemeToggle";
import styles from "./WalletButton.module.css";

/** The wallet's glyph: a card with its clasp. */
function Glyph() {
  return (
    <svg className={styles.glyph} viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">
      <path
        d="M3 6.5A2.5 2.5 0 0 1 5.5 4h9A1.5 1.5 0 0 1 16 5.5V6h-1V5.5a.5.5 0 0 0-.5-.5h-9A1.5 1.5 0 0 0 4 6.5v7A1.5 1.5 0 0 0 5.5 15h9a.5.5 0 0 0 .5-.5V13h1v1.5a1.5 1.5 0 0 1-1.5 1.5h-9A2.5 2.5 0 0 1 3 13.5v-7Z"
        fill="currentColor"
      />
      <path d="M11 8h5.5a.5.5 0 0 1 .5.5v3a.5.5 0 0 1-.5.5H11a2 2 0 1 1 0-4Zm0 1.25a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Z" fill="currentColor" />
    </svg>
  );
}

/**
 * A connected wallet's avatar: a disc whose two hues come from the address, so the same wallet looks the same on every
 * visit and two wallets look different, with nothing fetched and nothing stored.
 */
export function Avatar({ address, size = 24 }: { address: string; size?: number }) {
  let a = 0;
  let b = 0;
  for (let i = 0; i < address.length; i++) {
    const c = address.charCodeAt(i);
    if (i % 2 === 0) a = (a * 31 + c) % 360;
    else b = (b * 37 + c) % 360;
  }
  const style = { width: size, height: size, background: `linear-gradient(135deg, hsl(${a} 70% 56%), hsl(${(a + 40 + (b % 80)) % 360} 72% 38%))` };
  return <span className={styles.avatar} style={style} data-avatar aria-hidden="true" />;
}

/**
 * The account control. In the header it is the ghost beside the one filled action (`header`): "Connect wallet", or
 * the wallet's avatar and short address once connected, each opening a menu that also holds the light-or-dark toggle
 * (the toggle left the bar in #131; a preference used once lives in the account menu). `inline` sits inside page
 * content as the action itself; `menu` fills the phone menu's foot as a ghost under the launch button.
 */
export function WalletButton({ variant = "header" }: { variant?: "header" | "inline" | "menu" }) {
  const { wallets, wallet, publicKey, connecting, select, connect, disconnect } = useWallet();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const menu = useRef<HTMLDivElement>(null);
  const installed = wallets.filter((w) => w.readyState === WalletReadyState.Installed || w.readyState === WalletReadyState.Loadable);

  // The earnings page is a Creator's own (owner, 2026-10-08): the menu offers it only to a wallet that has launched a
  // coin here, which is asked once per connected wallet.
  const address = publicKey?.toBase58() ?? null;
  const [launched, setLaunched] = useState<{ address: string; yes: boolean } | null>(null);
  useEffect(() => {
    if (!address) return;
    let gone = false;
    listLaunches({ creator: address, limit: 1 })
      .then((list) => {
        if (!gone) setLaunched({ address, yes: list.launches.length > 0 });
      })
      .catch(() => undefined);
    return () => {
      gone = true;
    };
  }, [address]);
  const hasLaunched = launched?.address === address && launched.yes;

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

  const wrap = `${styles.wrap} ${variant === "header" ? styles.header : variant === "inline" ? styles.inline : styles.inMenu}`;
  // Inline the connection is the page's action; in the header and the phone menu it is a ghost beside the filled one.
  const connectKind = variant === "inline" ? "button-primary" : "button-ghost";
  // The toggle rides in the header's menus only: the phone menu shows it in its own foot.
  const toggle = variant === "header" && (
    <div className={styles.foot}>
      <SchemeToggle variant="menu" />
    </div>
  );

  if (publicKey) {
    return (
      <div className={wrap} ref={menu}>
        <button
          type="button"
          className={`button button-ghost ${styles.connected}`}
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          title={wallet ? `Connected with ${wallet.adapter.name}` : undefined}
        >
          <Avatar address={publicKey.toBase58()} />
          <span className={`mono ${styles.address}`}>{shortAddress(publicKey.toBase58())}</span>
        </button>
        {open && (
          <div className={styles.menu} role="menu" aria-label={wallet ? `Connected with ${wallet.adapter.name}` : "Wallet"}>
            {hasLaunched && (
              <Link href="/creator" role="menuitem" className={styles.menuLink} onClick={() => setOpen(false)}>
                Your earnings
              </Link>
            )}
            <button type="button" role="menuitem" onClick={() => { setOpen(false); void disconnect(); }}>
              Disconnect
            </button>
            {toggle}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={wrap} ref={menu}>
      <button type="button" className={`button ${connectKind} ${styles.connect}`} onClick={() => setOpen((o) => !o)} aria-expanded={open} disabled={connecting} data-wallet-connect={variant === "header" || undefined}>
        {/* On a phone the header's button is the glyph alone; the words stay as its name. */}
        {variant === "header" && <span className={styles.connectGlyph}><Glyph /></span>}
        <span className={styles.connectWord}>{connecting ? "Connecting…" : "Connect wallet"}</span>
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
          {toggle}
        </div>
      )}
    </div>
  );
}
