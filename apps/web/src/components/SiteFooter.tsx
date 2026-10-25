import Link from "next/link";
import { FOOTER_GROUPS } from "@/lib/site";
import { Mark } from "./Mark";
import { SchemeToggle } from "./SchemeToggle";
import { SocialLinks } from "./SocialLinks";
import styles from "./SiteFooter.module.css";

const external = (href: string) => /^(https?:|mailto:)/.test(href);

/**
 * Every page's foot: the site's own pages, the docs and where to find us; the only place the site links outward.
 * `schemeToggle` sets the light-or-dark toggle beside the socials (the lighter header candidates, src/lib/header.ts).
 */
export function SiteFooter({ cluster, schemeToggle = false }: { cluster: string; schemeToggle?: boolean }) {
  return (
    <footer className={styles.footer}>
      <div className={`shell ${styles.inner}`}>
        <div className={styles.brand}>
          <Link href="/" className={styles.wordmark}>
            <Mark className={styles.mark} />
            Stoker
          </Link>
          <p className={styles.tagline}>Launch a coin on Solana, paired with any asset. Creators earn from every trade.</p>
          <div className={styles.row}>
            <SocialLinks />
            {schemeToggle && <SchemeToggle />}
          </div>
        </div>
        <nav className={styles.groups} aria-label="Footer">
          {FOOTER_GROUPS.map((g) => (
            <div key={g.title} className={styles.group}>
              <h2 className={styles.title}>{g.title}</h2>
              <ul className={styles.list}>
                {g.links.map((l) => (
                  <li key={l.href}>
                    {external(l.href) ? (
                      <a href={l.href} target={l.href.startsWith("mailto:") ? undefined : "_blank"} rel="noreferrer">{l.label}</a>
                    ) : (
                      <Link href={l.href}>{l.label}</Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
        <div className={styles.legal}>
          <p>
            Coins launched here are not available to people in the United States, the United Kingdom, Canada or sanctioned
            countries. Nothing on this site is financial advice; a coin can lose all of its value.
          </p>
          <p>
            Fees are set on-chain and shown on every page. {cluster !== "mainnet" && <span className={styles.cluster}>This site runs on {cluster}.</span>}
          </p>
        </div>
      </div>
    </footer>
  );
}
