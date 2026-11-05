"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { CopyButton } from "./CopyButton";
import { EMBEDDED_WALLET_NAME } from "@/lib/signIn";
import styles from "./ExportKey.module.css";

/**
 * The Stoker wallet's secret key, shown once in the site's own dialog (ADR 0016): base58, as Phantom and Solflare
 * import it, with Copy and the one warning that matters. Nothing is stored; closing the dialog forgets it.
 */
export function ExportKey({ secret, onClose }: { secret: string | null; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (secret && !d.open) d.showModal();
    if (!secret && d.open) d.close();
  }, [secret]);
  if (!secret) return null;
  return createPortal(
    <dialog ref={dialog} className={`dialog ${styles.dialog}`} aria-labelledby="export-key-title" onClose={onClose}>
      <h2 id="export-key-title" className={`t-h3 ${styles.title}`}>Your {EMBEDDED_WALLET_NAME}&apos;s secret key</h2>
      <p className={styles.text}>
        Anyone who has this key controls the wallet and everything in it. Keep it where only you can read it. Phantom and Solflare import it as
        a private key, which gives you the same wallet there.
      </p>
      <div className={styles.key}>
        <code className={`mono ${styles.secret}`}>{secret}</code>
        <CopyButton value={secret} label="Copy secret key" />
      </div>
      <div className={styles.actions}>
        <button type="button" className="button button-primary" onClick={onClose}>
          Done
        </button>
      </div>
    </dialog>,
    document.body,
  );
}
