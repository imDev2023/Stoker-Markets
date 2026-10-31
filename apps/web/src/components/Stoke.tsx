"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { startStoke, STOKE_HEADROOM } from "@/lib/stoke";
import { Ring } from "./Mark";
import styles from "./Stoke.module.css";

/**
 * The stoke (#133, hero candidate D): the ring heating from coal in a slow canvas loop (src/lib/stoke.ts). It renders
 * the still ring at full heat first and everywhere motion is not wanted: on the server, before hydration, and under
 * `prefers-reduced-motion`, which the UI suite's screenshot projects ask for, so a baseline never depends on where the
 * loop stands. The headroom above the ring is the embers' and is taken back, so the ring sits where the `Ring` would.
 */
export function Stoke({ size = 240, className }: { size?: number; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [moving, setMoving] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setMoving(!media.matches);
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, []);
  useEffect(() => {
    if (!moving || !ref.current) return;
    return startStoke(ref.current, size);
  }, [moving, size]);
  if (!moving) return <Ring size={size} className={className} />;
  const headroom = Math.round(size * STOKE_HEADROOM);
  return (
    <span className={`${styles.box} ${className ?? ""}`} style={{ "--stoke-headroom": `${headroom}px` } as CSSProperties}>
      <canvas ref={ref} className={styles.canvas} style={{ width: size, height: size + headroom }} aria-hidden="true" />
    </span>
  );
}
