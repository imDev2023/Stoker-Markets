// The region gate (#131; owner, 2026-10-28): which features are withheld in which countries, as one platform setting
// the operator edits, and the visitor's country as Cloudflare read it. The table starts empty and is filled only when
// someone asks for a feature's removal in their country, never ahead of a request (owner, 2026-10-29; ADR 0014).
import { eq } from "drizzle-orm";
import { RegionGates, type Region } from "@launchpad/contract";
import { platformSettings, type Db } from "@launchpad/db";
import type { Config } from "./env";

const REGION_GATES_SETTING = "region_gates";

/** The table as stored; a value that no longer parses (an older shape, a hand edit) counts as empty rather than failing every page. */
export async function regionGates(db: Db): Promise<RegionGates> {
  const [row] = await db.select().from(platformSettings).where(eq(platformSettings.key, REGION_GATES_SETTING)).limit(1);
  if (!row) return {};
  const parsed = RegionGates.safeParse(JSON.parse(row.value));
  if (!parsed.success) console.error(`the stored region gates no longer parse: ${parsed.error.message}`);
  return parsed.success ? parsed.data : {};
}

export async function saveRegionGates(db: Db, gates: RegionGates): Promise<RegionGates> {
  const value = JSON.stringify(gates);
  await db
    .insert(platformSettings)
    .values({ key: REGION_GATES_SETTING, value })
    .onConflictDoUpdate({ target: platformSettings.key, set: { value, updatedAt: new Date() } });
  return gates;
}

/**
 * The visitor's country: Cloudflare's own reading of the request (`cf.country`, the `cf-ipcountry` header it adds),
 * or on a stack that names a test header (`COUNTRY_HEADER`, never on mainnet) whatever that header says, so a test can
 * visit from anywhere. Null when nothing readable is there, as on a plain local stack.
 */
export function visitorCountry(req: Request, cfg: Config): string | null {
  const fromTest = cfg.countryHeader ? req.headers.get(cfg.countryHeader) : null;
  const raw = fromTest ?? req.cf?.country ?? req.headers.get("cf-ipcountry");
  const code = typeof raw === "string" ? raw.trim().toUpperCase() : "";
  return /^[A-Z0-9]{2}$/.test(code) ? code : null;
}

/** What this visitor is answered: an unknown country is withheld nothing by name, and the web shows nothing gated until it knows. */
export function regionOf(country: string | null, gates: RegionGates): Region {
  const withheld = country === null ? [] : Object.entries(gates).filter(([, countries]) => countries.includes(country)).map(([feature]) => feature);
  return { country, withheld };
}
