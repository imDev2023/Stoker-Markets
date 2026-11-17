import type { ReactNode } from "react";
import type { CreatorLockStatus, CreatorLockTerms, HolderList, LaunchTrust } from "@launchpad/contract";
import { firstBuyShare } from "@/lib/coinTax";
import { lockedShareBps, lockSentence, lockShare, lockStage } from "@/lib/creatorLock";
import { formatShare as percent, formatUtc } from "@/lib/format";
import styles from "./TrustCard.module.css";

/*
 * The trust figures a buyer checks before buying (#41, ADR 0013): the Creator's holding and record, Bundle Radar's
 * snipers, and how much the largest wallets hold. Every figure is from the indexed trades or the chain, and a label
 * informs; none stops a trade. Since phase 3 of the rework (#134) the three figures stand in the coin page's title row
 * as marks (`TrustMarks`), and the card opens from them. A coin with a Creator Lock (ADR 0023, #211) has a fourth: how
 * much of the supply is locked for its Creator and until when, read from the chain.
 */

type Tone = "ok" | "caution" | "down" | "none";

/** About how long a run of slots takes, at Solana's 400 ms a slot. */
function slotsTime(slots: number) {
  const seconds = slots * 0.4;
  if (seconds < 90) return count(Math.max(1, Math.round(seconds)), "second");
  if (seconds < 5400) return count(Math.round(seconds / 60), "minute");
  return count(Math.round(seconds / 3600), "hour");
}

const count = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;

/**
 * The largest wallets' share, the curve's, the pool's and the Creator Lock's holdings aside: those are the coins nobody has
 * bought yet, the pool trades against, or LaunchLab still holds for the Creator.
 */
function topHoldersShare(holders: HolderList, n: number) {
  return holders.holders.filter((h) => h.kind !== "curve" && h.kind !== "pool" && h.kind !== "lock").slice(0, n).reduce((sum, h) => sum + h.share, 0);
}

/** A coin's Creator Lock for the marks: its terms from the coin, and its state from the chain once read (null until then). */
export type LockFigures = { terms: CreatorLockTerms; status: CreatorLockStatus | null };

type Figures = { trust: LaunchTrust | null; holders: HolderList | null; lock?: LockFigures | null };

const when = (iso: string) => <time dateTime={iso}>{formatUtc(iso)}</time>;

/**
 * The Creator Lock's mark and its row in the card, in words that hold at each stage: before the curve sells out (the
 * clock has not started), during the cliff, while it unlocks, and once all of it has unlocked.
 */
function lockFigure({ terms, status }: LockFigures): { tone: Tone; short: string; text: ReactNode; detail?: ReactNode } {
  const size = lockShare(terms.bps);
  if (status === null) return { tone: "none", short: `${size} locked`, text: `${size} of the supply is locked for the Creator.`, detail: "Its schedule is not read from the chain yet." };
  const stage = lockStage(status);
  if (stage === "selling")
    return { tone: "ok", short: `${size} locked`, text: lockSentence(terms), detail: "The clock starts when the curve sells out, so nothing unlocks while it sells." };
  if (stage === "cliff")
    return {
      tone: "ok",
      short: `${size} locked`,
      text: <>{size} of the supply is locked for the Creator until {when(status.unlockStartsAt!)}.</>,
      detail: terms.unlockSeconds === 0 ? "Then all of it unlocks at once." : <>Then it unlocks evenly until {when(status.unlockEndsAt!)}.</>,
    };
  if (stage === "unlocking") {
    // Rounded down, so the mark never says more is locked than is: 9.99% a moment after a 10% lock starts to unlock.
    const left = lockShare(Math.floor(lockedShareBps(status)));
    return {
      tone: "caution",
      short: `${left} locked`,
      text: <>{left} of the supply is still locked for the Creator, unlocking evenly until {when(status.unlockEndsAt!)}.</>,
      detail: `The Creator's ${size} started to unlock after Graduation; what has unlocked they may claim and sell.`,
    };
  }
  return { tone: "none", short: "Lock ended", text: <>The Creator&apos;s {size} has all unlocked, since {when(status.unlockEndsAt!)}.</> };
}

/** A share in a mark's few characters: a plain "0%" for nothing, the site's share format otherwise. */
const short = (share: number) => (share === 0 ? "0%" : percent(share));

/** The three marks, each with its tone and the few words that fit a title row. */
export function trustMarks({ trust, holders, lock = null }: Figures): { term: string; tone: Tone; short: string }[] {
  const creator = holders === null
    ? { tone: "none" as const, short: "Creator" }
    : holders.creator.status === "holding"
      ? { tone: "ok" as const, short: `Creator ${short(holders.creator.share)}` }
      : holders.creator.status === "sold"
        ? { tone: "down" as const, short: "Creator sold" }
        : { tone: "none" as const, short: "Creator 0%" };
  const snipers = trust === null
    ? { tone: "none" as const, short: "Snipers" }
    : trust.snipers.wallets.length === 0
      ? { tone: "ok" as const, short: "No snipers" }
      : { tone: "caution" as const, short: count(trust.snipers.wallets.length, "sniper") };
  const top = holders === null
    ? { tone: "none" as const, short: "Top 10" }
    : { tone: topHoldersShare(holders, 10) > 0.5 ? ("caution" as const) : ("ok" as const), short: `Top 10 ${short(topHoldersShare(holders, 10))}` };
  const marks = [{ term: "Creator", ...creator }, { term: "Snipers", ...snipers }, { term: "Top 10 wallets", ...top }];
  if (lock) {
    const { tone, short } = lockFigure(lock);
    marks.push({ term: "Creator Lock", tone, short });
  }
  return marks;
}

