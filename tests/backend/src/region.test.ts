// The region gate (#131; owner, 2026-10-28): the API reads the visitor's country from Cloudflare and answers which
// features are withheld there, from a per-feature table the operator keeps in the platform settings. The table starts
// empty, so nothing is withheld anywhere until an engagement feature lands and a regulator objects somewhere (#146).
import { afterEach, describe, expect, it } from "vitest";
import { Region, RegionGatesView } from "@launchpad/contract";
import { env } from "./client";

const api = (path: string, init?: RequestInit) => fetch(`${env().apiUrl}${path}`, init);
const operator = () => ({ authorization: `Bearer ${env().operatorToken}`, "content-type": "application/json" });
// The test stack trusts this header for the visitor's country (COUNTRY_HEADER); in production Cloudflare's own reading is used.
const region = async (country?: string) =>
  Region.parse(await (await api("/v1/region", { headers: country ? { "x-test-country": country } : {} })).json());
const gates = async () => RegionGatesView.parse(await (await api("/v1/operator/region-gates", { headers: operator() })).json()).gates;
const put = (body: unknown) => api("/v1/operator/region-gates", { method: "PUT", headers: operator(), body: JSON.stringify(body) });

describe("the region gate", () => {
  // The table is shared by every test of the run: it goes back to empty, which is how a deploy starts.
  afterEach(async () => {
    expect((await put({ gates: {} })).status).toBe(200);
  });

  it("answers the visitor's country and withholds only what the operator gated there", async () => {
    expect(await gates()).toEqual({});
    expect(await region("GB")).toEqual({ country: "GB", withheld: [] });
    // A country is read as Cloudflare writes it, so a lowercase header still names the same place.
    expect((await region("ca")).country).toBe("CA");
    // Without a readable country nothing is withheld by name; the web shows nothing gated until it knows where it is.
    expect((await region()).withheld).toEqual([]);

    const saved = await put({ gates: { streaks: ["GB", "CA"], leaderboard: ["US"] } });
    expect(saved.status).toBe(200);
    expect(RegionGatesView.parse(await saved.json()).gates).toEqual({ streaks: ["GB", "CA"], leaderboard: ["US"] });
    expect(await gates()).toEqual({ streaks: ["GB", "CA"], leaderboard: ["US"] });
    expect(await region("GB")).toEqual({ country: "GB", withheld: ["streaks"] });
    expect(await region("CA")).toEqual({ country: "CA", withheld: ["streaks"] });
    expect(await region("US")).toEqual({ country: "US", withheld: ["leaderboard"] });
    expect(await region("DE")).toEqual({ country: "DE", withheld: [] });

    // The table is replaced whole: a feature left out of the next write is shown everywhere again.
    expect((await put({ gates: { leaderboard: ["US", "GB"] } })).status).toBe(200);
    expect(await region("GB")).toEqual({ country: "GB", withheld: ["leaderboard"] });
    expect(await region("CA")).toEqual({ country: "CA", withheld: [] });
  });

  it("refuses a malformed table and anyone without the operator token", async () => {
    expect((await put({ gates: { "Bad Name": ["GB"] } })).status).toBe(400);
    expect((await put({ gates: { streaks: ["gbr"] } })).status).toBe(400);
    expect((await put({ gates: ["streaks"] })).status).toBe(400);
    expect((await put({})).status).toBe(400);
    const anonymous = { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ gates: {} }) };
    expect((await api("/v1/operator/region-gates", anonymous)).status).toBe(401);
    expect((await api("/v1/operator/region-gates")).status).toBe(401);
    expect(await gates()).toEqual({});
  });
});
