import Link from "next/link";
import { explorerUrl, shortAddress } from "@/lib/format";

/**
 * An address (or a signature) the one way the site writes one (#131): its first and last four characters in the
 * mono, the whole of it on hover. With `platform` it links to the explorer in a new tab; with `href` it links inside the site (a wallet's
 * rewards page); otherwise it is text.
 */
export function Address({ value, platform, kind = "address", href, className = "" }: {
  value: string;
  platform?: { cluster: string; rpcUrl: string };
  /** What the explorer is asked for: an account, or a transaction's signature written the same way. */
  kind?: "address" | "tx";
  href?: string;
  className?: string;
}) {
  const cls = `mono ${className}`.trim();
  const short = shortAddress(value);
  if (platform)
    return (
      <a className={cls} href={explorerUrl(kind, value, platform)} target="_blank" rel="noreferrer" title={value}>{short}</a>
    );
  if (href) return <Link href={href} className={cls} title={value}>{short}</Link>;
  return <span className={cls} title={value}>{short}</span>;
}
