import { formatPrice, formatPriceCompact } from "@/lib/format";

/** A price in the compact subscript form, with the full number for screen readers and on hover. */
export function Price({ value, className }: { value: number; className?: string }) {
  const full = formatPrice(value);
  const compact = formatPriceCompact(value);
  const cls = `mono ${className ?? ""}`;
  if (compact === full) return <span className={cls}>{full}</span>;
  return (
    <span className={cls} title={full}>
      <span aria-hidden>{compact}</span>
      <span className="visually-hidden">{full}</span>
    </span>
  );
}
