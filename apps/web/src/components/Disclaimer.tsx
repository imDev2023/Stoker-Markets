"use client";

import { useEffect, useRef, useState } from "react";
import { DISCLAIMER_KEY, EXCLUDED_REGIONS } from "@/lib/legal";
import styles from "./Disclaimer.module.css";

export function hasAcceptedDisclaimer() {
  try {
    return window.localStorage.getItem(DISCLAIMER_KEY) === "accepted";
  } catch {
    return false;
  }
}

/** Records the acceptance for this browser; without storage it holds for this page view alone. */
export function acceptDisclaimer() {
  try {
    window.localStorage.setItem(DISCLAIMER_KEY, "accepted");
  } catch {
    // storage unavailable: accepted for this session only
  }
}

/**
 * Shown before a first launch or trade when the browser holds no acceptance (the welcome on the first visit records
 * one, so this stands in when storage was cleared or refused): the owner's decision is a disclaimer, not a technical
 * block.
 */
export function Disclaimer({
  open, onAccept, onCancel, action = "launch",
}: { open: boolean; onAccept: () => void; onCancel: () => void; action?: "launch" | "trade" }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [agreed, setAgreed] = useState(false);

  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog ref={dialog} className={`dialog ${styles.dialog}`} onCancel={(e) => { e.preventDefault(); onCancel(); }} aria-labelledby="disclaimer-title">
      <h2 id="disclaimer-title" className={`t-h3 ${styles.title}`}>Before you {action}</h2>
      <p>
        This launchpad is not for people in {EXCLUDED_REGIONS}, and it is not offered to anyone where launching or
        trading these coins is not allowed.
      </p>
      <p>
        Coins launched here are created by their creators, not by us. Their prices can fall to zero. Nothing on this
        site is investment advice.
      </p>
      <p>
        Each coin is priced in an asset its creator chose. Some of those assets are issued by companies that can freeze
        or move them, and some trade thinly; what is known about each one is on its page under Assets.
      </p>
      <label className={styles.check}>
        <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
        <span>I&apos;m not in an excluded country, and I understand the risks.</span>
      </label>
      <div className={styles.actions}>
        <button type="button" className="button button-ghost" onClick={onCancel}>Cancel</button>
        <button
          type="button"
          className="button button-primary"
          disabled={!agreed}
          onClick={() => {
            acceptDisclaimer();
            onAccept();
          }}
        >
          Continue
        </button>
      </div>
    </dialog>
  );
}
