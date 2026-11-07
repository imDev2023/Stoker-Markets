import type { ReactNode } from "react";
import styles from "./OptionRow.module.css";

/**
 * One choice of a set as a full-width row (#172, after new-stoker's launch page): the radio, what it is, and at the
 * row's end a tag (an asset's kind, "Coming soon"). The launch form's pair and launch type are made of these; the
 * radio's accessible name is the row's whole text.
 */
export function OptionRow({
  name, value, checked, disabled = false, onChange, end, children,
}: {
  name: string;
  value: string;
  checked: boolean;
  disabled?: boolean;
  onChange?: () => void;
  end?: ReactNode;
  children: ReactNode;
}) {
  return (
    <label className={styles.row} data-disabled={disabled || undefined}>
      <input type="radio" className={styles.radio} name={name} value={value} checked={checked} disabled={disabled} onChange={onChange} />
      <span className={styles.body}>{children}</span>
      {end && <span className={styles.end}>{end}</span>}
    </label>
  );
}
