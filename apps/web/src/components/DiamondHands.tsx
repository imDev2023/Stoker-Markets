"use client";

import Link from "next/link";
import { useWallet } from "@solana/wallet-adapter-react";
import { useEffect, useId, useState } from "react";
import type { WalletHolding } from "@launchpad/contract";
import { getWalletHolding } from "@/lib/api";
import { COIN_DECIMALS, formatUnits, formatUtc, formatUtcDay } from "@/lib/format";
import { DIAMOND_HANDS_HREF, lotsByWeight, weightMultiple } from "@/lib/holding";
import { ErrorState } from "./EmptyState";
import { RelativeTime } from "./RelativeTime";
import { Skeleton } from "./Skeleton";
import styles from "./DiamondHands.module.css";

type Loaded = { wallet: string; holding: WalletHolding; at: number };

/**
 * The connected wallet's own Diamond Hands on a coin's rewards card (the Holding Weight, ADR 0022), from
 * `GET /v1/launches/:mint/holdings/:wallet`: what its coins count for in a round as one figure, its coins gathered by
 * the weight they have now with the day the oldest of each were first seen, and when balances were last looked at.
 * A wallet no Holding Check has seen coins in yet is told when it will be; the treasury, that its coins always count
 * once. Every figure is the API's: nothing here works a weight out from a step.
 *
 * The card renders this only while the rules in force have steps, and it draws nothing without a wallet, so a coin's
 * page reads as it always has for anyone not connected. It takes data alone (the coin's address and ticker), never a
 * server-rendered tree. The four states are decided here: a skeleton while the first read is out, the error with a way
 * to try again, the lots, and the plain line where there are none.
 */
export function DiamondHands({ mint, symbol }: { mint: string; symbol: string }) {
  const { publicKey } = useWallet();
  const wallet = publicKey?.toBase58() ?? null;
  // A coin can carry two rewards cards (a Reward Launch whose Creator's earnings go to its holders too), each with this block.
  const titleId = useId();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!wallet) return;
    let gone = false;
    void (async () => {
      try {
        const holding = await getWalletHolding(mint, wallet);
        if (gone) return;
        if (!holding) return setFailed(wallet);
        setLoaded({ wallet, holding, at: Date.now() });
        setFailed(null);
      } catch {
        if (!gone) setFailed(wallet);
      }
    })();
    return () => {
      gone = true;
    };
  }, [mint, wallet, attempt]);

  if (!wallet) return null;
  // What was read for another wallet, or before this one disconnected, is not this wallet's.
  const own = loaded?.wallet === wallet ? loaded : null;
  const state = own ? (own.holding.flat ? "flat" : own.holding.lots.length > 0 ? "lots" : "none") : failed === wallet ? "error" : "loading";

  return (
    <section className={styles.hands} aria-labelledby={titleId} data-hands={state}>
      <h3 id={titleId} className={`t-ui ${styles.title}`}>Your Diamond Hands</h3>
      {own ? (
        <Hands holding={own.holding} now={own.at} symbol={symbol} />
      ) : failed === wallet ? (
        <ErrorState bare title="Your Diamond Hands could not be read" onRetry={() => { setFailed(null); setAttempt((n) => n + 1); }}>
          The API did not answer. Nothing is lost: how long you have kept your coins is recorded whether or not this page can read it.
        </ErrorState>
      ) : (
        <div aria-busy="true">
          <span className="visually-hidden">Reading your Diamond Hands…</span>
          <Skeleton lines={2} height={36} />
        </div>
      )}
    </section>
  );
}

const how = <Link href={DIAMOND_HANDS_HREF}>How Diamond Hands works</Link>;

function Hands({ holding, now, symbol }: { holding: WalletHolding; now: number; symbol: string }) {
  const coins = (raw: string | bigint) => formatUnits(raw.toString(), COIN_DECIMALS, 0);
  if (holding.flat)
    return (
      <p className={styles.note} data-hands-line>
        This wallet is the platform&apos;s treasury. Its coins always count once in a round, however long it keeps them. {how}
      </p>
    );
  if (holding.lots.length === 0)
    return (
      <p className={styles.note} data-hands-line>
        No coins have been seen in this wallet yet. Balances are looked at once a day: the {symbol} you hold now will be seen at the next
        daily check, and each coin counts once until you have kept it past a step. {how}
      </p>
    );
  const groups = lotsByWeight(holding.lots);
  return (
    <>
      <dl className={styles.facts}>
        <div>
          <dt>Your coins count</dt>
          <dd data-hands-weight>{weightMultiple(holding.weightBps)}</dd>
        </div>
        <div>
          <dt>Coins seen in your wallet</dt>
          <dd><span className="mono">{coins(holding.held)}</span> {symbol}</dd>
        </div>
        {holding.check && (
          <div data-hands-check>
            <dt>Balances last looked at</dt>
            <dd><RelativeTime iso={holding.check.checkedAt} now={now} /></dd>
          </div>
        )}
      </dl>
      <ul className={styles.rows} aria-label="Your coins by what they count for">
        {groups.map((g) => (
          <li key={g.weightBps}>
            <span>
              <span className="mono">{coins(g.amount)}</span> {symbol}{g.lots > 1 ? ", the oldest first seen " : " first seen "}
              <time dateTime={g.since} title={formatUtc(g.since)}>{formatUtcDay(g.since.slice(0, 10))}</time>
            </span>
            <span className={styles.weight}>each counts {weightMultiple(g.weightBps)}</span>
          </li>
        ))}
      </ul>
      <p className={styles.note}>
        This is how a round opened now would count these coins. A sell takes your newest coins first, and coins bought since the last
        daily check count once until the next one sees them. {how}
      </p>
    </>
  );
}
