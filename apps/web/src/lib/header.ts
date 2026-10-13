/**
 * The header candidates of #37 (owner, 2026-10-11): the built bar reads as the genre's, and StonkFun's, so four
 * arrangements are built on the real site and picked by elimination, like the layout. The layout's candidates were a
 * page's own `?layout=`; the header is in the root layout, which has no search params, so the choice is a cookie:
 * `?header=<kind>` on any page sets it (components/HeaderSwitch.tsx) and it holds through every page after, `?header=bar`
 * puts the built one back. Unlisted, for the owner's eye; the pick becomes the one header and the rest go.
 */
export const HEADERS = ["bar", "rail", "command", "tiers", "pill"] as const;
export type HeaderKind = (typeof HEADERS)[number];

export const DEFAULT_HEADER: HeaderKind = "bar";
export const HEADER_COOKIE = "header";

export function headerFrom(value: string | undefined): HeaderKind {
  return (HEADERS as readonly string[]).includes(value ?? "") ? (value as HeaderKind) : DEFAULT_HEADER;
}
