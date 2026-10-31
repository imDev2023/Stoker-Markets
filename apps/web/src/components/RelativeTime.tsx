import { formatUtc, timeAgo } from "@/lib/format";

/**
 * A moment as "3m ago", with the absolute UTC time on hover (#131: relative time everywhere, the absolute a hover
 * away). `now` is the page's clock, so the server and the browser write the same text. With `staleAfter` (seconds) a
 * moment older than that carries a caution tag, so a reader sees a figure is old before trusting it.
 */
export function RelativeTime({ iso, now, staleAfter, className }: { iso: string; now: number; staleAfter?: number; className?: string }) {
  const stale = staleAfter !== undefined && now - new Date(iso).getTime() > staleAfter * 1000;
  return (
    <>
      <time dateTime={iso} title={formatUtc(iso)} className={className}>{timeAgo(iso, now)}</time>
      {stale && <span className="tag tag-caution">Stale</span>}
    </>
  );
}
