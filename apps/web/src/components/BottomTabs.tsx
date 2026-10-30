"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";
import { useWallet } from "@solana/wallet-adapter-react";
import { ASSETS_LINK, CURATED_LINK, EXPLORE_LINK, LAUNCH_LINK, REWARDS_LINK, STATS_LINK, SWAP_LINK, type NavLink } from "@/lib/site";
import { isCurrent } from "./NavLinks";
import { SchemeToggle } from "./SchemeToggle";
import { SocialLinks } from "./SocialLinks";
import { Avatar, WalletButton } from "./WalletButton";
import styles from "./BottomTabs.module.css";

/** The tabs: what a trader opens most, with the launch in the middle as the one filled target, and the account last. */
const LEFT: readonly NavLink[] = [EXPLORE_LINK, ASSETS_LINK];
const RIGHT: readonly NavLink[] = [REWARDS_LINK];
/** What the five tabs leave out, offered in the account sheet with the wallet and the toggle. */
const MORE: readonly NavLink[] = [SWAP_LINK, STATS_LINK, CURATED_LINK];

function Glyph({ name }: { name: string }) {
  const d: Record<string, string> = {
    Explore: "M3 4.5h14M3 10h14M3 15.5h9",
    Assets: "M10 3.5 16 7v6l-6 3.5L4 13V7l6-3.5ZM10 10l6-3M10 10 4 7M10 10v6.5",
    Rewards: "M4 6.5h12v3a6 6 0 0 1-12 0v-3ZM7.5 16.5h5M10 12.5v4M4 6.5a2 2 0 1 1 0-2M16 6.5a2 2 0 1 0 0-2",
    Stats: "M3 16h14M5 13V8M9 13V5M13 13v-3M17 13V7",
  };
  return (
    <svg viewBox="0 0 20 20" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d[name] ?? ""} />
    </svg>
  );
}

/**
 * The phone's navigation (H9, #133, owner 2026-10-30; the header's own under 768px): a bar fixed to the window's foot with the five targets a
 * trader reaches for (Explore, Assets, Stoke, Rewards, Account), each a glyph with its word and the current one marked
 * in more than colour, in place of the full-height overlay (pump.fun and Torch do the same). The account tab opens a
 * sheet with the wallet, the two sections the tabs leave out, the socials and the light-or-dark toggle.
 */
export function BottomTabs() {
  const id = useId();
  const pathname = usePathname();
  const { publicKey } = useWallet();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const tab = (l: NavLink) => (
    <Link key={l.href} href={l.href} className={styles.tab} aria-current={isCurrent(l, pathname) ? "page" : undefined}>
      <Glyph name={l.label} />
      <span>{l.label}</span>
    </Link>
  );

  return (
    <>
      <nav className={styles.bar} aria-label="Sections">
        {LEFT.map(tab)}
        <Link href={LAUNCH_LINK.href} className={`${styles.tab} ${styles.stoke}`} aria-current={pathname === LAUNCH_LINK.href ? "page" : undefined} aria-label={LAUNCH_LINK.label}>
          <span className={styles.plus}>
            <svg viewBox="0 0 16 16" width="18" height="18" aria-hidden="true">
              <path d="M8 2.5v11M2.5 8h11" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </span>
          <span>Stoke</span>
        </Link>
        {RIGHT.map(tab)}
        <button type="button" className={styles.tab} onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-controls={id} data-wallet-connect>
          {publicKey ? (
            <Avatar address={publicKey.toBase58()} size={22} />
          ) : (
            <svg viewBox="0 0 20 20" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
              <circle cx="10" cy="7" r="3.5" />
              <path d="M3.5 17a6.5 6.5 0 0 1 13 0" />
            </svg>
          )}
          <span>Account</span>
        </button>
      </nav>
      {open && createPortal(
        <div
          className={styles.backdrop}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div id={id} className={styles.sheet} role="dialog" aria-modal="true" aria-label="Account">
            <WalletButton variant="menu" />
            <nav className={styles.more} aria-label="More">
              {MORE.map((l) => (
                <Link key={l.href} href={l.href} aria-current={isCurrent(l, pathname) ? "page" : undefined} onClick={() => setOpen(false)}>
                  {l.label}
                  {l.href === "/curated" && <span className="tag">soon</span>}
                </Link>
              ))}
            </nav>
            <div className={styles.row}>
              <SocialLinks />
              <SchemeToggle />
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
