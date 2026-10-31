import type { Metadata } from "next";
import { EXCLUDED_REGIONS } from "@/lib/legal";
import Link from "next/link";
import { SITE_LINKS } from "@/lib/site";
import styles from "../document.module.css";

export const metadata: Metadata = { title: "Terms of use", description: "The terms on which the Stoker site and API are offered." };

/**
 * The terms the footer links to (#131). DRAFT: written from the site's own facts (ADR 0003's server-built transactions,
 * ADR 0009's fee model, the confirmed excluded regions); the owner approves this text before the site opens.
 */
export default function TermsPage() {
  return (
    <div className={`shell ${styles.page}`}>
      <h1 className={`t-h1 ${styles.title}`}>Terms of use</h1>
      <p className={styles.dated}>Last updated 29 October 2026.</p>
      <div className={styles.prose}>
        <h2 className="t-h3">What Stoker is</h2>
        <p>Stoker (stoker.markets) is a website and an API that build Solana transactions for Raydium&apos;s LaunchLab and CPMM programs and show what the Solana blockchain records. Stoker holds no funds and none of your keys. Every transaction is signed in your own wallet, which shows you what it does before you sign.</p>

        <h2 className="t-h3">Who may use it</h2>
        <p>The site is not offered to people in {EXCLUDED_REGIONS}, nor to anyone where launching or trading these coins is not allowed. By using the site you confirm that you are none of these and that you are of legal age where you are.</p>

        <h2 className="t-h3">The coins</h2>
        <p>Coins are created by their creators, not by Stoker, and Stoker does not endorse, verify or vouch for any of them. Copy Protection, risk labels and the figures on a coin&apos;s page are drawn from the chain on a best-effort basis and can be wrong or late. Read the <Link href="/risk">risk disclosure</Link> before you launch or trade.</p>

        <h2 className="t-h3">Fees and payments</h2>
        <p>Fees are set on-chain and shown on every page. Half of what the platform collects on a coin&apos;s trades is forwarded to its creator in the coin&apos;s Quote Asset, as the public Ledger records; there is nothing to claim and no promise of a minimum. The platform may change its fee with notice under <Link href="/announcements">Announcements</Link>.</p>

        <h2 className="t-h3">No advice, no warranty</h2>
        <p>Nothing on this site is financial, legal or tax advice. The site and the API are provided as they are, without warranty of any kind. Solana, Raydium&apos;s programs, wallets and the data providers the site reads from are outside Stoker&apos;s control. To the extent the law allows, Stoker is not liable for any loss arising from your use of the site, a coin, an asset or a program.</p>

        <h2 className="t-h3">The API</h2>
        <p>The public read API may be used with or without a key under the limits shown on the <Link href="/api">Developers</Link> page. A key may be revoked for abuse. Do not scrape the site where the API gives the same data.</p>

        <h2 className="t-h3">Changes and contact</h2>
        <p>These terms may change; the date at the top says when they last did. Questions go to <a href={`mailto:${SITE_LINKS.email}`}>{SITE_LINKS.email}</a>.</p>
      </div>
    </div>
  );
}
