import { cookies } from "next/headers";
import type { ReactNode } from "react";
import { StatusLine } from "@/components/StatusLine";
import { HEADER_COOKIE, headerFrom } from "@/lib/header";

/**
 * Every page past the home is the terminal (owner, 2026-10-08): dense, data-led, tight corners, numbers in mono, the
 * platform's facts in a status line under the header. The home page is the landing and sits outside this group. The
 * class scopes the terminal's own tokens (globals.css). The two-tier header candidate (h6, src/lib/header.ts) carries
 * the facts in its lower tier, so under it the status line is left out.
 */
export default async function TerminalLayout({ children }: { children: ReactNode }) {
  const header = headerFrom((await cookies()).get(HEADER_COOKIE)?.value);
  return (
    <div className="terminal">
      {header !== "h6" && <StatusLine />}
      {children}
    </div>
  );
}
