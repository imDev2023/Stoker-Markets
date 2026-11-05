"use client";

import Link from "next/link";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import type { WalletName } from "@solana/wallet-adapter-base";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import { useCallback, useEffect, useRef, useState } from "react";
import { listLaunches } from "@/lib/api";
import { shortAddress } from "@/lib/format";
import { EMBEDDED_WALLET_NAME, SIGN_IN_PROVIDER, SOCIALS } from "@/lib/signIn";
import { CopyButton } from "./CopyButton";
import { ExportKey } from "./ExportKey";
import { ProviderIcon } from "./ProviderIcon";
import { SchemeToggle } from "./SchemeToggle";
import { useSignIn } from "./SignIn";
import { SignInSheet } from "./SignInSheet";
import styles from "./WalletButton.module.css";

/** The sign-in glyph: a person, as the tab bar's Account tab draws it. */
function Glyph() {
  return (
    <svg className={styles.glyph} viewBox="0 0 20 20" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
      <circle cx="10" cy="7" r="3.5" />
      <path d="M3.5 17a6.5 6.5 0 0 1 13 0" />
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
 * The account control. In the header it is the ghost beside the one filled action (`header`): "Sign in", which opens
 * the one sheet (`SignInSheet`: the social sign-ins, email and the Solana wallets; owner, 2026-11-02, ADR 0016), or
 * the wallet's avatar and short address once connected, opening a menu that names the sign-in, shows the Stoker
 * wallet's address and balance when that is the wallet (so it can be funded from an exchange or another wallet), and
 * holds the light-or-dark toggle (the toggle left the bar in #131; a preference used once lives in the account menu).
 * `inline` sits inside page content as the action itself; `menu` fills the phone menu's foot as a ghost under the
 * launch button.
 */
export function WalletButton({ variant = "header" }: { variant?: "header" | "inline" | "menu" }) {
  const { wallet, publicKey, connecting, select, connect, disconnect } = useWallet();
  const { connection } = useConnection();
  const signIn = useSignIn();
  const [open, setOpen] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [pending, setPending] = useState<WalletName | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const menu = useRef<HTMLDivElement>(null);
  const embedded = wallet?.adapter.name === EMBEDDED_WALLET_NAME;
  const closeSheet = useCallback(() => setSheet(false), []);

  // The Stoker wallet's SOL, read when its menu opens: what it can launch and trade with, next to where to send more.
  const [lamports, setLamports] = useState<number | null>(null);
  useEffect(() => {
    if (!open || !embedded || !publicKey) return;
    let gone = false;
    setLamports(null);
    connection
      .getBalance(publicKey, "confirmed")
      .then((l) => {
        if (!gone) setLamports(l);
      })
      .catch(() => undefined);
    return () => {
      gone = true;
    };
  }, [open, embedded, publicKey, connection]);

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

  // Signing out ends the provider's session first (while it holds, the connector would connect the Stoker wallet
  // again the moment it is disconnected), then disconnects and deselects the wallet, so nothing reconnects it on the
  // next page either.
  const signOut = async () => {
    setOpen(false);
    if (embedded || signIn.authenticated) await signIn.logout().catch(() => undefined);
    await disconnect().catch(() => undefined);
    select(null);
  };

  const wrap = `${styles.wrap} ${variant === "header" ? styles.header : variant === "inline" ? styles.inline : styles.inMenu}`;
  // Inline the sign-in is the page's action; in the header and the phone menu it is a ghost beside the filled one.
  const connectKind = variant === "inline" ? "button-primary" : "button-ghost";
  // The toggle rides in the header's menu and its sheet only: the phone menu shows it in its own foot.
  const toggle = variant === "header" && (
    <div className={styles.foot}>
      <SchemeToggle variant="menu" />
    </div>
  );

  if (publicKey) {
    const address = publicKey.toBase58();
    const account = signIn.account;
    const provider = account ? SOCIALS.find((s) => s.id === account.provider)?.label ?? "email" : null;
    return (
      <div className={wrap} ref={menu}>
        <button
          type="button"
          className={`button button-ghost ${styles.connected}`}
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          title={wallet ? `Connected with ${wallet.adapter.name}` : undefined}
        >
          <Avatar address={address} />
          <span className={`mono ${styles.address}`}>{shortAddress(address)}</span>
        </button>
        {open && (
          <div className={`${styles.menu} ${embedded ? styles.menuWide : ""}`} role="menu" aria-label={wallet ? `Connected with ${wallet.adapter.name}` : "Wallet"}>
            {account && (
              <div className={styles.identity} title={`Signed in with ${provider}`}>
                {account.picture ? (
                  <img src={account.picture} alt="" width={20} height={20} className={styles.picture} />
                ) : (
                  <ProviderIcon provider={account.provider} size={16} className={styles.identityMark} />
                )}
                <span className={styles.identityLabel}>{account.label}</span>
              </div>
            )}
            {embedded && (
              <div className={styles.embedded}>
                <p className={styles.embeddedTitle}>Your Stoker wallet</p>
                <p className={`mono ${styles.fullAddress}`}>{address}</p>
                <div className={styles.embeddedRow}>
                  <span className={`mono ${styles.balance}`} aria-live="polite">
                    {lamports === null ? "…" : `${(lamports / LAMPORTS_PER_SOL).toFixed(4)} SOL`}
                  </span>
                  <CopyButton value={address} label="Copy address" />
                </div>
                <p className={styles.embeddedNote}>Send SOL to this address from an exchange or another wallet to launch and trade. Made and held with {SIGN_IN_PROVIDER}; Export key gives you the key itself.</p>
              </div>
            )}
            {hasLaunched && (
              <Link href="/creator" role="menuitem" className={styles.menuLink} onClick={() => setOpen(false)}>
                Your earnings
              </Link>
            )}
            {embedded && signIn.exportWallet && (
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  setExportError(null);
                  signIn.exportWallet?.().then(setSecret, (e: unknown) => setExportError(e instanceof Error ? e.message : String(e)));
                }}
              >
                Export key
              </button>
            )}
            {exportError && (
              <p className={styles.empty} role="alert">
                {exportError}
              </p>
            )}
            <button type="button" role="menuitem" onClick={() => void signOut()}>
              Sign out
            </button>
            {toggle}
          </div>
        )}
        <ExportKey secret={secret} onClose={() => setSecret(null)} />
      </div>
    );
  }

  return (
    <div className={wrap} ref={menu}>
      <button type="button" className={`button ${connectKind} ${styles.connect}`} onClick={() => setSheet(true)} aria-haspopup="dialog" disabled={connecting} data-wallet-connect={variant === "header" || undefined}>
        {/* On a phone the header's button is the glyph alone; the words stay as its name. */}
        {variant === "header" && <span className={styles.connectGlyph}><Glyph /></span>}
        <span className={styles.connectWord}>{connecting ? "Connecting…" : "Sign in"}</span>
      </button>
      <SignInSheet
        open={sheet}
        onClose={closeSheet}
        onWallet={(w) => {
          setSheet(false);
          setPending(w.adapter.name);
          select(w.adapter.name);
        }}
        foot={toggle || undefined}
      />
    </div>
  );
}
