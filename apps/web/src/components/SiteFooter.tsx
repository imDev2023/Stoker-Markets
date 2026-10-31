"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import type { PlatformInfo } from "@launchpad/contract";
import { API_URL } from "@/lib/api";
import { EXCLUDED_REGIONS, RISK_SENTENCE } from "@/lib/legal";
import { COMPACT_FOOTER_LINKS, FOOTER_GROUPS } from "@/lib/site";
import { Address } from "./Address";
import { Mark } from "./Mark";
import { SocialLinks } from "./SocialLinks";
import styles from "./SiteFooter.module.css";

const external = (href: string) => /^(https?:|mailto:)/.test(href);
/** How often the foot asks the API whether it is still there. */
const HEALTH_MS = 60_000;

function FooterLink({ href, label }: { href: string; label: string }) {
  return external(href) ? (
    <a href={href} target={href.startsWith("mailto:") ? undefined : "_blank"} rel="noreferrer">{label}</a>
  ) : (
    <Link href={href}>{label}</Link>
  );
}

/**
 * The status line a trader looks for: the network and whether the API answers. The page itself was rendered from the
 * API a moment ago, so it starts as online and only a later failed check turns it; nothing on the line is a clock, so
 * the baselines hold.
 */
function Status({ cluster }: { cluster: PlatformInfo["cluster"] }) {
  const [ok, setOk] = useState(true);
  useEffect(() => {
    let gone = false;
    const check = async () => {
      try {
        const r = await fetch(`${API_URL}/health`, { cache: "no-store" });
        if (!gone) setOk(r.ok);
      } catch {
        if (!gone) setOk(false);
      }
    };
    const timer = setInterval(check, HEALTH_MS);
    return () => {
      gone = true;
      clearInterval(timer);
    };
  }, []);
  const network = cluster === "mainnet" ? "Mainnet" : cluster === "devnet" ? "Devnet" : "Localnet";
  return (
    <span className={styles.status} data-status>
      <span className={`${styles.dot} ${ok ? styles.online : styles.offline}`} aria-hidden="true" />
      {network} · {ok ? "API online" : "API unreachable"}
    </span>
  );
}

/**
 * Two footers from one source of truth (src/lib/site.ts; #131, after the research's footers): the landing's four groups
 * by audience with the on-chain addresses, the status, the socials once and a disclaimer that opens with one bold risk
 * sentence and names the excluded regions; and on every terminal page one row, so the page ends with its data. The
 * only place the site links outward.
 */
export function SiteFooter({ platform }: { platform: PlatformInfo }) {
  const pathname = usePathname();
  if (pathname !== "/") {
    return (
      <footer className={styles.compact}>
        <div className={`shell ${styles.row}`}>
          <Link href="/" className={styles.lockup}>
            <Mark className={styles.markSmall} />
            Stoker
          </Link>
          <nav className={styles.links} aria-label="Footer">
            {COMPACT_FOOTER_LINKS.map((l) => (
              <FooterLink key={l.href} href={l.href} label={l.label} />
            ))}
          </nav>
          <SocialLinks />
          <Status cluster={platform.cluster} />
          {/* One row at 1440 with the links beside it (the risk page is among them), under them when the row is full. */}
          <p className={styles.line}>
            <strong>Coins launched here can lose all their value.</strong> Not for the US, UK, Canada or sanctioned countries.
          </p>
        </div>
      </footer>
    );
  }
  return (
    <footer className={styles.footer}>
      <div className={`shell grid ${styles.inner}`}>
        <div className={`col-4 ${styles.brand}`}>
          <Link href="/" className={styles.wordmark}>
            <Mark className={styles.mark} />
            Stoker
          </Link>
          <p className={styles.tagline}>Launch a coin on Solana, paired with any asset Raydium quotes. Creators earn from every trade.</p>
          <SocialLinks />
          <Status cluster={platform.cluster} />
        </div>
        <nav className={`col-8 ${styles.groups}`} aria-label="Footer">
          {FOOTER_GROUPS.map((g) => (
            <div key={g.title} className={styles.group}>
              <h2 className={styles.title}>{g.title}</h2>
              <ul className={styles.list}>
                {g.links.map((l) => (
                  <li key={l.href}>
                    <FooterLink href={l.href} label={l.label} />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
        {/* The addresses everything here is built on, for anyone who checks a site before trusting it with money. */}
        <dl className={`col-12 ${styles.chain}`}>
          <div>
            <dt>PlatformConfig</dt>
            <dd><Address value={platform.platformConfig} platform={platform} /></dd>
          </div>
          <div>
            <dt>LaunchLab program</dt>
            <dd><Address value={platform.launchlabProgram} platform={platform} /></dd>
          </div>
        </dl>
        <div className={`col-12 ${styles.legal}`}>
          <p>
            <strong>{RISK_SENTENCE}</strong> Stoker is an interface to Raydium&apos;s LaunchLab program on Solana and never holds your funds. Fees
            are set on-chain and shown on every page. The site is not available to people in {EXCLUDED_REGIONS}, and nothing on it is financial
            advice. <Link href="/risk">Read the risk disclosure</Link>.
          </p>
        </div>
      </div>
    </footer>
  );
}
