import type { Metadata } from "next";
import { SITE_LINKS } from "@/lib/site";
import styles from "../document.module.css";

export const metadata: Metadata = { title: "Privacy", description: "What the Stoker site and API keep about you, and what the chain keeps for everyone." };

/**
 * The privacy notice the footer links to (#131). DRAFT: written from what the site actually does (one cookie for the
 * scheme, browser storage for the disclaimer, Cloudflare's request logs, Arweave for images); the owner approves this
 * text before the site opens.
 */
export default function PrivacyPage() {
  return (
    <div className={`shell ${styles.page}`}>
      <h1 className={`t-h1 ${styles.title}`}>Privacy</h1>
      <p className={styles.dated}>Draft of 28 October 2026, pending the operator&apos;s approval.</p>
      <div className={styles.prose}>
        <h2 className="t-h3">No account, no tracking</h2>
        <p>Stoker has no accounts. The site sets one cookie, which holds your light-or-dark choice, and keeps your acknowledgement of the disclaimer in your browser&apos;s own storage. There are no analytics scripts and no advertising trackers.</p>

        <h2 className="t-h3">What the servers see</h2>
        <p>Like any website, the site and the API record each request (its address, browser and the page or endpoint asked for) in Cloudflare&apos;s logs, kept briefly to run the service and to stop abuse. The API may read the country a request comes from, as Cloudflare reports it, to decide which features are offered where.</p>

        <h2 className="t-h3">What the chain keeps</h2>
        <p>Launches, trades, wallet addresses and payments are read from the Solana blockchain, which is public and permanent; the site shows them but cannot change or delete them. A coin&apos;s image and metadata are stored on Arweave at launch, where they are public and permanent too.</p>

        <h2 className="t-h3">Who else is involved</h2>
        <p>The site runs on Cloudflare; chain data comes from Helius and public Solana RPC nodes; prices and routes come from Jupiter; permanent storage goes through ArDrive Turbo to Arweave; your wallet is provided by its own maker. Each of these sees what it needs to serve the request and has its own privacy terms.</p>

        <h2 className="t-h3">Contact</h2>
        <p>Questions about this notice go to <a href={`mailto:${SITE_LINKS.email}`}>{SITE_LINKS.email}</a>.</p>
      </div>
    </div>
  );
}
