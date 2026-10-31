import { z } from "zod";

/**
 * The region gate (#131; owner, 2026-10-28 and 2026-10-29: an engagement pattern is never refused on research grounds,
 * it is built, it works in every country, and it is removed from one country only when someone asks for that there).
 * The API reads the visitor's country from Cloudflare and
 * answers which features are withheld there, from a per-feature table the operator keeps; the web hides a withheld
 * feature. The table starts empty and is filled only on such a request, never ahead of one (ADR 0014).
 */

/** A country as Cloudflare reports it: ISO 3166-1 alpha-2, plus `T1` for Tor and `XX` when unknown. */
export const CountryCode = z.string().regex(/^[A-Z0-9]{2}$/, "must be a two-letter country code");
export type CountryCode = z.infer<typeof CountryCode>;

/** A feature's name as the web gates it: a lowercase slug the operator's table and the web agree on. */
export const FeatureName = z.string().regex(/^[a-z][a-z0-9-]{0,39}$/, "must be a lowercase slug");
export type FeatureName = z.infer<typeof FeatureName>;

/** The table: for each feature, the countries it is withheld in. A feature absent from it is shown everywhere. */
export const RegionGates = z.record(FeatureName, z.array(CountryCode));
export type RegionGates = z.infer<typeof RegionGates>;

export const RegionGatesView = z.object({ gates: RegionGates });
export type RegionGatesView = z.infer<typeof RegionGatesView>;

/** What one visitor's request tells the API, answered to that visitor alone. */
export const Region = z.object({
  /** The visitor's country as the edge read it; null when it could not be read, as on a local stack without the test header. */
  country: CountryCode.nullable(),
  /** The features withheld where the visitor is, in the table's order; empty when nothing is, or the country is unknown. */
  withheld: z.array(FeatureName),
});
export type Region = z.infer<typeof Region>;
