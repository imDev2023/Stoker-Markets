"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { API_LINK, LAUNCH_LINK, NAV_LINKS, type NavLink } from "@/lib/site";
import { isCurrent } from "./NavLinks";
import { SchemeToggle } from "./SchemeToggle";
import { SocialLinks } from "./SocialLinks";
import { WalletButton } from "./WalletButton";
import styles from "./PhoneMenu.module.css";

/** The six sections in the pill's order, the product's four set large and the platform's two a step smaller under them. */
const PRODUCT: readonly NavLink[] = [NAV_LINKS[0], NAV_LINKS[1], NAV_LINKS[2], NAV_LINKS[3]];
const PLATFORM: readonly NavLink[] = [NAV_LINKS[4], API_LINK];

/**
 * The narrow window's menu behind a button in the header: an overlay the window's height with a visible close, the
 * product's sections set large in the display face (each rising a beat after the one before), the platform's two a
 * step smaller, and at its foot the launch button (the one filled action), the wallet as a ghost, the socials and the
 * light-or-dark toggle. Escape, the close button, the backdrop and a chosen link close it; the page holds still.
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
  const link = (l: NavLink, i: number, cls: string | undefined) => (
    <Link key={l.href} href={l.href} className={cls} style={order(i)} aria-current={isCurrent(l, pathname) ? "page" : undefined} onClick={close}>
      {l.label}
    </Link>
  );

  return (
    <>
      <button type="button" className={`${styles.button} ${className}`} onClick={() => setOpen(true)} aria-expanded={open} aria-controls={id} aria-label="Menu">
        <svg viewBox="0 0 20 20" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
          <path d="M3.5 6h13M3.5 10h13M3.5 14h13" />
        </svg>
      </button>
      {/* Into the body, over the header, so the overlay owns the window. */}
      {open && createPortal(
        <div
          className={styles.backdrop}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) close();
          }}
        >
          <div id={id} className={styles.panel} role="dialog" aria-modal="true" aria-label="Menu">
            <div className={styles.top}>
              <button type="button" className={styles.close} onClick={close} aria-label="Close menu">
                <svg viewBox="0 0 20 20" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
                  <path d="m5 5 10 10M15 5 5 15" />
                </svg>
              </button>
            </div>
            <nav className={styles.nav} aria-label="Main">
              {PRODUCT.map((l, i) => link(l, i, styles.link))}
              <div className={styles.platform}>
                {PLATFORM.map((l, i) => link(l, PRODUCT.length + i, styles.small))}
              </div>
            </nav>
            <div className={styles.foot}>
              <Link href={LAUNCH_LINK.href} className="button button-primary" onClick={close}>
                {LAUNCH_LINK.label}
              </Link>
              <WalletButton variant="menu" />
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
