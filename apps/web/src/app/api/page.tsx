import type { Metadata } from "next";
import apiDoc from "../../../../../docs/api.md";
import { CodeBlock, Markdown } from "@/components/Markdown";
import { API_URL, getPlatform, listLaunches } from "@/lib/api";
import { SITE_LINKS } from "@/lib/site";
import base from "../rewards/page.module.css";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "API",
  description: "Read every coin, trade and reward without a key, and launch or trade through unsigned transactions your wallet signs. The reference, with a quickstart answered live.",
};

/** The reference is `docs/api.md` itself, from its first section up to the operator's, so the site and the repository never drift. */
function reference() {
  const start = apiDoc.indexOf("\n## ");
  const end = apiDoc.indexOf("\n## The operator's endpoints");
  return apiDoc.slice(start, end === -1 ? undefined : end);
}

/** An answer fetched for this page view, pretty-printed; null when the API didn't answer, so the page still renders. */
const answered = <T,>(read: () => Promise<T>) => read().then((value) => JSON.stringify(value, null, 2)).catch(() => null);

function Example({ command, answer }: { command: string; answer: string | null }) {
  return (
    <div className={styles.example}>
      <figure className={styles.figure}>
        <figcaption className={styles.caption}>Request</figcaption>
        <CodeBlock>{command}</CodeBlock>
      </figure>
      {answer === null ? (
        <p className={base.note}>The API didn&apos;t answer just now; try the request yourself.</p>
      ) : (
        <figure className={styles.figure}>
          <figcaption className={styles.caption}>Answer</figcaption>
          <CodeBlock className={styles.answer}>{answer}</CodeBlock>
        </figure>
      )}
    </div>
  );
}

/** The public API: a quickstart answered by the API itself, then the reference rendered from the repository. */
export default async function ApiPage() {
  const baseUrl = `${API_URL}/v1`;
  const [platform, board] = await Promise.all([answered(getPlatform), answered(() => listLaunches({ limit: 1 }))]);
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
          decimal string. Both answers below came from the API for this page view.
        </p>
        <Example command={`curl ${baseUrl}/platform`} answer={platform} />
        <Example command={`curl "${baseUrl}/launches?limit=1"`} answer={board} />
      </section>
      <Markdown source={reference()} />
      <p className={base.note}>
        This reference is{" "}
        <a href={`${SITE_LINKS.github.href}/blob/main/docs/api.md`} target="_blank" rel="noreferrer">
          docs/api.md
        </a>{" "}
        in the repository, rendered here. Every shape is defined by the zod contract in{" "}
        <a href={`${SITE_LINKS.github.href}/blob/main/packages/contract/src`} target="_blank" rel="noreferrer">
          packages/contract
        </a>
        , which the API validates with, and the API&apos;s own code is beside it.
      </p>
    </div>
  );
}
