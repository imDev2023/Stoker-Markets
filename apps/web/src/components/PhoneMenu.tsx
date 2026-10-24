"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { LAUNCH_LINK, NAV_LINKS, SITE_LINKS } from "@/lib/site";
import { isCurrent } from "./NavLinks";
import { SchemeToggle } from "./SchemeToggle";
import { SocialLinks } from "./SocialLinks";
import { WalletButton } from "./WalletButton";
import styles from "./PhoneMenu.module.css";

/**
 * The narrow window's menu behind a button in the header: an overlay the window's height with the links set large in
 * the display face, each rising a beat after the one before (the Codrops treatment in CSS transforms), and the launch
 * button, the wallet and the socials at its foot. Escape, the backdrop and a chosen link close it; the page holds still.
 */
export function PhoneMenu({ className = "" }: { className?: string }) {
  const id = useId();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [open]);

  const close = () => setOpen(false);
  const order = (i: number) => ({ "--i": i }) as CSSProperties;

  return (
    <>
      <button type="button" className={`${styles.button} ${className}`} onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-controls={id} aria-label={open ? "Close menu" : "Menu"}>
        <svg viewBox="0 0 20 20" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
          {open ? <path d="m5 5 10 10M15 5 5 15" /> : <path d="M3.5 6h13M3.5 10h13M3.5 14h13" />}
        </svg>
      </button>
      {/* Into the body, clear of the header's backdrop filter, which would contain a fixed box within the header's band. */}
      {open && createPortal(
        <div
          className={styles.backdrop}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) close();
          }}
        >
          <div id={id} className={styles.panel} role="dialog" aria-modal="true" aria-label="Menu">
            <nav className={styles.nav} aria-label="Main">
              {NAV_LINKS.map((l, i) => (
                <Link key={l.href} href={l.href} className={styles.link} style={order(i)} aria-current={isCurrent(l.href, pathname) ? "page" : undefined} onClick={close}>
                  {l.label}
                </Link>
              ))}
              <a href={SITE_LINKS.apiDocs.href} className={styles.link} style={order(NAV_LINKS.length)} target="_blank" rel="noreferrer">
                API
              </a>
            </nav>
            <div className={styles.foot}>
              <Link href={LAUNCH_LINK.href} className="button button-primary" onClick={close}>
                {LAUNCH_LINK.label}
              </Link>
              <div className={styles.wallet}>
                <WalletButton variant="inline" />
              </div>
              <div className={styles.row}>
                <SocialLinks />
                <SchemeToggle />
              </div>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
