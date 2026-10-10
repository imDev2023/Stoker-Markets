/**
 * The layout candidates of docs/design/layout.md, shown on the real pages through `?layout=<id>` until the owner picks
 * one; the built page stays the default. The pick removes this file and the losers' code.
 */
export const BOARD_LAYOUTS = ["b1", "b2", "b3"] as const;
export const COIN_LAYOUTS = ["c1", "c2", "c3"] as const;
export const LAUNCH_LAYOUTS = ["l1", "l2"] as const;

export type BoardLayout = (typeof BOARD_LAYOUTS)[number];
export type CoinLayout = (typeof COIN_LAYOUTS)[number];
export type LaunchLayout = (typeof LAUNCH_LAYOUTS)[number];

/** The candidate named in the page's query, when it is one of the page's. */
export function layoutFrom<T extends string>(params: Record<string, string | string[] | undefined>, allowed: readonly T[]): T | null {
  const value = params.layout;
  return typeof value === "string" && (allowed as readonly string[]).includes(value) ? (value as T) : null;
}
