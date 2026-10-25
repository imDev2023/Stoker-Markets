import type { ReactNode } from "react";

/**
 * Every page past the home is the terminal (owner, 2026-10-08): dense, data-led, tight corners, numbers in mono. The
 * home page is the landing and sits outside this group. The class scopes the terminal's own tokens (globals.css). The
 * status line that ran under the header (the network, the quote asset count, the fees, the Graduation Target) was
 * removed by the owner on 2026-10-25: every figure it carried is on the page that concerns it.
 */
export default function TerminalLayout({ children }: { children: ReactNode }) {
  return <div className="terminal">{children}</div>;
}
