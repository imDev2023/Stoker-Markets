/**
 * Structured data for search engines (#83), one script per graph. Every `<` is escaped, so nothing a coin's name holds
 * can close the script early.
 */
export function JsonLd({ data }: { data: Record<string, unknown> }) {
  const json = JSON.stringify({ "@context": "https://schema.org", ...data }).replace(/</g, "\\u003c");
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} />;
}
