"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  API_KEY_RATE_LIMIT_DEFAULT, API_KEY_RATE_LIMIT_MAX, type ApiKeyInfo, type FeeAnnouncement, type IssuedApiKey, type OperatorAlert,
  type OperatorOverview, type PlatformInfo, type PreparedFeeChange,
} from "@launchpad/contract";
import {
  ApiRequestError, announceFeeChange, createApiKey, getOperatorOverview, listAnnouncements, listApiKeys, listOperatorAlerts, prepareFeeChange,
  revokeApiKey, runOperatorJob,
} from "@/lib/api";
import { formatUtc } from "@/lib/format";
import { CopyButton } from "./CopyButton";
import styles from "./OperatorView.module.css";

const TOKEN_KEY = "launchpad-operator-token";
const REFRESH_MS = 10_000;
const JOBS = ["quote-registry", "fee-collector", "reward-rounds", "burn"] as const;

type Loaded = { overview: OperatorOverview; alerts: OperatorAlert[]; announcements: FeeAnnouncement[]; keys: ApiKeyInfo[] };

/**
 * Everything the operator needs at a glance (#22): Launches by status, rounds, burns, the latest run of each job, open
 * alerts, the fee-change announcements with the admin's transaction for one whose time has come, and the API keys (#21),
 * each shown once when issued. The operator token stays in this browser session only.
 */
