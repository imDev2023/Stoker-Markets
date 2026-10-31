"use client";

import { useEffect, useRef, useState } from "react";
import { acceptDisclaimer, hasAcceptedDisclaimer } from "./Disclaimer";
import { Ring } from "./Mark";
import { WELCOME } from "@/lib/legal";
import { LEGAL_LINKS } from "@/lib/site";
import styles from "./Welcome.module.css";

/** The ring's one size here, above the title, until the character's still replaces it (the marketing folder's job). */
const RING = 120;

const [TERMS, PRIVACY, RISK] = LEGAL_LINKS;

/**
 * The welcome on a visitor's first visit (owner, 2026-10-30, #156): the open half of the pitch, one risk sentence, the
 * excluded regions and one button, over the page as a modal dialog, a full-width sheet on a phone. It mounts closed
 * and opens after hydration, so the server render and the first paint are the same with or without it. Accepted once
 * per browser on the disclaimer's own key, so a visitor who continued here is not asked again before their first
 * launch or trade; the gate blocks nothing (owner's rule: everything shows, the disclaimer is the notice), so Escape
 * and a press outside the dialog accept it like Continue. The legal pages open in a new tab, so the welcome stays put.
 */
export function Welcome() {
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!hasAcceptedDisclaimer()) setOpen(true);
  }, []);

  useEffect(() => {
    const d = dialog.current;
    if (open && d && !d.open) d.showModal();
  }, [open]);

  if (!open) return null;

  const accept = () => {
    acceptDisclaimer();
    setOpen(false);
  };

  return (
    <dialog
      ref={dialog}
      className={`dialog ${styles.dialog}`}
      aria-labelledby="welcome-title"
      // Escape closes a modal dialog by itself (and a browser may not let that be prevented): the close is the acceptance.
      onClose={accept}
      onClick={(e) => {
        // A press on the backdrop reaches the dialog itself, outside its own box.
        const r = e.currentTarget.getBoundingClientRect();
        if (e.target === e.currentTarget && (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom)) accept();
      }}
    >
      <Ring size={RING} className={styles.ring} />
      <h2 id="welcome-title" className={`t-h2 ${styles.title}`}>{WELCOME.title}</h2>
      {WELCOME.lines.map((line) => (
        <p key={line} className={`t-body ${styles.line}`}>{line}</p>
      ))}
      <button type="button" className={`button button-primary button-lg ${styles.continue}`} onClick={accept}>
        {WELCOME.button}
      </button>
      <p className={`t-caption ${styles.terms}`}>
        By continuing you accept the <a href={TERMS.href} target="_blank" rel="noopener">{TERMS.label}</a>, the{" "}
        <a href={PRIVACY.href} target="_blank" rel="noopener">{PRIVACY.label} notice</a> and the{" "}
        <a href={RISK.href} target="_blank" rel="noopener">{RISK.label}</a>, and confirm you are over 18.
      </p>
    </dialog>
  );
}
