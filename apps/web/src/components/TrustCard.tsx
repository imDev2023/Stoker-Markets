import type { HolderList, LaunchTrust } from "@launchpad/contract";
import { formatShare as percent } from "@/lib/format";
import styles from "./TrustCard.module.css";

/*
 * The trust figures a buyer checks before buying (#41, ADR 0013): the Creator's holding and record, Bundle Radar's
 * snipers, and how much the largest wallets hold. Every figure is from the indexed trades or the chain, and a label
 * informs; none stops a trade.
 */

type Tone = "ok" | "caution" | "down" | "none";

/** About how long a run of slots takes, at Solana's 400 ms a slot. */
function slotsTime(slots: number) {
  const seconds = slots * 0.4;
  if (seconds < 90) return `${Math.max(1, Math.round(seconds))} second${Math.round(seconds) === 1 ? "s" : ""}`;
  if (seconds < 5400) return `${Math.round(seconds / 60)} minutes`;
  return `${Math.round(seconds / 3600)} hours`;
}

const count = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;

/** The largest wallets' share, the curve's and the pool's holdings aside: those are the coins nobody has bought yet, or the pool trades against. */
function topHoldersShare(holders: HolderList, n: number) {
  return holders.holders.filter((h) => h.kind !== "curve" && h.kind !== "pool").slice(0, n).reduce((sum, h) => sum + h.share, 0);
}

export function TrustCard({ trust, holders }: {
  /** Null when the API couldn't answer at render; the card says so and the next refresh retries. */
  trust: LaunchTrust | null;
  /** Null when the chain couldn't be read at render. */
  holders: HolderList | null;
}) {
  const rows: { term: string; tone: Tone; text: string; detail?: string }[] = [];

  // The Creator: what they hold now (the chain), their First Buy at launch and their record here (the indexed trades and launches).
  if (holders === null) rows.push({ term: "Creator", tone: "none", text: "Holding not read from the chain yet." });
  else if (holders.creator.status === "holding") rows.push({ term: "Creator", tone: "ok", text: `Holds ${percent(holders.creator.share)} of the supply.` });
  else if (holders.creator.status === "sold") rows.push({ term: "Creator", tone: "down", text: "Sold all their coins." });
  else rows.push({ term: "Creator", tone: "none", text: "Holds none, and never bought any." });
  const creatorRow = rows[0];
  if (trust && creatorRow) {
    const record = trust.creator.launches === 1 ? "Their first coin here." : `${count(trust.creator.launches, "coin")} here, ${trust.creator.graduated} graduated.`;
    creatorRow.detail = `${trust.creator.firstBuy ? `First Buy at launch: ${percent(trust.creator.firstBuy.share)}.` : "No First Buy at launch."} ${record}`;
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
        text: `${count(s.wallets.length, "wallet")} bought ${percent(s.boughtShare)} in ${window} and hold ${percent(s.heldShare)} now, by their trades here.`,
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

  return (
    <section className={`card ${styles.card}`} aria-labelledby="trust-title">
      <h2 id="trust-title" className={`t-h3 ${styles.title}`}>Before you buy</h2>
      <dl className={styles.rows}>
        {rows.map((r) => (
          <div key={r.term} className={styles.row}>
            <dt><span className={`${styles.dot} ${styles[r.tone]}`} aria-hidden /> {r.term}</dt>
            <dd>
              {r.text}
              {r.detail && <span className={styles.detail}>{r.detail}</span>}
            </dd>
          </div>
        ))}
      </dl>
      <p className={styles.note}>From the indexed trades and the chain, so anyone can check them. A label informs; none stops a trade.</p>
    </section>
  );
}
