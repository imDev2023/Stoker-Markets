import { formatUnits, formatUtc, formatUtcDay, SOL_DECIMALS } from "./format";

/**
 * Volume rebates (ADR 0021) as the site writes them. The Rewards page says what a Volume Rebate is in words and shows
 * amounts of SOL; the share behind it, like every fee figure, is the Fees page's alone (owner, 2026-10-30).
 */

/** A UTC week in seconds: what a Rebate Week is everywhere but on a test stack, which shortens it to see one end. */
const UTC_WEEK_SECONDS = 7 * 86_400;

/** Whether a Rebate Week of this length is the UTC week, Monday 00:00 to the next Monday. */
export const isUtcWeek = (weekSeconds: number) => weekSeconds === UTC_WEEK_SECONDS;

/** An amount of the program's (a week's fees, its pot, a total) in SOL: six decimals, so a small week's pot still reads. */
export const rebateSol = (lamports: string) => formatUnits(lamports, SOL_DECIMALS, 6);

/** A wallet's own rebate to the lamport: what it is owed or was paid can be checked against the payment's transaction. */
export const rebateSolExact = (lamports: string) => formatUnits(lamports, SOL_DECIMALS, SOL_DECIMALS);

/** A Rebate Week by its first day, "Nov 9, 2026"; a test stack's shorter week starts mid-day and is named to the minute. */
export function weekName(start: string) {
  return start.endsWith("T00:00:00.000Z") ? formatUtcDay(start.slice(0, 10)) : formatUtc(start);
}

/** A Rebate Week's exact bounds, which a week's name carries on hover. */
export const weekSpan = (start: string, end: string) => `${formatUtc(start)} to ${formatUtc(end)}`;
