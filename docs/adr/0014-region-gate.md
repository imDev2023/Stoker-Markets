# The region gate: an engagement feature is built where it works and withheld where a regulator objects, never refused

Status: accepted by the owner on 2026-10-28 (#130, the decisions after the design research); the mechanism built in #131, phase 1b, on 2026-10-29.

The design research of 2026-10-28 surveyed the engagement patterns of the launchpads and the trading terminals (streaks, leaderboards, notifications, social proof, the rest of #138 to #149) and the regulators that object to some of them in some places.
The owner's rule: a pattern is never refused on research grounds.
If it works it is built, and it is withheld in the regions whose regulators object.
That needs one mechanism every feature can use, built before any feature exists, so a later feature is a name in a table and never a deploy per region.

## Decision

- The API reads the visitor's country from Cloudflare's own reading of the request (`request.cf.country`, or the `cf-ipcountry` header the edge adds) and answers `GET /v1/region`: the country and the features withheld there.
  The answer is one visitor's own and is sent with `cache-control: private, no-store`, so no shared cache ever serves one visitor another's region.
- The table is one platform setting, `region_gates`: for each feature, named by a lowercase slug the web and the operator agree on, the countries it is withheld in, as the two-letter codes Cloudflare writes (`T1` for Tor and `XX` for unknown among them).
  The operator reads it and replaces it whole through `GET` and `PUT /v1/operator/region-gates`, from the operator view's "Region gates" section.
  It starts empty and stays so until an engagement feature lands and a regulator objects somewhere (#146).
- The web asks the gate from the browser (`RegionProvider`), never from a server render, which would carry the web Worker's own address rather than the visitor's.
  `Gated` renders a feature only once the answer says it is allowed: nothing while the region is unknown, the fallback where it is withheld.
  A withheld feature is therefore never shown by accident, and the page renders the same on the server and on the first paint.
- A country the edge could not read (null, which happens on a local stack and never at the edge, where an unknown place is `XX`) withholds nothing by name.
- The test stack names a request header the API trusts for the country (`COUNTRY_HEADER`, `x-test-country`), so a test visits from any country; the setting is refused on mainnet, where only Cloudflare's reading counts.

## Consequences

- Every engagement feature names itself to `Gated` and is withheld by editing the table, never by code, and the backend suite proves the table's round trip and the gate's answer per country (`tests/backend/src/region.test.ts`).
- The disclaimer's excluded regions (the United States, the United Kingdom, Canada and sanctioned countries, the owner's confirmed list) are a notice, not a gate: the site stays open everywhere, and the table decides feature by feature.
- The web never caches the region across visitors: it is asked once per page load, in the browser.
