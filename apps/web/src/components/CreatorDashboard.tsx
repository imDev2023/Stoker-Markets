"use client";

import Link from "next/link";
import { useWallet } from "@solana/wallet-adapter-react";
import { useCallback, useEffect, useState } from "react";
import type { CreatorFeeClaim, CreatorFees, PlatformInfo } from "@launchpad/contract";
import { getCreatorFees, listCreatorFeeClaims } from "@/lib/api";
import { explorerUrl, formatUnits, formatUtc, quoteTicker, shortAddress } from "@/lib/format";
import { ClaimCard } from "./ClaimCard";
import { CopyButton } from "./CopyButton";
import { WalletButton } from "./WalletButton";
import styles from "./CreatorDashboard.module.css";

const REFRESH_MS = 10_000;

/**
 * A Creator's public Creator Fee page: what each vault holds, what each coin earned, and every claim. Anyone can look;
 * only the Creator's own wallet gets the claim buttons.
 */
export function CreatorDashboard({
  initialFees, initialClaims, platform,
}: { initialFees: CreatorFees; initialClaims: CreatorFeeClaim[]; platform: PlatformInfo }) {
  const { publicKey } = useWallet();
  const [fees, setFees] = useState(initialFees);
  const [claims, setClaims] = useState(initialClaims);
  const creator = fees.creator;
  const isOwner = publicKey?.toBase58() === creator;
  const feePct = platform.creatorFeeBps / 100;

  const refresh = useCallback(async () => {
    try {
      const [f, c] = await Promise.all([getCreatorFees(creator), listCreatorFeeClaims(creator)]);
      if (f) setFees(f);
      setClaims(c.claims);
    } catch {
      // keep showing the last good data; the next tick retries
    }
  }, [creator]);

  useEffect(() => {
    const id = setInterval(refresh, REFRESH_MS);
    return () => clearInterval(id);
  }, [refresh]);

  const nothingYet = fees.assets.length === 0 && fees.launches.length === 0;
  // A Quote Asset whose coins have never traded has an empty vault and no history: nothing to show for it yet.
  const assets = fees.assets.filter((a) => a.claimable !== "0" || a.earned !== "0" || a.claimed !== "0");

  return (
    <article className={`shell ${styles.page}`}>
      <header className={styles.head}>
        <h1 className={styles.title}>{isOwner ? "Your Creator Fee" : "Creator Fee"}</h1>
        <p className={styles.who}>
          <span className={styles.whoLabel}>Creator</span>
          <a className="mono" href={explorerUrl("address", creator, platform)} target="_blank" rel="noreferrer">
            {shortAddress(creator)}
          </a>
          <CopyButton value={creator} label="Copy creator address" />
        </p>
        <p className={styles.lede}>
          Creators earn {feePct}% of every trade on their coins&apos; curves. The chain pays it into a vault only the
          Creator&apos;s wallet can claim from, so it never waits on us.
        </p>
      </header>

      <div className={styles.layout}>
        <div className={styles.main}>
          <section className={styles.section} aria-labelledby="claimable-title">
            <h2 id="claimable-title" className="visually-hidden">Ready to claim</h2>
            {nothingYet ? (
              <div className={styles.emptyCard}>
                <p>{isOwner ? "You haven't launched a coin here yet." : "This wallet hasn't launched a coin here yet."}</p>
                {isOwner ? (
                  <Link href="/launch" className={styles.cta}>Launch a coin</Link>
                ) : (
                  <Link href="/" className={styles.cta}>See all coins</Link>
                )}
              </div>
            ) : assets.length === 0 ? (
              <div className={styles.emptyCard}>
                <p>No Creator Fee yet. A coin starts earning with its first trade.</p>
              </div>
            ) : (
              assets.map((a) => (
                <ClaimCard key={a.quote.mint} asset={a} platform={platform} canClaim={isOwner} onClaimed={() => void refresh()} />
              ))
            )}
            {assets.length > 0 && !isOwner && (
              <div className={styles.access}>
                {publicKey ? (
                  <p>
                    Only the Creator&apos;s wallet, <span className="mono">{shortAddress(creator)}</span>, can claim this. You&apos;re
                    connected as <span className="mono">{shortAddress(publicKey.toBase58())}</span>.
                  </p>
                ) : (
                  <>
                    <p>Only the Creator&apos;s wallet can claim this. Is it yours? Connect it to claim.</p>
                    <WalletButton variant="inline" />
                  </>
                )}
              </div>
            )}
          </section>

          {fees.launches.length > 0 && (
            <section className={styles.card} aria-labelledby="coins-title">
              <h2 id="coins-title" className={styles.cardTitle}>Coins</h2>
              <ul className={styles.coins}>
                {fees.launches.map((l) => {
                  const live = l.status === "live";
                  return (
                    <li key={l.mint}>
                      <Link href={`/coin/${l.mint}`} className={styles.coin}>
                        {l.image ? <img src={l.image} alt="" width={44} height={44} /> : <span className={styles.noImage} />}
                        <span className={styles.coinNames}>
                          <span className={styles.coinSymbol}>{l.symbol}</span>
                          <span className={styles.coinName}>{l.name}</span>
                        </span>
                        <span className={styles.coinEarned}>
                          <span>
                            <span className="mono">{formatUnits(l.earned, l.quote.decimals, 6)}</span> {quoteTicker(l.quote)}
                          </span>
                          <span className={live ? styles.earning : styles.ended}>{live ? "Earning" : "Ended at graduation"}</span>
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
        </div>

        <aside className={styles.side}>
          <section className={styles.rule} aria-labelledby="rule-title">
            <h2 id="rule-title" className={styles.cardTitle}>Paid until graduation</h2>
            <p>
              The Creator Fee is {feePct}% of every trade while a coin trades on its curve. At graduation, when the curve
              sells out and the coin moves to its Raydium pool, the Creator Fee ends and that coin&apos;s trading fees go to
              the platform.
            </p>
          </section>

          <section className={styles.card} aria-labelledby="history-title">
            <h2 id="history-title" className={styles.cardTitle}>Claim history</h2>
            {claims.length === 0 ? (
              <p className={styles.muted}>No claims yet.</p>
            ) : (
              <ol className={styles.claims}>
                {claims.map((c) => (
                  <li key={c.signature}>
                    <span className={styles.claimAmount}>
                      <span className="mono">{formatUnits(c.amount, c.quote.decimals, c.quote.decimals)}</span> {quoteTicker(c.quote)}
                    </span>
                    <a href={explorerUrl("tx", c.signature, platform)} target="_blank" rel="noreferrer">View transaction</a>
                    <time dateTime={c.time} className={styles.claimTime}>{formatUtc(c.time)}</time>
                  </li>
                ))}
              </ol>
            )}
          </section>

          <section className={styles.card} aria-labelledby="docs-title">
            <h2 id="docs-title" className={styles.cardTitle}>Claim without this website</h2>
            <p className={styles.muted}>
              The vault belongs to LaunchLab, not to us. If this site is ever down, the Creator can claim with any Solana
              library.
            </p>
            <Link href="/docs/claim-creator-fee" className={styles.docsLink}>How to claim it yourself</Link>
          </section>
        </aside>
      </div>
    </article>
  );
}
