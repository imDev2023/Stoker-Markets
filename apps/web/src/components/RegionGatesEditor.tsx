"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { RegionGates } from "@launchpad/contract";
import { getRegionGates, putRegionGates } from "@/lib/api";
import styles from "./OperatorView.module.css";

type Row = { feature: string; countries: string };

const toRows = (gates: RegionGates): Row[] => Object.entries(gates).map(([feature, countries]) => ({ feature, countries: countries.join(", ") }));

/** The rows as the table the API takes: slugs as typed, countries split on commas or spaces and written in capitals. */
function toGates(rows: Row[]): RegionGates {
  const gates: RegionGates = {};
  for (const r of rows) {
    const feature = r.feature.trim();
    if (!feature) continue;
    gates[feature] = r.countries.split(/[\s,]+/).map((c) => c.trim().toUpperCase()).filter(Boolean);
  }
  return gates;
}

/**
 * The region gate's table (#131; owner, 2026-10-28): for each feature the web gates by name, the countries it is
 * withheld in, as ISO codes. The table is replaced whole on save and starts empty: nothing is withheld upfront, and a
 * row is added only when someone asks for a feature's removal in their country (owner, 2026-10-29; ADR 0014).
 */
export function RegionGatesEditor({ token }: { token: string }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      setRows(toRows((await getRegionGates(token)).gates));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!rows) return;
    setSaving(true);
    setError(null);
    try {
      setRows(toRows((await putRegionGates(token, toGates(rows))).gates));
      setSavedAt(Date.now());
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const update = (i: number, patch: Partial<Row>) => setRows((r) => r!.map((row, j) => (j === i ? { ...row, ...patch } : row)));

  return (
    <section className={`card ${styles.card}`} aria-labelledby="gates-title">
      <h2 id="gates-title" className={`t-h3 ${styles.cardTitle}`}>Region gates</h2>
      <p className={styles.note}>
        A feature named here is hidden from visitors in the countries listed (two-letter codes, as Cloudflare reads them) and shown
        everywhere else. Nothing is withheld upfront: a row is added only when someone asks for a feature&apos;s removal in their country.
      </p>
      {rows && (
        <form className={styles.feeForm} onSubmit={(e) => void save(e)}>
          {rows.map((r, i) => (
            <div key={i} className={styles.gateRow}>
              <label>
                Feature <input type="text" value={r.feature} onChange={(e) => update(i, { feature: e.target.value })} pattern="[a-z][a-z0-9-]{0,39}" required />
              </label>
              <label>
                Withheld in <input type="text" value={r.countries} onChange={(e) => update(i, { countries: e.target.value })} placeholder="GB, CA" />
              </label>
              <button type="button" className="button button-ghost button-sm" onClick={() => setRows((rs) => rs!.filter((_, j) => j !== i))}>Remove</button>
            </div>
          ))}
          <div className={styles.gateRow}>
            <button type="button" className="button button-ghost button-sm" onClick={() => setRows((rs) => [...rs!, { feature: "", countries: "" }])}>Add a feature</button>
            <button type="submit" className="button button-primary" disabled={saving}>{saving ? "Saving…" : "Save the table"}</button>
            {savedAt && !saving && <span className={styles.note}>Saved.</span>}
          </div>
        </form>
      )}
      {error && <p className={styles.error} role="alert">{error}</p>}
    </section>
  );
}
