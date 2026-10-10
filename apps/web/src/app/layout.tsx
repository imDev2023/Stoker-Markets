import type { Metadata, Viewport } from "next";
import { Archivo, IBM_Plex_Mono, Public_Sans } from "next/font/google";
import type { ReactNode } from "react";
import { FeeChangeBanner } from "@/components/FeeChangeBanner";
import { Providers } from "@/components/Providers";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { getPlatform, listAnnouncements } from "@/lib/api";
import { THEME_GROUNDS, THEME_OVERRIDE_SCRIPT, themeFrom } from "@/lib/theme";
import "./globals.css";

const archivo = Archivo({ subsets: ["latin"], axes: ["wdth"], variable: "--font-archivo", display: "swap" });
const publicSans = Public_Sans({ subsets: ["latin"], variable: "--font-public-sans", display: "swap" });
const plexMono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-plex-mono", display: "swap" });

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
  const [platform, announcements] = await Promise.all([getPlatform(), listAnnouncements().catch(() => null)]);
  const upcoming = announcements?.announcements.find((a) => a.appliedSignature === null && new Date(a.effectiveAt).getTime() > Date.now() - 24 * 3600_000) ?? null;
  return (
    // The override script may change `data-theme` before React sees it, which is intended, not a mismatch.
    <html lang="en" data-theme={theme} className={`${archivo.variable} ${publicSans.variable} ${plexMono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_OVERRIDE_SCRIPT }} />
      </head>
      <body>
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
