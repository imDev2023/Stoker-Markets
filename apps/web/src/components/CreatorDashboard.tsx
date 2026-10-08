"use client";

import Link from "next/link";
import { useWallet } from "@solana/wallet-adapter-react";
import { useCallback, useEffect, useState } from "react";
import type { CreatorEarnings, CreatorEarningsAsset, CreatorForward, CurveStatus, PlatformInfo } from "@launchpad/contract";
import { getCreatorEarnings, listCreatorForwards } from "@/lib/api";
import { creatorEarnings } from "@/lib/fees";
import { explorerUrl, formatUnits, formatUtc, quoteTicker, shortAddress, SOL_DECIMALS } from "@/lib/format";
import { CopyButton } from "./CopyButton";
import { QuoteLogo } from "./QuoteLogo";
import styles from "./CreatorDashboard.module.css";

const REFRESH_MS = 10_000;

/** Where a coin earns its Creator from: its curve until it sells out, its Raydium pool after graduation. */
const EARNING: Record<CurveStatus, string> = { live: "Earning on its curve", graduating: "Graduating", graduated: "Earning in its pool" };

/**
 * A Creator's public earnings page (ADR 0009): per Quote Asset what their coins earned, what the platform has sent
 * them and what is still to come, what each coin earned, and every payment. Anyone can look; there is nothing to
 * claim, so the Creator's own wallet only changes the title.
 */
export function CreatorDashboard({
  initialEarnings, initialForwards, platform,
}: { initialEarnings: CreatorEarnings; initialForwards: CreatorForward[]; platform: PlatformInfo }) {
  const { publicKey } = useWallet();
  const [earnings, setEarnings] = useState(initialEarnings);
  const [forwards, setForwards] = useState(initialForwards);
  const creator = earnings.creator;
  const isOwner = publicKey?.toBase58() === creator;
  const earns = creatorEarnings(platform);

  const refresh = useCallback(async () => {
    try {
      const [e, w] = await Promise.all([getCreatorEarnings(creator), listCreatorForwards(creator)]);
      if (e) setEarnings(e);
      setForwards(w.forwards);
    } catch {
      // keep showing the last good data; the next tick retries
    }
  }, [creator]);

  useEffect(() => {
    const id = setInterval(refresh, REFRESH_MS);
    return () => clearInterval(id);
  }, [refresh]);

  const nothingYet = earnings.launches.length === 0;
  // A Quote Asset whose coins have never traded has earned nothing: nothing to show for it yet.
  const assets = earnings.assets.filter((a) => a.earned !== "0" || a.forwarded !== "0");

  return (
    <article className={`shell ${styles.page}`}>
      <header className={styles.head}>
        <h1 className={styles.title}>{isOwner ? "Your creator earnings" : "Creator earnings"}</h1>
        <p className={styles.who}>
          <span className={styles.whoLabel}>Creator</span>
          <a className="mono" href={explorerUrl("address", creator, platform)} target="_blank" rel="noreferrer">
            {shortAddress(creator)}
          </a>
          <CopyButton value={creator} label="Copy creator address" />
        </p>
        <p className={styles.lede}>
          Creators earn {earns.summary}: half of what the platform collects on their coins, sent straight to their
          wallet with nothing to claim.
        </p>
      </header>

      <div className={styles.layout}>
        <div className={styles.main}>
          <section className={styles.section} aria-labelledby="earned-title">
            <h2 id="earned-title" className="visually-hidden">Earned</h2>
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
                <p>Nothing earned yet. A coin starts earning with its first trade.</p>
              </div>
            ) : (
              assets.map((a) => <AssetCard key={a.quote.mint} asset={a} />)
            )}
          </section>

          {earnings.launches.length > 0 && (
            <section className={styles.card} aria-labelledby="coins-title">
              <h2 id="coins-title" className={styles.cardTitle}>Coins</h2>
              <ul className={styles.coins}>
                {earnings.launches.map((l) => {
                  const earned = BigInt(l.curve) + BigInt(l.pool);
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
              While a coin trades on its curve, every trade pays the Platform Fee, and half of it is the Creator&apos;s:
              ~{earns.curve}% of every trade.
            </p>
            <p>
              After graduation the coin trades in its Raydium pool, and half of the creator fee that pool pays the
              platform is the Creator&apos;s: ~{earns.pool}% of every trade.
            </p>
            <p>
              It arrives in the Creator&apos;s wallet within about an hour of being collected, once it is worth{" "}
              {formatUnits(platform.creatorForward.minLamports, SOL_DECIMALS)} SOL, with nothing to claim. Every payment is on
              the <Link href="/revenue">public ledger</Link>.
            </p>
          </section>

          <section className={styles.card} aria-labelledby="forwards-title">
            <h2 id="forwards-title" className={styles.cardTitle}>Sent by the platform</h2>
            {forwards.length === 0 ? (
              <p className={styles.muted}>Nothing sent yet.</p>
            ) : (
              <ol className={styles.payments}>
                {forwards.map((f) => (
                  <li key={f.signature}>
                    <span className={styles.paymentAmount}>
                      <span className="mono">{formatUnits(f.amount, f.quote.decimals, f.quote.decimals)}</span> {quoteTicker(f.quote)}
                    </span>
                    <a href={explorerUrl("tx", f.signature, platform)} target="_blank" rel="noreferrer">View transaction</a>
                    <time dateTime={f.time} className={styles.paymentTime}>{f.status === "sending" ? "On its way" : formatUtc(f.time)}</time>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </aside>
      </div>
    </article>
  );
}

/** One Quote Asset: what the Creator's coins earned in it, what has reached their wallet and what is still to come. */
function AssetCard({ asset }: { asset: CreatorEarningsAsset }) {
  const { quote } = asset;
  const symbol = quoteTicker(quote);
  const units = (raw: string) => formatUnits(raw, quote.decimals, quote.decimals);
  return (
    <section className={styles.asset} aria-labelledby={`earned-${quote.mint}`}>
      <div className={styles.assetHead}>
        <h3 id={`earned-${quote.mint}`} className={styles.assetSymbol}>
          <QuoteLogo quote={quote} size={24} />
          {symbol}
        </h3>
        <span className={styles.assetLabel}>Earned</span>
      </div>
      <p className={styles.assetAmount}>
        <span className="mono">{units(asset.earned)}</span> <span className={styles.assetUnit}>{symbol}</span>
      </p>
      <dl className={styles.assetFacts}>
        <div>
          <dt>Sent by the platform</dt>
          <dd><span className="mono">{units(asset.forwarded)}</span> {symbol}</dd>
        </div>
        <div>
          <dt>Still to be sent</dt>
          <dd><span className="mono">{units(asset.pending)}</span> {symbol}</dd>
        </div>
      </dl>
    </section>
  );
}
