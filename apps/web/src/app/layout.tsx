import type { Metadata, Viewport } from "next";
import { Archivo, IBM_Plex_Mono, Public_Sans } from "next/font/google";
import type { ReactNode } from "react";
import { FeeChangeBanner } from "@/components/FeeChangeBanner";
import { Providers } from "@/components/Providers";
import { SiteHeader } from "@/components/SiteHeader";
import { getPlatform, listAnnouncements } from "@/lib/api";
import "./globals.css";

const archivo = Archivo({ subsets: ["latin"], axes: ["wdth"], variable: "--font-archivo", display: "swap" });
const publicSans = Public_Sans({ subsets: ["latin"], variable: "--font-public-sans", display: "swap" });
const plexMono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-plex-mono", display: "swap" });

export const metadata: Metadata = {
  title: { default: "Launchpad", template: "%s · Launchpad" },
  description: "Launch a coin on Solana. Creators earn 0.5% of every trade, paid by the chain.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#eef0f4" },
    { media: "(prefers-color-scheme: dark)", color: "#0e1220" },
  ],
};

export const dynamic = "force-dynamic";

export default async function RootLayout({ children }: { children: ReactNode }) {
  // A fee change everyone should see coming; the banner is left out rather than the page failing if the API is down.
  const [platform, announcements] = await Promise.all([getPlatform(), listAnnouncements().catch(() => null)]);
  const upcoming = announcements?.announcements.find((a) => a.appliedSignature === null && new Date(a.effectiveAt).getTime() > Date.now() - 24 * 3600_000) ?? null;
  return (
    <html lang="en" className={`${archivo.variable} ${publicSans.variable} ${plexMono.variable}`}>
      <body>
        <Providers rpcUrl={platform.rpcUrl}>
          <SiteHeader cluster={platform.cluster} />
          {upcoming && <FeeChangeBanner announcement={upcoming} platform={platform} />}
          <main>{children}</main>
        </Providers>
      </body>
    </html>
  );
}
