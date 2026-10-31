/**
 * A day's price change as a tag (#133): up or down in the market colours, with the sign; a held price reads as a plain
 * tag, and a coin with no trade to measure from shows nothing, since there is no change to speak of. The value is the
 * API's fraction (0.12 is up 12%).
 */
export function Change({ value, className = "" }: { value: number | null; className?: string }) {
  if (value === null) return null;
  const pct = value * 100;
  const text = `${pct > 0 ? "+" : ""}${Math.abs(pct) >= 100 ? pct.toFixed(0) : pct.toFixed(1)}%`;
  const tone = pct > 0 ? "tag-up" : pct < 0 ? "tag-down" : "";
  return (
    <span className={`tag ${tone} ${className}`} title="Price change over the last 24 hours">
      <span className="visually-hidden">24h change </span>
      {text}
    </span>
  );
}
