"use client";

import Link from "next/link";
import { useWallet } from "@solana/wallet-adapter-react";
import { useCallback, useEffect, useState } from "react";
import type { CreatorFeeClaim, CreatorFees, CreatorForward, CurveStatus, PlatformInfo } from "@launchpad/contract";
import { getCreatorFees, listCreatorFeeClaims, listCreatorForwards } from "@/lib/api";
import { creatorEarnings } from "@/lib/fees";
import { explorerUrl, formatUnits, formatUtc, quoteTicker, shortAddress, SOL_DECIMALS } from "@/lib/format";
import { ClaimCard } from "./ClaimCard";
import { CopyButton } from "./CopyButton";
import { WalletButton } from "./WalletButton";
import styles from "./CreatorDashboard.module.css";

const REFRESH_MS = 10_000;

/** Where a coin earns its Creator from: its curve until it sells out, its Raydium pool after graduation. */
const EARNING: Record<CurveStatus, string> = { live: "Earning on its curve", graduating: "Graduating", graduated: "Earning in its pool" };

/**
 * A Creator's public Creator Fee page: what each vault holds, what each coin earned, every claim, and everything the
 * platform has sent the Creator (ADR 0007). Anyone can look; only the Creator's own wallet gets the claim buttons.
 */
export function CreatorDashboard({
  initialFees, initialClaims, initialForwards, platform,
}: { initialFees: CreatorFees; initialClaims: CreatorFeeClaim[]; initialForwards: CreatorForward[]; platform: PlatformInfo }) {
  const { publicKey } = useWallet();
  const [fees, setFees] = useState(initialFees);
  const [claims, setClaims] = useState(initialClaims);
  const [forwards, setForwards] = useState(initialForwards);
  const creator = fees.creator;
  const isOwner = publicKey?.toBase58() === creator;
  const earns = creatorEarnings(platform);

  const refresh = useCallback(async () => {
    try {
      const [f, c, w] = await Promise.all([getCreatorFees(creator), listCreatorFeeClaims(creator), listCreatorForwards(creator)]);
      if (f) setFees(f);
      setClaims(c.claims);
      setForwards(w.forwards);
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
  const assets = fees.assets.filter((a) => a.claimable !== "0" || a.earned !== "0" || a.claimed !== "0" || a.forward.earned !== "0");

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
          Creators earn {earns.summary}. On the curve the chain pays {earns.chain}% into a vault only the Creator&apos;s
          wallet can claim from, so it never waits on us. The platform sends the rest straight to the Creator&apos;s wallet.
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
                  const earned = BigInt(l.earned) + BigInt(l.forward.curve) + BigInt(l.forward.pool);
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
                            <span className="mono">{formatUnits(earned.toString(), l.quote.decimals, 6)}</span> {quoteTicker(l.quote)}
                          </span>
                          <span className={styles.earning}>{EARNING[l.status]}</span>
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
            <h2 id="rule-title" className={styles.cardTitle}>How a Creator is paid</h2>
            <p>
              While a coin trades on its curve, the chain pays the Creator Fee, {earns.chain}% of every trade, into the
              vault. The platform adds {earns.forward}% out of its own fee.
            </p>
            <p>
              After graduation the coin trades in its Raydium pool, and the platform sends on {earns.poolShare}% of the
              creator fee that pool pays it, ~{earns.pool}% of every trade.
            </p>
            <p>
              The platform&apos;s part arrives in the Creator&apos;s wallet within about an hour of being collected, once it
              is worth {formatUnits(platform.creatorForward.minLamports, SOL_DECIMALS)} SOL, with nothing to claim. Every
              payment is on the <Link href="/revenue">public ledger</Link>.
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

          <section className={styles.card} aria-labelledby="forwards-title">
            <h2 id="forwards-title" className={styles.cardTitle}>Sent by the platform</h2>
            {forwards.length === 0 ? (
              <p className={styles.muted}>Nothing sent yet.</p>
            ) : (
              <ol className={styles.claims}>
                {forwards.map((f) => (
                  <li key={f.signature}>
                    <span className={styles.claimAmount}>
                      <span className="mono">{formatUnits(f.amount, f.quote.decimals, f.quote.decimals)}</span> {quoteTicker(f.quote)}
                    </span>
                    <a href={explorerUrl("tx", f.signature, platform)} target="_blank" rel="noreferrer">View transaction</a>
                    <time dateTime={f.time} className={styles.claimTime}>{f.status === "sending" ? "On its way" : formatUtc(f.time)}</time>
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