/**
 * The marks as the title row shows them: a dot in the figure's tone and its few words. `children` (the control's chevron)
 * rides inside the last mark, so where the row wraps (four marks on a phone) it wraps with that mark, never alone.
 */
export function TrustMarks({ trust, holders, lock = null, children }: Figures & { children?: ReactNode }) {
  const marks = trustMarks({ trust, holders, lock });
  return (
    <>
      {marks.map((m, i) => (
        <span key={m.term} className={styles.mark}>
          <span className={`${styles.dot} ${styles[m.tone]}`} aria-hidden />
          {m.short}
          {i === marks.length - 1 && children}
        </span>
      ))}
    </>
  );
}

export function TrustCard({ trust, holders, lock = null, taxBps = 0, className = "" }: Figures & {
  /** The tax the coin withholds on a transfer, in basis points, so the First Buy is the share that reached the Creator's wallet (#221). */
  taxBps?: number;
  className?: string;
}) {
  const rows: { term: string; tone: Tone; text: ReactNode; detail?: ReactNode }[] = [];

  // The Creator: what they hold now (the chain), their First Buy at launch and their record here (the indexed trades and launches).
  if (holders === null) rows.push({ term: "Creator", tone: "none", text: "Holding not read from the chain yet." });
  else if (holders.creator.status === "holding") rows.push({ term: "Creator", tone: "ok", text: `Holds ${percent(holders.creator.share)} of the supply.` });
  else if (holders.creator.status === "sold") rows.push({ term: "Creator", tone: "down", text: "Sold all their coins." });
  else rows.push({ term: "Creator", tone: "none", text: "Holds none, and never bought any." });
  const creatorRow = rows[0];
  if (trust && creatorRow) {
    const record = trust.creator.launches === 1 ? "Their first coin here." : `${count(trust.creator.launches, "coin")} here, ${trust.creator.graduated} graduated.`;
    const firstBuy = firstBuyShare(trust, taxBps);
    creatorRow.detail = `${firstBuy ? `First Buy at launch: ${firstBuy}.` : "No First Buy at launch."} ${record}`;
  }

  // Bundle Radar: whoever bought in the first slots, and what they still hold by their trades here.
  if (trust === null) rows.push({ term: "Snipers", tone: "none", text: "Not checked yet." });
  else {
    const s = trust.snipers;
    const window = `the launch's first ${count(s.windowSlots, "slot")} (about ${slotsTime(s.windowSlots)})`;
    if (s.wallets.length === 0) rows.push({ term: "Snipers", tone: "ok", text: "None.", detail: `Nobody but the Creator bought in ${window}.` });
    else {
      const bundle = [
        s.sameAmount > 0 ? `${s.sameAmount} paid the same amount, as one bundle's wallets do.` : null,
        s.inLaunchSlot > 0 ? `${count(s.inLaunchSlot, "landed in the launch's own slot", "landed in the launch's own slot")}.` : null,
      ].filter(Boolean).join(" ");
      rows.push({
        term: "Snipers",
        tone: "caution",
        text: `${count(s.wallets.length, "wallet")} bought ${percent(s.boughtShare)} in ${window} and ${s.wallets.length === 1 ? "holds" : "hold"} ${percent(s.heldShare)} now, by ${s.wallets.length === 1 ? "its" : "their"} trades here.`,
        ...(bundle ? { detail: bundle } : {}),
      });
    }
  }

  // Concentration: the ten largest wallets, read from the chain.
  if (holders === null) rows.push({ term: "Top 10 wallets", tone: "none", text: "Not read from the chain yet." });
  else {
    const share = topHoldersShare(holders, 10);
    rows.push({ term: "Top 10 wallets", tone: share > 0.5 ? "caution" : "ok", text: `Hold ${percent(share)} of the supply.`, detail: "The curve's and the pool's coins aside." });
  }

  // The Creator Lock: what LaunchLab holds for the Creator, and its schedule by the chain's clock.
  if (lock) rows.push({ term: "Creator Lock", ...lockFigure(lock) });

  return (
    <section className={`card card-overlay ${styles.card} ${className}`} aria-labelledby="trust-title">
      <h2 id="trust-title" className={`t-h3 ${styles.title}`}>Before you buy</h2>
      <dl className={styles.rows}>
        {rows.map((r) => (
          <div key={r.term} className={styles.row}>
            <dt><span className={`${styles.dot} ${styles[r.tone]}`} aria-hidden /> {r.term}</dt>
            <dd>
              <span>{r.text}</span>
              {r.detail && <span className={styles.detail}>{r.detail}</span>}
            </dd>
          </div>
        ))}
      </dl>
      <p className={styles.note}>From the indexed trades and the chain, so anyone can check them. A label informs; none stops a trade.</p>
    </section>
  );
}