export function OperatorView({ platform }: { platform: PlatformInfo }) {
  const [token, setToken] = useState<string | null>(null);
  const [tokenText, setTokenText] = useState("");
  const [data, setData] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [prepared, setPrepared] = useState<PreparedFeeChange | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [form, setForm] = useState({ platformFeeBps: String(platform.platformFeeBps), creatorFeeBps: String(platform.creatorFeeBps), effectiveAt: "", note: "" });
  const [keyForm, setKeyForm] = useState({ name: "", rateLimitPerMinute: String(API_KEY_RATE_LIMIT_DEFAULT) });
  const [issued, setIssued] = useState<IssuedApiKey | null>(null);

  useEffect(() => {
    try {
      setToken(sessionStorage.getItem(TOKEN_KEY));
    } catch {
      // no session storage: the operator types the token each visit
    }
  }, []);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const [overview, alerts, announcements, keys] = await Promise.all([
        getOperatorOverview(token), listOperatorAlerts(token), listAnnouncements(), listApiKeys(token),
      ]);
      setData({ overview, alerts: alerts.alerts, announcements: announcements.announcements, keys: keys.keys });
      setError(null);
    } catch (e) {
      if (e instanceof ApiRequestError && e.status === 401) {
        setToken(null);
        setError("That token was refused.");
      } else setError((e as Error).message);
    }
  }, [token]);

  useEffect(() => {
    void load();
    const id = setInterval(() => void load(), REFRESH_MS);
    return () => clearInterval(id);
  }, [load]);

  function signIn(e: FormEvent) {
    e.preventDefault();
    const t = tokenText.trim();
    if (!t) return;
    try {
      sessionStorage.setItem(TOKEN_KEY, t);
    } catch {
      // kept in memory only
    }
    setToken(t);
    setTokenText("");
  }

  async function act(label: string, work: () => Promise<void>) {
    setBusy(label);
    setError(null);
    try {
      await work();
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(null);
  }

  if (!token) {
    return (
      <div className={`shell ${styles.page}`}>
        <h1 className={styles.title}>Operator</h1>
        <form className={styles.signIn} onSubmit={signIn}>
          <label htmlFor="operator-token">Operator token</label>
          <input id="operator-token" type="password" value={tokenText} onChange={(e) => setTokenText(e.target.value)} autoComplete="off" />
          <button type="submit">Open</button>
          {error && <p className={styles.error} role="alert">{error}</p>}
        </form>
      </div>
    );
  }

  const o = data?.overview;
  const open = data?.alerts.filter((a) => a.resolvedAt === null) ?? [];
  const now = Date.now();
  return (
    <div className={`shell ${styles.page}`}>
      <div className={styles.head}>
        <h1 className={styles.title}>Operator</h1>
        <button type="button" className={styles.link} onClick={() => { try { sessionStorage.removeItem(TOKEN_KEY); } catch { /* nothing kept */ } setToken(null); }}>
          Forget the token
        </button>
      </div>
      {error && <p className={styles.error} role="alert">{error}</p>}

      {o && (
        <section className={styles.card} aria-labelledby="glance-title">
          <h2 id="glance-title" className={styles.cardTitle}>At a glance</h2>
          <dl className={styles.facts}>
            <div><dt>Launches</dt><dd>{o.launches.total} ({o.launches.byStatus.live} live, {o.launches.byStatus.graduating} graduating, {o.launches.byStatus.graduated} graduated; {o.launches.reward} Reward Launches)</dd></div>
            <div><dt>Reward Rounds</dt><dd>{o.rewardRounds.paying} paying, {o.rewardRounds.paid} paid</dd></div>
            <div><dt>Burns</dt><dd>{o.burns} transactions</dd></div>
            <div><dt>Fees on-chain</dt><dd>Platform {o.fees.platformFeeBps / 100}%, Creator {o.fees.creatorFeeBps / 100}%</dd></div>
            <div><dt>Open alerts</dt><dd>{o.openAlerts}</dd></div>
          </dl>
        </section>
      )}

      <section className={styles.card} aria-labelledby="alerts-title">
        <h2 id="alerts-title" className={styles.cardTitle}>Alerts</h2>
        {open.length === 0 ? (
          <p className={styles.note}>Nothing needs attention.</p>
        ) : (
          <ul className={styles.list}>
            {open.map((a) => (
              <li key={`${a.kind}:${a.subject}`}>
                <span><strong>{a.kind.replace(/_/g, " ")}</strong> · {a.message}</span>
                <span className={styles.when}>{formatUtc(a.raisedAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {o && (
        <section className={styles.card} aria-labelledby="jobs-title">
          <h2 id="jobs-title" className={styles.cardTitle}>Jobs</h2>
          <ul className={styles.list}>
            {o.jobs.map((j) => (
              <li key={j.id}>
                <span>
                  <strong>{j.job}</strong> · {j.status} · started {formatUtc(j.startedAt)}
                  {j.error && <> · {j.error}</>}
                </span>
              </li>
            ))}
          </ul>
          <div className={styles.actions}>
            {JOBS.map((job) => (
              <button key={job} type="button" disabled={busy !== null} onClick={() => act(job, async () => { await runOperatorJob(token, job); })}>
                {busy === job ? "Running…" : `Run ${job} now`}
              </button>
            ))}
          </div>
        </section>
      )}

      <section className={styles.card} aria-labelledby="fees-title">
        <h2 id="fees-title" className={styles.cardTitle}>Fee changes</h2>
        <p className={styles.note}>
          A change applies to every live curve at once, so it is announced first and can only be prepared once its time has come. The
          platform&apos;s admin key, which this site never holds, signs the prepared transaction.
        </p>
        <form
          className={styles.feeForm}
          onSubmit={(e) => {
            e.preventDefault();
            void act("announce", async () => {
              await announceFeeChange(token, {
                platformFeeBps: Number(form.platformFeeBps),
                creatorFeeBps: Number(form.creatorFeeBps),
                effectiveAt: new Date(form.effectiveAt).toISOString(),
                note: form.note || undefined,
              });
              setForm((f) => ({ ...f, note: "" }));
            });
          }}
        >
          <label>Platform Fee, bps <input type="number" min={0} max={10000} value={form.platformFeeBps} onChange={(e) => setForm({ ...form, platformFeeBps: e.target.value })} /></label>
          <label>Creator Fee, bps <input type="number" min={0} max={10000} value={form.creatorFeeBps} onChange={(e) => setForm({ ...form, creatorFeeBps: e.target.value })} /></label>
          <label>Effective at <input type="datetime-local" value={form.effectiveAt} onChange={(e) => setForm({ ...form, effectiveAt: e.target.value })} required /></label>
          <label>Note <input type="text" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} maxLength={500} /></label>
          <button type="submit" disabled={busy !== null}>{busy === "announce" ? "Announcing…" : "Announce"}</button>
        </form>
        {data && data.announcements.length > 0 && (
          <ul className={styles.list}>
            {data.announcements.map((a) => {
              const due = !a.appliedSignature && new Date(a.effectiveAt).getTime() <= now;
              return (
                <li key={a.id}>
                  <span>
                    Platform {a.platformFeeBps / 100}%, Creator {a.creatorFeeBps / 100}% from {formatUtc(a.effectiveAt)}
                    {a.appliedSignature ? " · applied" : due ? " · due" : " · announced"}
                    {a.note && <> · {a.note}</>}
                  </span>
                  {due && (
                    <button type="button" disabled={busy !== null} onClick={() => act(a.id, async () => setPrepared(await prepareFeeChange(token, a.id)))}>
                      {busy === a.id ? "Preparing…" : "Prepare the admin's transaction"}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {prepared && (
          <div className={styles.prepared}>
            <p>
              Unsigned transaction for <code>{prepared.admin}</code>, setting Platform {prepared.platformFeeBps / 100}% and Creator {prepared.creatorFeeBps / 100}%.
              Sign it with the admin key and send it before block height {prepared.lastValidBlockHeight}.
            </p>
            <div className={styles.code}>
              <CopyButton value={prepared.transaction} label="Copy the transaction" />
              <pre tabIndex={0}>{prepared.transaction}</pre>
            </div>
          </div>
        )}
      </section>

      <section className={styles.card} aria-labelledby="keys-title">
        <h2 id="keys-title" className={styles.cardTitle}>API keys</h2>
        <p className={styles.note}>
          A key identifies an integrator (a bot, a terminal) and bounds it to so many requests a minute; reads need no key. The key is
          shown once, here, when it is issued.
        </p>
        <form
          className={styles.feeForm}
          onSubmit={(e) => {
            e.preventDefault();
            void act("issue-key", async () => {
              setIssued(await createApiKey(token, { name: keyForm.name, rateLimitPerMinute: Number(keyForm.rateLimitPerMinute) }));
              setKeyForm({ name: "", rateLimitPerMinute: String(API_KEY_RATE_LIMIT_DEFAULT) });
            });
          }}
        >
          <label>Name <input type="text" value={keyForm.name} onChange={(e) => setKeyForm({ ...keyForm, name: e.target.value })} required maxLength={80} /></label>
          <label>
            Requests a minute{" "}
            <input
              type="number"
              min={1}
              max={API_KEY_RATE_LIMIT_MAX}
              value={keyForm.rateLimitPerMinute}
              onChange={(e) => setKeyForm({ ...keyForm, rateLimitPerMinute: e.target.value })}
              required
            />
          </label>
          <button type="submit" disabled={busy !== null}>{busy === "issue-key" ? "Issuing…" : "Issue a key"}</button>
        </form>
        {issued && (
          <div className={styles.prepared} role="status">
            <p>The key for <strong>{issued.name}</strong>, shown this once. Copy it now; it can only be revoked, never shown again.</p>
            <div className={styles.code}>
              <CopyButton value={issued.key} label="Copy the key" />
              <pre tabIndex={0}>{issued.key}</pre>
            </div>
          </div>
        )}
        {data && data.keys.length > 0 && (
          <ul className={styles.list}>
            {data.keys.map((k) => (
              <li key={k.id}>
                <span>
                  <strong>{k.name}</strong> · {k.rateLimitPerMinute} a minute · issued {formatUtc(k.createdAt)}
                  {k.revokedAt && <> · revoked {formatUtc(k.revokedAt)}</>}
                </span>
                {!k.revokedAt && (
                  <button type="button" disabled={busy !== null} onClick={() => act(k.id, async () => { await revokeApiKey(token, k.id); })}>
                    {busy === k.id ? "Revoking…" : "Revoke"}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
