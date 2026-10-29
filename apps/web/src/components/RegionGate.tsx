"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { getRegion } from "@/lib/api";

type RegionState = {
  /** True once the API has answered for this visitor. */
  known: boolean;
  /** The visitor's country as the edge read it; null until known, or when it could not be read. */
  country: string | null;
  /** The features withheld where the visitor is. */
  withheld: ReadonlySet<string>;
};

const UNKNOWN: RegionState = { known: false, country: null, withheld: new Set() };
const RegionContext = createContext<RegionState>(UNKNOWN);

/**
 * The region gate (#131; owner, 2026-10-28): an engagement feature is built where it works and withheld where a
 * regulator objects. The gate is asked from the browser, so Cloudflare reads the visitor's own address and never the
 * web Worker's, and until it answers nothing gated is shown: a withheld feature is never shown by accident, and the
 * page renders the same on the server and on the first paint.
 */
export function RegionProvider({ children }: { children: ReactNode }) {
  const [region, setRegion] = useState(UNKNOWN);
  useEffect(() => {
    let gone = false;
    getRegion()
      .then((r) => {
        if (!gone) setRegion({ known: true, country: r.country, withheld: new Set(r.withheld) });
      })
      .catch(() => {
        // Unanswered: the region stays unknown and nothing gated is shown.
      });
    return () => {
      gone = true;
    };
  }, []);
  return <RegionContext.Provider value={region}>{children}</RegionContext.Provider>;
}

export function useRegion() {
  return useContext(RegionContext);
}

/** Its children only where the feature is allowed: nothing while the region is unknown, `fallback` where it is withheld. */
export function Gated({ feature, children, fallback = null }: { feature: string; children: ReactNode; fallback?: ReactNode }) {
  const region = useRegion();
  if (!region.known) return null;
  return <>{region.withheld.has(feature) ? fallback : children}</>;
}
