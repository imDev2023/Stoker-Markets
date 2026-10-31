"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { LaunchSummary, PlatformInfo } from "@launchpad/contract";
import { getLaunch } from "@/lib/api";
import { quoteTicker } from "@/lib/format";
import { Change } from "./Change";
import { CoinImage } from "./CoinImage";
import { PairMark } from "./PairMark";
import { Price } from "./Price";
import { TradePanel } from "./TradePanel";
import styles from "./HeroTrade.module.css";

const REFRESH_MS = 4_000;

/**
 * The most traded coin's real trade panel in the hero (#133, candidate G, owner 2026-10-30): the coin page's own panel
 * (`TradePanel`, our server-built transactions, the wallet connect inside it) under a head that names the coin with its
 * image, pair, price and the day's change, refreshed like the page itself. A visitor trades a Stoker coin on the first
 * screen; the coin's page, one tap away, has the chart, the trades and the holders.
 */
export function HeroTrade({ initial, platform }: { initial: LaunchSummary; platform: PlatformInfo }) {
  const [launch, setLaunch] = useState(initial);
  const refresh = useCallback(async () => {
    try {
      const l = await getLaunch(initial.mint);
      if (l) setLaunch(l);
    } catch {
      // keep showing the last good coin; the next tick retries
    }
  }, [initial.mint]);
  useEffect(() => {
    const id = setInterval(refresh, REFRESH_MS);
    return () => clearInterval(id);
  }, [refresh]);
  const quote = quoteTicker(launch.quote);
  return (
    <div className={styles.trade}>
      <Link href={`/coin/${launch.mint}`} className={styles.head}>
        <CoinImage src={launch.image} symbol={launch.symbol} size={44} className={styles.image} />
        <span className={styles.titles}>
          <span className={styles.pairBox}><PairMark base={launch.symbol} quote={quote} size="md" /></span>
          <span className={styles.name}>{launch.name}</span>
        </span>
        <span className={styles.figures}>
          <span className={`t-figure ${styles.price}`}>{launch.market.price === null ? "-" : <><Price value={launch.market.price} /> {quote}</>}</span>
          <Change value={launch.market.change24h} />
        </span>
      </Link>
      <TradePanel launch={launch} platform={platform} onTraded={() => void refresh()} />
      <p className={styles.note}>
        The most traded coin today. <Link href={`/coin/${launch.mint}`}>Its page</Link> has the chart, the trades and the holders.
      </p>
    </div>
  );
}
