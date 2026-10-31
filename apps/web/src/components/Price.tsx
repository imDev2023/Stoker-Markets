import { formatPrice, formatPriceCompact } from "@/lib/format";

/**
 * A price in the one notation (#131): the compact subscript form, with the full number for screen readers and on hover.
 * It takes the size of whatever holds it (`.price`); a caller that wants the row figure's size adds `mono`.
 */
export function Price({ value, className }: { value: number; className?: string }) {
  const full = formatPrice(value);
  const compact = formatPriceCompact(value);
  const cls = `price ${className ?? ""}`.trim();
  if (compact === full) return <span className={cls}>{full}</span>;
  return (
    <span className={cls} title={full}>
      <span aria-hidden>{compact}</span>
      <span className="visually-hidden">{full}</span>
    </span>
  );
}
