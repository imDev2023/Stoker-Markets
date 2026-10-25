import type { Metadata } from "next";
import { API_URL, getPlatform } from "@/lib/api";
import base from "../rewards/page.module.css";
import styles from "./page.module.css";
import { SECTIONS } from "./reference";

export const metadata: Metadata = {
  title: "API",
  description:
    "The public API's reference: read every coin, trade, holder and reward without a key, and launch or trade through unsigned transactions your wallet signs. A quickstart answered live, every endpoint, the errors and the limits.",
};

/**
 * The public API, the whole reference on one page (owner, 2026-10-25): a quickstart the API answers for this very
 * page view, then every endpoint from `./reference`, with the contents as jump links under the lead.
 */
export default async function ApiPage() {
  const baseUrl = `${API_URL}/v1`;
  // Fetched for this page view, so the page proves the API with its own answer; without one the page still renders.
  const answer = await getPlatform()
    .then((platform) => JSON.stringify(platform, null, 2))
    .catch(() => null);
  return (
    <div className={`shell ${base.page}`}>
      <h1 className={`t-h1 ${base.title}`}>The API</h1>
      <p className={base.lead}>
        Everything this site shows is read from the API, and everything it does is a transaction the API prepared and a wallet signed. Reads are
        open: no key, no signup. A launch or a trade comes back unsigned, for your wallet to sign, so nothing is ever custodied. A bot, a
        terminal or a script uses the same endpoints and gets the same transactions.
      </p>
      <nav aria-label="On this page">
        <ul className={styles.contents}>
          <li>
            <a href="#quickstart" className="chip">Quickstart</a>
          </li>
          {SECTIONS.map((s) => (
            <li key={s.id}>
              <a href={`#${s.id}`} className="chip">{s.title}</a>
            </li>
          ))}
        </ul>
      </nav>

      <section id="quickstart" className={`card ${base.card} ${styles.section}`} aria-labelledby="quickstart-title">
        <h2 id="quickstart-title" className={`t-h3 ${base.cardTitle}`}>Quickstart</h2>
        <p className={styles.prose}>
          The base URL is <code className={`${styles.code} ${styles.url}`}>{baseUrl}</code>. Every body is JSON, and every amount a raw integer
          as a decimal string. The answer below came from the API for this page view.
        </p>
        <figure className={styles.figure}>
          <figcaption className={styles.caption}>Request</figcaption>
          <pre className={styles.block}>{`curl ${baseUrl}/platform`}</pre>
        </figure>
        {answer === null ? (
          <p className={base.note}>The API didn&apos;t answer just now; try the request yourself.</p>
        ) : (
          <figure className={styles.figure}>
            <figcaption className={styles.caption}>Answer</figcaption>
            <pre className={`${styles.block} ${styles.answer}`} data-live="">{answer}</pre>
          </figure>
        )}
      </section>

      {SECTIONS.map((s) => (
        <section key={s.id} id={s.id} className={`card ${base.card} ${styles.section}`} aria-labelledby={`${s.id}-title`}>
          <h2 id={`${s.id}-title`} className={`t-h3 ${base.cardTitle}`}>{s.title}</h2>
          {s.lead && <p className={styles.prose}>{s.lead}</p>}
          {s.rows && (
            <dl className={styles.rows}>
              {s.rows.map((r) => {
                const forms = typeof r.endpoint === "string" ? [r.endpoint] : r.endpoint;
                return (
                  <div key={forms[0]} className={styles.row}>
                    <dt>
                      {forms.map((f) => (
                        <code key={f} className={styles.endpoint}>{f}</code>
                      ))}
                    </dt>
                    <dd>{r.text}</dd>
                  </div>
                );
              })}
            </dl>
          )}
          {s.body}
        </section>
      ))}
    </div>
  );
}
