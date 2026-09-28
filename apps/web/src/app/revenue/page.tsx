import type { Metadata } from "next";
import { getPlatform, getRevenue, listLedger } from "@/lib/api";
import { RevenueDashboard } from "@/components/RevenueDashboard";

export const metadata: Metadata = {
  title: "Platform revenue",
  description: "Every fee the platform collects and every sweep to its treasury, each tied to its Solana transaction.",
};

export default async function RevenuePage() {
  const [revenue, ledger, platform] = await Promise.all([getRevenue(), listLedger(), getPlatform()]);
  return <RevenueDashboard revenue={revenue} ledger={ledger} platform={platform} />;
}
