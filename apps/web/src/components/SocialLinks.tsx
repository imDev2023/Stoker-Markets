import { SITE_LINKS } from "@/lib/site";
import styles from "./SocialLinks.module.css";

/** The X and Telegram buttons, icon only, shown in the header and the footer. */
export function SocialLinks() {
  return (
    <div className={styles.row}>
      <a className={styles.icon} href={SITE_LINKS.x.href} target="_blank" rel="noreferrer" aria-label="Stoker on X" title="X">
        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
          <path fill="currentColor" d="M18.9 2H22l-7.1 8.1L23 22h-6.6l-5.2-6.7L5.3 22H2.2l7.6-8.6L2 2h6.8l4.7 6.2L18.9 2Zm-1.1 18h1.7L7.3 3.9H5.5L17.8 20Z" />
        </svg>
      </a>
      <a className={styles.icon} href={SITE_LINKS.telegram.href} target="_blank" rel="noreferrer" aria-label="Stoker on Telegram" title="Telegram">
        <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true">
          <path fill="currentColor" d="M21.6 3.3 2.9 10.5c-1.1.4-1.1 1.1-.2 1.4l4.7 1.5 1.8 5.6c.2.6.1.8.7.8.5 0 .7-.2 1-.5l2.3-2.2 4.7 3.5c.9.5 1.5.2 1.7-.8l3.1-14.7c.3-1.3-.5-1.8-1.1-1.8Zm-3.4 4.3-8.6 7.8-.3 3.2-1.5-4.7 10-6.3c.5-.3.9 0 .4.3v-.3Z" />
        </svg>
      </a>
    </div>
  );
}
