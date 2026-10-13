// The tokens and primitives come first, so a component's module can override a primitive's defaults on a tied selector.
import "./globals.css";
import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Instrument_Sans, JetBrains_Mono } from "next/font/google";
import { cookies } from "next/headers";
import type { ReactNode } from "react";
import { FeeChangeBanner } from "@/components/FeeChangeBanner";
import { Providers } from "@/components/Providers";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { ThemeOverride } from "@/components/ThemeOverride";
import { getPlatform, listAnnouncements } from "@/lib/api";
import { SCHEME_COOKIE } from "@/lib/scheme";
import { THEME_GROUNDS, themeFrom } from "@/lib/theme";

// The families (owner, 2026-10-11, on "Stoker Type"): the display face carries the voice through its optical-size and
// width axes, the body and the figures stay plain, so a dense row reads while a headline and the wordmark stand out.
const bricolage = Bricolage_Grotesque({ subsets: ["latin"], axes: ["opsz", "wdth"], variable: "--font-bricolage", display: "swap" });
const instrumentSans = Instrument_Sans({ subsets: ["latin"], variable: "--font-instrument-sans", display: "swap" });
const jetbrainsMono = JetBrains_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-jetbrains-mono", display: "swap" });

/** The scheme this build is made with; `?theme=` on a page can show another (src/lib/theme.ts). */
const theme = themeFrom(process.env.NEXT_PUBLIC_THEME);

export const metadata: Metadata = {
  title: { default: "Stoker", template: "%s · Stoker" },
  description: "No one picks your pair. You do. Launch a coin on Solana priced in SOL, a stablecoin, a tokenized stock or any asset Raydium quotes; creators earn from every trade.",
  // The same file the PlatformConfig's `img` names on-chain (runbook, section 2), so it must stay at this address.
  icons: { icon: "/icon.png" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: THEME_GROUNDS[theme].light },
    { media: "(prefers-color-scheme: dark)", color: THEME_GROUNDS[theme].dark },
  ],
};

export const dynamic = "force-dynamic";

export default async function RootLayout({ children }: { children: ReactNode }) {
  // A fee change everyone should see coming; the banner is left out rather than the page failing if the API is down.
  const [platform, announcements, jar] = await Promise.all([getPlatform(), listAnnouncements().catch(() => null), cookies()]);
  const upcoming = announcements?.announcements.find((a) => a.appliedSignature === null && new Date(a.effectiveAt).getTime() > Date.now() - 24 * 3600_000) ?? null;
  // Light or dark chosen with the header's toggle (SchemeToggle); without the cookie the page follows the system setting.
  const scheme = jar.get(SCHEME_COOKIE)?.value;
  return (
    // `?theme=` may change `data-theme` after hydration (ThemeOverride), which is intended, not a mismatch.
    <html lang="en" data-theme={theme} data-scheme={scheme === "light" || scheme === "dark" ? scheme : undefined} className={`${bricolage.variable} ${instrumentSans.variable} ${jetbrainsMono.variable}`} suppressHydrationWarning>
      <body>
        <ThemeOverride />
        <Providers rpcUrl={platform.rpcUrl}>
          <SiteHeader cluster={platform.cluster} />
          {upcoming && <FeeChangeBanner announcement={upcoming} platform={platform} />}
          <main>{children}</main>
          <SiteFooter cluster={platform.cluster} />
        </Providers>
      </body>
    </html>
  );
}
