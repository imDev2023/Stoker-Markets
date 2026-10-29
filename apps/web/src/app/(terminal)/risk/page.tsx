import type { Metadata } from "next";
import Link from "next/link";
import { SITE_LINKS } from "@/lib/site";
import styles from "../document.module.css";

export const metadata: Metadata = { title: "Risk disclosure", description: "What can go wrong with a coin launched on Stoker, in plain words." };

/**
 * The risk disclosure the footer's one bold sentence links to (#131; the facts are the site's own: the fee model of
 * ADR 0009, the curve rules, the Quote Asset labels and the confirmed excluded regions). DRAFT: the owner approves
 * this text before the site opens.
 */
export default function RiskPage() {
  return (
    <div className={`shell ${styles.page}`}>
      <h1 className={`t-h1 ${styles.title}`}>Risk disclosure</h1>
      <p className={styles.dated}>Last updated 29 October 2026.</p>
      <div className={styles.prose}>
        <p><strong>Coins launched here are speculative and can lose all their value.</strong> Most new coins do. Nobody sets or supports a coin&apos;s price: it comes from what other people pay for it, and it can fall to nothing at any time.</p>

        <h2 className="t-h3">How a coin trades</h2>
        <p>A coin starts on a bonding curve, where every buy raises the price and every sell lowers it. Once the curve has sold out, Raydium moves the coin into a liquidity pool, where it trades at whatever price buyers and sellers agree. A coin&apos;s pool liquidity is locked at Graduation; its price is not.</p>

        <h2 className="t-h3">The asset a coin is priced in</h2>
        <p>Each coin is priced in an asset its creator chose: SOL, a stablecoin, a tokenized stock or another asset Raydium quotes. Some of those assets are issued by companies that can freeze or move them, some can be changed by their issuer, and some trade thinly, so a coin&apos;s value moves with its asset as well as with itself. What is known about each asset is on its page under <Link href="/assets">Assets</Link>, as risk labels read from the chain.</p>

        <h2 className="t-h3">Creators, early buyers and taxes</h2>
        <p>A coin&apos;s creator may hold a large share of it and may sell at any time; so may the wallets that bought in its first moments. A coin&apos;s page shows the creator&apos;s holding, the early buyers and the largest wallets as the chain records them. A Reward Launch carries a transfer tax of 1%, 3% or 5% on every transfer of the coin, taken in the coin itself.</p>

        <h2 className="t-h3">Fees</h2>
        <p>On the curve a trade pays the Platform Fee shown on every page (1% at launch) plus Raydium&apos;s own fee; after Graduation a trade pays the pool&apos;s fees (1.25% in all). Half of what the platform collects on a coin&apos;s trades is forwarded to its creator, and every payment is on the public Ledger. Fees are set on-chain and can only change with notice under <Link href="/announcements">Announcements</Link>.</p>

        <h2 className="t-h3">Technology</h2>
        <p>Stoker builds transactions for Raydium&apos;s programs on Solana and shows what the chain records; it never holds your funds or your keys. A signed transaction cannot be reversed. The programs, the Solana network, your wallet and the data providers the site reads from are outside Stoker&apos;s control and can fail, pause or change.</p>

        <h2 className="t-h3">Who may use the site</h2>
        <p>The site is not offered to people in the United States, the United Kingdom, Canada or any country under sanctions, nor to anyone where launching or trading these coins is not allowed. Nothing on this site is financial, legal or tax advice. Questions go to <a href={`mailto:${SITE_LINKS.email}`}>{SITE_LINKS.email}</a>.</p>
      </div>
    </div>
  );
}
