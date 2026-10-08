import { isValidElement, type ComponentProps, type ReactNode } from "react";
import ReactMarkdown, { defaultUrlTransform, type Components, type UrlTransform } from "react-markdown";
import remarkGfm from "remark-gfm";
import { SITE_LINKS } from "@/lib/site";
import styles from "./Markdown.module.css";

/** A heading's id as GitHub derives it, so a link written for the repository's copy (`#api-keys-and-limits`) lands here too. */
export const headingId = (text: string) => text.toLowerCase().replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-");

/** The text of what React would render, for an id or for a block that must hold plain text. */
const textOf = (node: ReactNode): string =>
  Array.isArray(node)
    ? node.map(textOf).join("")
    : isValidElement<{ children?: ReactNode }>(node)
      ? textOf(node.props.children)
      : node == null || typeof node === "boolean"
        ? ""
        : String(node);

/** A block of plain text (a command, an answer, a code sample) that scrolls sideways where it is wider than the page. */
export function CodeBlock({ className, children, ...props }: ComponentProps<"pre">) {
  return (
    <pre className={className ? `${styles.block} ${className}` : styles.block} {...props}>
      {children}
    </pre>
  );
}

const external = (href?: string) => !!href && /^https?:/.test(href);

const heading = (Tag: "h2" | "h3") => {
  const Heading = ({ children }: ComponentProps<typeof Tag>) => (
    <Tag id={headingId(textOf(children))} className={styles[Tag]}>
      {children}
    </Tag>
  );
  return Heading;
};

const components: Components = {
  h2: heading("h2"),
  h3: heading("h3"),
  p: ({ children }) => <p className={styles.p}>{children}</p>,
  a: ({ href, children }) =>
    external(href) ? (
      <a href={href} target="_blank" rel="noreferrer">
        {children}
      </a>
    ) : (
      <a href={href}>{children}</a>
    ),
  code: ({ children }) => <code className={styles.code}>{children}</code>,
  // A fenced block holds its text directly, never a `code` child: a child's box would run past a phone's viewport.
  pre: ({ children }) => <CodeBlock>{textOf(children)}</CodeBlock>,
  table: ({ children }) => <table className={styles.table}>{children}</table>,
};

/** A link relative to the document points at the file on GitHub; an anchor or an absolute URL is left as it is. */
const DOCS_ON_GITHUB = `${SITE_LINKS.github.href}/blob/main/docs/`;
const toRepository: UrlTransform = (url) => (/^(#|[a-z][a-z0-9+.-]*:)/i.test(url) ? defaultUrlTransform(url) : new URL(url, DOCS_ON_GITHUB).href);

/** A Markdown document from the repository's `docs/`, rendered with the site's type, tables and code. */
export function Markdown({ source }: { source: string }) {
  return (
    <div className={styles.doc}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components} urlTransform={toRepository}>
        {source}
      </ReactMarkdown>
    </div>
  );
}
