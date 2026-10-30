"use client";

import { useId, useState } from "react";
import { formatUtcDay } from "@/lib/format";
import styles from "./BuybackChart.module.css";

export type ChartPoint = { day: string; sol: number };

const WIDTH = 640;
const HEIGHT = 220;
const PAD = { top: 12, right: 16, bottom: 28, left: 44 };
const BAR_MAX = 24;

/** A SOL figure for an axis or a tooltip: compact from a thousand up, else up to three decimals, none it doesn't need. */
function solLabel(sol: number) {
  if (sol >= 1_000) return sol.toLocaleString("en-US", { notation: "compact", maximumSignificantDigits: 3 });
  return sol.toLocaleString("en-US", { maximumFractionDigits: sol < 1 ? 3 : 1 });
}

/** Three clean gridline values from 0 to just above the largest figure. */
function ticks(max: number) {
  if (max <= 0) return [0, 1, 2];
  const raw = max / 2;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => s >= raw) ?? raw;
  return [0, step, step * 2];
}

/**
 * The Stats page's two buyback charts (dataviz skill: one series, so no legend; a 2px line with a wash under it for
 * the SOL spent on every burn so far, 24px columns with rounded caps for each day's; hairline gridlines; a crosshair
 * and a tooltip on hover). The table of every burn under it is the chart's table view.
 */
export function BuybackChart({ points, kind, label }: { points: ChartPoint[]; kind: "cumulative" | "daily"; label: string }) {
  const id = useId();
  const [active, setActive] = useState<number | null>(null);
  const max = Math.max(...points.map((p) => p.sol), 0);
  const [, , top] = ticks(max);
  const innerW = WIDTH - PAD.left - PAD.right;
  const innerH = HEIGHT - PAD.top - PAD.bottom;
  const x = (i: number) => PAD.left + (points.length === 1 ? innerW / 2 : (i / (points.length - 1)) * innerW);
  const y = (sol: number) => PAD.top + innerH - (sol / top!) * innerH;
  const slot = points.length ? innerW / points.length : innerW;
  const barW = Math.min(BAR_MAX, Math.max(4, slot - 2));
  const barX = (i: number) => PAD.left + i * slot + (slot - barW) / 2;

  const line = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.sol).toFixed(1)}`).join(" ");
  const area = points.length > 1 ? `${line} L${x(points.length - 1).toFixed(1)},${(PAD.top + innerH).toFixed(1)} L${x(0).toFixed(1)},${(PAD.top + innerH).toFixed(1)} Z` : "";

  const locate = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!points.length) return;
    const box = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - box.left) / box.width) * WIDTH;
    const i = kind === "daily"
      ? Math.min(points.length - 1, Math.max(0, Math.floor((px - PAD.left) / slot)))
      : points.reduce((best, _, j) => (Math.abs(x(j) - px) < Math.abs(x(best) - px) ? j : best), 0);
    setActive(i);
  };
  const hit = active === null ? null : points[active]!;
  const hitX = active === null ? 0 : kind === "daily" ? barX(active) + barW / 2 : x(active);

  if (points.length === 0) {
    return (
      <figure className={styles.figure} aria-label={label}>
        <p className={styles.empty}>No burn yet.</p>
      </figure>
    );
  }
  return (
    <figure className={styles.figure} aria-label={label}>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className={styles.svg} role="img" aria-labelledby={`${id}-title`}
        onPointerMove={locate} onPointerLeave={() => setActive(null)}
      >
        <title id={`${id}-title`}>{label}</title>
        {ticks(max).map((t) => (
          <g key={t}>
            <line x1={PAD.left} x2={WIDTH - PAD.right} y1={y(t)} y2={y(t)} className={styles.grid} />
            <text x={PAD.left - 8} y={y(t)} className={styles.tick} textAnchor="end" dominantBaseline="middle">{solLabel(t)}</text>
          </g>
        ))}
        {kind === "cumulative" && points.length > 1 && <path d={area} className={styles.area} />}
        {kind === "cumulative" && points.length > 0 && <path d={line} className={styles.line} />}
        {kind === "cumulative" && points.length > 0 && (
          <circle cx={x(points.length - 1)} cy={y(points.at(-1)!.sol)} r={4} className={styles.marker} />
        )}
        {kind === "daily" &&
          points.map((p, i) => {
            const h = Math.max(0, PAD.top + innerH - y(p.sol));
            const r = Math.min(4, h, barW / 2);
            const left = barX(i);
            const topY = y(p.sol);
            const d = `M${left},${PAD.top + innerH} V${topY + r} a${r},${r} 0 0 1 ${r},-${r} h${barW - 2 * r} a${r},${r} 0 0 1 ${r},${r} V${PAD.top + innerH} Z`;
            return <path key={p.day} d={d} className={`${styles.bar} ${active === i ? styles.barActive : ""}`} />;
          })}
        {points.length > 0 && (
          <>
            <text x={PAD.left} y={HEIGHT - 8} className={styles.tick}>{formatUtcDay(points[0]!.day)}</text>
            {points.length > 1 && (
              <text x={WIDTH - PAD.right} y={HEIGHT - 8} className={styles.tick} textAnchor="end">{formatUtcDay(points.at(-1)!.day)}</text>
            )}
          </>
        )}
        {hit && (
          <>
            <line x1={hitX} x2={hitX} y1={PAD.top} y2={PAD.top + innerH} className={styles.crosshair} />
            {kind === "cumulative" && <circle cx={hitX} cy={y(hit.sol)} r={4} className={styles.marker} />}
          </>
        )}
      </svg>
      {hit && (
        <div className={styles.tooltip} style={{ left: `${(hitX / WIDTH) * 100}%` }} role="status">
          <span className={styles.tooltipDay}>{formatUtcDay(hit.day)}</span>
          <span className="mono">{solLabel(hit.sol)} SOL</span>
        </div>
      )}
    </figure>
  );
}
