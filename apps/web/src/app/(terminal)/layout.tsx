import type { ReactNode } from "react";
import { StatusLine } from "@/components/StatusLine";

/**
 * Every page past the home is the terminal (owner, 2026-10-08): dense, data-led, tight corners, numbers in mono, the
 * platform's facts in a status line under the header. The home page is the landing and sits outside this group. The
 * class scopes the terminal's own tokens (globals.css).
 */
export default function TerminalLayout({ children }: { children: ReactNode }) {
  return (
    <div className="terminal">
      <StatusLine />
      {children}
    </div>
  );
}
