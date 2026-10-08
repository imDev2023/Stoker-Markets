import type { Metadata } from "next";
import { API_URL, getPlatform } from "@/lib/api";
import { SITE_LINKS } from "@/lib/site";
import base from "../rewards/page.module.css";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "API",
  description: "Read every coin, trade and reward without a key, and launch or trade through unsigned transactions your wallet signs. An introduction, with a quickstart answered live.",
};

/** The full reference stays in the repository until this page grows into it (owner, 2026-10-08). */
const REFERENCE_URL = `${SITE_LINKS.github.href}/blob/main/docs/api.md`;

/** An introduction to the public API: what it is for, a quickstart the API answers itself, what it does today and where the reference is. */
export default async function ApiPage() {
  const baseUrl = `${API_URL}/v1`;
  // Fetched for this page view, so the page proves the API with its own answer; without one the page still renders.
  const answer = await getPlatform()
    .then((platform) => JSON.stringify(platform, null, 2))
    .catch(() => null);
  return (
    <div className={`shell ${base.page}`}>
      <h1 className={base.title}>The API</h1>
      <p className={base.lead}>
        Everything this site shows is read from the API, and everything it does is a transaction the API prepared and a wallet signed. Reads are
        open: no key, no signup. A launch or a trade comes back unsigned, for your wallet to sign, so nothing is ever custodied.
      </p>
      <section className={base.card} aria-labelledby="quickstart">
        <h2 id="quickstart" className={base.cardTitle}>Quickstart</h2>
        <p className={base.note}>
          The base URL is <code className={`mono ${styles.url}`}>{baseUrl}</code>. Every answer is JSON, and every amount a raw integer as a
          decimal string. The answer below came from the API for this page view.
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
            <pre className={`${styles.block} ${styles.answer}`}>{answer}</pre>
          </figure>
        )}
      </section>
      <section className={base.card} aria-labelledby="today">
        <h2 id="today" className={base.cardTitle}>What the API does today</h2>
        <ul className={styles.points}>
          <li>
            <strong>Read</strong> the platform and the Quote Registry, the board and every coin with its trades, candles and holders, a trade
            quote, Holder Rewards, Creator Earnings, revenue and the Ledger, the Burn and Flywheel, and every announced fee change.
          </li>
          <li>
            <strong>Prepare</strong> a launch, a trade or an airdrop as an unsigned transaction for the wallet that asked, and report it once
            confirmed so it shows up at once.
          </li>
          <li>
            <strong>Refer</strong> a trade: name a <code className={styles.code}>referrer</code> and the chain pays that wallet a share of the
            trade, where the Quote Asset allows one.
          </li>
          <li>
            <strong>Limits</strong>: 300 requests and 25 prepare requests a minute per IP address without a key, answered past them with 429 and{" "}
            <code className={styles.code}>retry-after</code>. An integrator gets a key to send in <code className={styles.code}>x-api-key</code>,
            with its own limit, by writing to <a href={`mailto:${SITE_LINKS.email}`}>{SITE_LINKS.email}</a>.
          </li>
        </ul>
      </section>
      <section className={base.card} aria-labelledby="next">
        <h2 id="next" className={base.cardTitle}>What comes next</h2>
        <p className={base.note}>
          This page is an introduction. The full reference, every endpoint with its parameters, answers and errors, is{" "}
          <a href={REFERENCE_URL} target="_blank" rel="noreferrer">
            docs/api.md
          </a>{" "}
          in the repository for now; it moves here, with an OpenAPI document, down the line.
        </p>
      </section>
    </div>
  );
}
