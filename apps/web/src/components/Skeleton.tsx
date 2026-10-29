import styles from "./Skeleton.module.css";

/**
 * A placeholder in the shape of what is loading (#131, after the research's section 10): `lines` blocks of the given
 * height, for a data container and never a button. The CSS holds it back for 200ms, so a fast answer never flickers;
 * one skeleton stands for a whole panel, never one per item.
 */
export function Skeleton({ lines = 1, height = 16, className = "" }: { lines?: number; height?: number; className?: string }) {
  // Decorative: the container that is loading says so with `aria-busy` (and a hidden line where it has no text of its own).
  return (
    <div className={`${styles.skeleton} ${className}`} aria-hidden="true">
      {Array.from({ length: lines }, (_, i) => (
        <span key={i} className={styles.block} style={{ height }} />
      ))}
    </div>
  );
}
