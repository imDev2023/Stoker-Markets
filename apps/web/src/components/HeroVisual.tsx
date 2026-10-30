"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { LaunchSummary, PlatformInfo, QuoteAsset } from "@launchpad/contract";
import { listLaunches } from "@/lib/api";
import type { HeroVariant } from "@/lib/landing";
import { quoteKind } from "@/lib/landing";
import { quoteTicker } from "@/lib/format";
import { CoinImage } from "./CoinImage";
import { Change } from "./Change";
import { HeroPicker } from "./HeroPicker";
import { HeroTrade } from "./HeroTrade";
import { Ring } from "./Mark";
import { PairMark } from "./PairMark";
import { Price } from "./Price";
import { QuoteLogo } from "./QuoteLogo";
import { Stoke } from "./Stoke";
import { SwapWidget } from "./SwapWidget";
import styles from "./HeroVisual.module.css";

const REFRESH_MS = 4_000;
/** How long each asset holds in the cycle. */
const STEP_MS = 2_400;
/** The brand's own coin, the first launched here: the base the cycle pairs with each asset. */
const CYCLE_BASE = "STOKER";
/** The ring's one size here: the brand at size, as on the share cards (160 to 240px, principles section 10). */
const RING = 240;

/** How far a curve is toward its Graduation Target, as a whole percentage; a sold-out curve is done. */
function progressOf(launch: LaunchSummary) {
  if (launch.curve.status !== "live") return 100;
  const target = BigInt(launch.graduationTarget);
  return target === 0n ? 0 : Math.min(100, Number((BigInt(launch.curve.raised) * 1000n) / target) / 10);
}

/**
 * The board's top rows, live (#133, candidate A): the coins that trade most, frameless, refreshed every few seconds
 * like the board itself. With nothing launched yet the cycle stands here, so the hero never shows an empty table.
 */
function Rows({ initial, quotes }: { initial: LaunchSummary[]; quotes: QuoteAsset[] }) {
  const [launches, setLaunches] = useState(initial);
  useEffect(() => {
    const id = setInterval(async () => {
      try {
        const { launches: next } = await listLaunches({ sort: "trending", limit: 5 });
        setLaunches(next);
      } catch {
        // keep showing the last good rows; the next tick retries
      }
    }, REFRESH_MS);
    return () => clearInterval(id);
  }, []);
  if (launches.length === 0) return <Cycle quotes={quotes} />;
  return (
    <div className={styles.rows}>
      <ul className={styles.list} aria-label="Most traded today">
        {launches.map((l) => {
          const quote = quoteTicker(l.quote);
          const pct = progressOf(l);
          return (
            <li key={l.mint}>
              <Link href={`/coin/${l.mint}`} className={styles.row}>
                <CoinImage src={l.image} symbol={l.symbol} size={36} className={styles.image} />
                <span className={styles.titles}>
                  <span className={styles.pairBox}><PairMark base={l.symbol} quote={quote} size="sm" /></span>
                  <span className={styles.name}>{l.name}</span>
                </span>
                <span className={styles.figures}>
                  <span className={`t-figure ${styles.price}`}>{l.market.price === null ? "-" : <><Price value={l.market.price} /> {quote}</>}</span>
                  <Change value={l.market.change24h} />
                </span>
                <span className={styles.curve} aria-label={l.curve.status === "live" ? `${pct}% of the way to graduation` : "Graduated"}>
                  <span className={styles.track} aria-hidden>
                    <span className={styles.fill} style={{ width: `${pct}%` }} />
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
      <Link href="/coins" className={`t-caption ${styles.more}`}>Every coin on the board <span aria-hidden>→</span></Link>
    </div>
  );
}

/**
 * The pair mark cycling through the assets a coin is priced in (#133, candidate B): the brand's coin paired with SOL, a
 * stablecoin and two stocks in turn, each with its logo and kind. Still under `prefers-reduced-motion`, and still in the
 * UI suite, which asks for that; the first asset is then the one shown.
 */
function Cycle({ quotes, under = false }: { quotes: QuoteAsset[]; under?: boolean }) {
  const [step, setStep] = useState(0);
  useEffect(() => {
    if (quotes.length < 2 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = setInterval(() => setStep((s) => (s + 1) % quotes.length), STEP_MS);
    return () => clearInterval(id);
  }, [quotes.length]);
  const quote = quotes[step] ?? quotes[0];
  if (!quote) return <RingAtSize />;
  return (
    <div className={`${styles.cycle} ${under ? styles.cycleUnder : ""}`} aria-live="off">
      <span className={styles.cyclePair} key={quote.mint}>
        <PairMark base={CYCLE_BASE} quote={quoteTicker(quote)} size="fit" />
      </span>
      <span className={styles.cycleAsset}>
        <QuoteLogo quote={quote} size={28} />
        <span className={styles.cycleTicker}>{quoteTicker(quote)}</span>
        <span className={styles.cycleKind}>{quoteKind(quote)}</span>
      </span>
    </div>
  );
}

/** The heating ring at size (#133, candidate C): the brand's mark as the hero's whole visual. */
function RingAtSize() {
  return (
    <div className={styles.ringBox}>
      <Ring size={RING} className={styles.ring} />
    </div>
  );
}

/**
 * The stoke (#133, candidate D): the ring at size heating from coal through the ramp with its bloom and a few embers,
 * a slow loop (`Stoke`); still at full heat under reduced motion. D2 puts the pair cycle under it, so the brand's
 * moment and the mechanism share the one visual.
 */
function StokeAtSize({ quotes }: { quotes?: QuoteAsset[] }) {
  return (
    <div className={`${styles.ringBox} ${quotes ? styles.stokeCycle : ""}`}>
      <Stoke size={RING} className={styles.ring} />
      {quotes && <Cycle quotes={quotes} under />}
    </div>
  );
}

/** The hero's visual, one of the candidates (src/lib/landing.ts). */
export function HeroVisual({
  variant, launches, quotes, cycle, platform,
}: {
  variant: HeroVariant;
  launches: LaunchSummary[];
  /** Every asset a coin can be paired with on this chain, for the picker. */
  quotes: QuoteAsset[];
  /** The few the pair cycle turns through. */
  cycle: QuoteAsset[];
  platform: PlatformInfo;
}) {
  if (variant === "ring") return <RingAtSize />;
  if (variant === "stoke") return <StokeAtSize />;
  if (variant === "stoke-cycle") return <StokeAtSize quotes={cycle} />;
  if (variant === "cycle") return <Cycle quotes={cycle} />;
  if (variant === "picker") return <HeroPicker quotes={quotes} />;
  // The trade panel wants a coin; until the first launch the cycle stands here, as it does for the rows.
  if (variant === "trade") return launches[0] ? <HeroTrade initial={launches[0]} platform={platform} /> : <Cycle quotes={cycle} />;
  // The owner's pick (2026-10-30), with their second choice, the rows, standing in wherever the Plugin can't load.
  if (variant === "swap") return <SwapWidget fallback={<Rows initial={launches} quotes={cycle} />} />;
  return <Rows initial={launches} quotes={cycle} />;
}
