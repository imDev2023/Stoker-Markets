"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { LAUNCH_LINK, NAV_LINKS, SITE_LINKS } from "@/lib/site";
import { isCurrent } from "../NavLinks";
import { SocialLinks } from "../SocialLinks";
import { WalletButton } from "../WalletButton";
import { MenuGlyph } from "./NavIcons";
import styles from "./PhoneMenu.module.css";

/**
 * The narrow window's menu behind a button in the header: a `sheet` slides in from the right with the links, the launch
 * button, the wallet and the socials (the command bar's phone), an `overlay` fills the window with the links set large and
 * rising in turn (the floating pill's phone, the Codrops treatment in CSS transforms). Escape, the backdrop and a chosen
 * link close it; the page behind holds still.
 */
export function PhoneMenu({ kind, className = "" }: { kind: "sheet" | "overlay"; className?: string }) {
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
        <MenuGlyph open={open} />
      </button>
      {/* Into the body, clear of the header's backdrop filter, which would contain a fixed box within the header's band. */}
      {open && createPortal(
        <div
          className={`${styles.backdrop} ${styles[kind]}`}
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
              <WalletButton variant="inline" />
              <SocialLinks />
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
