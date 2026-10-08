import Link from "next/link";
import { FOOTER_GROUPS } from "@/lib/site";
import { SocialLinks } from "./SocialLinks";
import styles from "./SiteFooter.module.css";

const external = (href: string) => /^(https?:|mailto:)/.test(href);

/** Every page's foot: the site's own pages, the docs and where to find us; the only place the site links outward. */
export function SiteFooter({ cluster }: { cluster: string }) {
  return (
    <footer className={styles.footer}>
      <div className={`shell ${styles.inner}`}>
        <div className={styles.brand}>
          <Link href="/" className={styles.wordmark}>
            <img className={styles.mark} src="/icon.png" alt="" width="28" height="28" />
            Stoker
          </Link>
          <p className={styles.tagline}>Launch a coin on Solana, paired with any asset. Creators earn from every trade.</p>
          <SocialLinks />
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
