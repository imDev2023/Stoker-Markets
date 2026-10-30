import type { BurnEvent, BurnsPage, QuoteAsset, Revenue } from "@launchpad/contract";
import { sumInSol } from "./landing";

/** The window the annualized figure averages over, in calendar days. */
export const AVERAGE_DAYS = 90;
const DAY_MS = 86_400_000;
const LAMPORTS_PER_SOL = 1e9;

const utcDay = (iso: string) => iso.slice(0, 10);

/**
 * Revenue annualized (owner, 2026-10-30, after the shape of pump.fun's coin page): the daily average over the last 90
 * calendar days, or over the days since the first collection when it is younger than that, times 365, in SOL at the
 * registry's latest prices. The days are gross collections, before the Creators' half. Null before any collection.
 */
export function annualizedRevenue(revenue: Revenue, quotes: QuoteAsset[], now = new Date()) {
  if (revenue.days.length === 0) return null;
  const today = utcDay(now.toISOString());
  const windowStart = utcDay(new Date(now.getTime() - (AVERAGE_DAYS - 1) * DAY_MS).toISOString());
  const inWindow = revenue.days.filter((d) => d.day >= windowStart && d.day <= today);
  const oldest = revenue.days.reduce((a, d) => (d.day < a ? d.day : a), today);
  const since = oldest > windowStart ? oldest : windowStart;
  const days = Math.max(1, Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${since}T00:00:00Z`)) / DAY_MS) + 1);
  const sol = inWindow.reduce((sum, d) => sum + sumInSol(d.assets.map((a) => ({ asset: a.asset, amount: a.total })), quotes), 0);
  return { sol: (sol / days) * 365, days, since, perDay: sol / days };
}

/** SOL's price in US dollars from the registry, when it has one. */
export function solUsd(quotes: QuoteAsset[]) {
  const sol = quotes.find((q) => q.category === "sol");
  return sol?.price?.usd ? Number(sol.price.usd) : null;
}

export type DailyBurn = { day: string; lamports: bigint; amount: bigint; events: number };

/** The Platform Token's burns, by UTC day, oldest first: what the Burn spent and destroyed each day. */
export function dailyBurns(events: BurnEvent[]): DailyBurn[] {
  const days = new Map<string, DailyBurn>();
  for (const e of events) {
    if (e.kind !== "burn") continue;
    const day = utcDay(e.time);
    const d = days.get(day) ?? { day, lamports: 0n, amount: 0n, events: 0 };
    d.lamports += BigInt(e.lamports);
    d.amount += BigInt(e.amount);
    d.events += 1;
    days.set(day, d);
  }
  return [...days.values()].sort((a, b) => a.day.localeCompare(b.day));
}

/** The Platform Token's burns, oldest first, each with the SOL spent on every burn up to and including it, in SOL. */
export function cumulativeBurns(events: BurnEvent[]) {
  let total = 0;
  return events
    .filter((e) => e.kind === "burn")
    .sort((a, b) => a.time.localeCompare(b.time) || a.slot - b.slot)
    .map((e) => {
      total += Number(e.lamports) / LAMPORTS_PER_SOL;
      return { time: e.time, sol: total };
    });
}

/** Everything the Burn has done with the Platform Token: coins destroyed and SOL spent, from the burns page's events. */
export function platformTokenBurns(burns: BurnsPage) {
  const events = burns.events.filter((e) => e.kind === "burn");
  const coin = burns.burned.find((b) => b.coin.mint === burns.platformToken)?.coin ?? events[0]?.coin ?? null;
  return {
    coin,
    events,
    amount: events.reduce((sum, e) => sum + BigInt(e.amount), 0n),
    lamports: events.reduce((sum, e) => sum + BigInt(e.lamports), 0n),
  };
}

/** A day's revenue in SOL, for a burn's share of it; null when the day collected nothing on record. */
export function dayRevenueSol(revenue: Revenue, quotes: QuoteAsset[], iso: string) {
  const day = revenue.days.find((d) => d.day === utcDay(iso));
  return day ? sumInSol(day.assets.map((a) => ({ asset: a.asset, amount: a.total })), quotes) : null;
}
