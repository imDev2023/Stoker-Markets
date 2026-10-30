"use client";

import Link from "next/link";
import { useWallet } from "@solana/wallet-adapter-react";
import { useEffect, useState } from "react";
import type { CreatorEarnings, CreatorEarningsAsset, CreatorForward, CurveStatus, PlatformInfo } from "@launchpad/contract";
import { getCreatorEarnings, listCreatorForwards } from "@/lib/api";
import { graduationFeeSol } from "@/lib/fees";
import { explorerUrl, formatUnits, formatUtc, quoteTicker, SOL_DECIMALS } from "@/lib/format";
import { Ring } from "./Mark";
import { QuoteLogo } from "./QuoteLogo";
import { WalletButton } from "./WalletButton";
import styles from "./CreatorDashboard.module.css";

const REFRESH_MS = 10_000;

/** Where a coin earns its Creator from: its curve until it sells out, its Raydium pool after graduation. */
const EARNING: Record<CurveStatus, string> = { live: "Earning on its curve", graduating: "Graduating", graduated: "Earning in its pool" };

type Loaded = { creator: string; earnings: CreatorEarnings; forwards: CreatorForward[] };

/**
 * The connected Creator's own earnings page (ADR 0009): per Quote Asset what their coins earned, what the platform has
 * sent them and what is still to come, what each coin earned, and every payment. There is no public creator page
 * (owner, 2026-10-08): without a wallet it asks for one, and the header's account menu leads here only once the wallet
 * has launched a coin. Every payment is on the public Ledger anyway.
 */
export function CreatorDashboard({ platform }: { platform: PlatformInfo }) {
  const { publicKey } = useWallet();
  const creator = publicKey?.toBase58() ?? null;
  const [loaded, setLoaded] = useState<Loaded | null>(null);

  useEffect(() => {
    if (!creator) return;
    let gone = false;
    const refresh = async () => {
      try {
        const [earnings, { forwards }] = await Promise.all([getCreatorEarnings(creator), listCreatorForwards(creator)]);
        if (!gone && earnings) setLoaded({ creator, earnings, forwards });
      } catch {
        // keep showing the last good data; the next tick retries
      }
    };
    void refresh();
    const id = setInterval(refresh, REFRESH_MS);
    return () => {
      gone = true;
      clearInterval(id);
    };
  }, [creator]);

  // What was loaded for another wallet, or before this one disconnected, is not this wallet's.
  const own = loaded?.creator === creator ? loaded : null;

  return (
    <article className={`shell ${styles.page}`}>
      <header className={styles.head}>
        <h1 className={`t-h1 ${styles.title}`}>Your creator earnings</h1>
        <p className={styles.lede}>
          Your coins earn you half of what the platform collects on them, sent straight to your wallet with nothing to claim.
        </p>
      </header>
      {!creator ? (
        <div className={`card ${styles.connect}`}>
          <p>Connect the wallet you launched with to see what your coins have earned you.</p>
          <WalletButton variant="inline" />
        </div>
      ) : !own ? (
        <p className={styles.muted} aria-busy="true">Opening your earnings…</p>
      ) : own.earnings.launches.length === 0 ? (
        <div className={`card card-raised ${styles.emptyCard} ${styles.lone}`}>
          <Ring size={72} className={styles.ring} />
          <p>You haven&apos;t launched a coin here yet.</p>
          <Link href="/launch" className="button button-primary">Stoke a coin</Link>
        </div>
      ) : (
        <Earnings earnings={own.earnings} forwards={own.forwards} platform={platform} />
      )}
    </article>
  );
}

/** What the wallet's coins earned, per Quote Asset and per coin, with how it is paid and every payment so far. */
function Earnings({ earnings, forwards, platform }: { earnings: CreatorEarnings; forwards: CreatorForward[]; platform: PlatformInfo }) {
  const graduationFee = graduationFeeSol(platform);
  // A Quote Asset whose coins have never traded has earned nothing: nothing to show for it yet.
  const assets = earnings.assets.filter((a) => a.earned !== "0" || a.forwarded !== "0");
  return (
    <div className={styles.layout}>
      <div className={styles.main}>
        <section className={styles.section} aria-labelledby="earned-title">
          <h2 id="earned-title" className="visually-hidden">Earned</h2>
          {assets.length === 0 ? (
            <div className={`card card-raised ${styles.emptyCard}`}>
              <Ring size={72} className={styles.ring} />
              <p>Nothing earned yet. A coin starts earning with its first trade.</p>
            </div>
          ) : (
            assets.map((a) => <AssetCard key={a.quote.mint} asset={a} />)
          )}
        </section>

        <section className={`card ${styles.card}`} aria-labelledby="coins-title">
          <h2 id="coins-title" className={`t-h3 ${styles.cardTitle}`}>Coins</h2>
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
                      <span className={styles.earning}>
                        {EARNING[l.status]}
                        {l.graduationFee && (l.graduationFee.settledAt ? "; Graduation Fee paid" : "; Graduation Fee coming out of the next payments")}
                      </span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      </div>

      <aside className={styles.side}>
        <section className={`card ${styles.rule}`} aria-labelledby="rule-title">
          <h2 id="rule-title" className={`t-h3 ${styles.cardTitle}`}>How you are paid</h2>
          <p>
            While a coin trades on its curve, every trade pays the Platform Fee, and half of it is yours. After graduation the coin
            trades in its Raydium pool, where the platform collects the pool&apos;s creator fee, and half of what arrives is yours.
          </p>
          <p>
            It arrives in your wallet within about an hour of being collected, once it is worth{" "}
            {formatUnits(platform.creatorForward.minLamports, SOL_DECIMALS)} SOL, with nothing to claim. Every payment is on
            the <Link href="/revenue">public ledger</Link>, and every rate on the <Link href="/fees">Fees page</Link>.
          </p>
          {graduationFee && (
            <p>
              Once a coin graduates, the platform keeps {graduationFee}&apos;s worth of its Quote Asset out of your earnings on it, the
              Graduation Fee, from your next payments until it is paid; it never comes out of your wallet.
            </p>
          )}
        </section>

        <section className={`card ${styles.card}`} aria-labelledby="forwards-title">
          <h2 id="forwards-title" className={`t-h3 ${styles.cardTitle}`}>Sent by the platform</h2>
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
  );
}

/** One Quote Asset: what the Creator's coins earned in it, what has reached their wallet and what is still to come. */
function AssetCard({ asset }: { asset: CreatorEarningsAsset }) {
  const { quote } = asset;
  const symbol = quoteTicker(quote);
  const units = (raw: string) => formatUnits(raw, quote.decimals, quote.decimals);
  return (
    <section className={`card ${styles.asset}`} aria-labelledby={`earned-${quote.mint}`}>
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
        {asset.withheld !== "0" && (
          <div>
            <dt>Kept as Graduation Fees</dt>
            <dd><span className="mono">{units(asset.withheld)}</span> {symbol}</dd>
          </div>
        )}
      </dl>
    </section>
  );
}
