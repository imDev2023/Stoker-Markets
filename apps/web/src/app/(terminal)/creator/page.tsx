import type { Metadata } from "next";
import { getPlatform } from "@/lib/api";
import { CreatorDashboard } from "@/components/CreatorDashboard";

// The connected Creator's own page: nothing for a search engine to list.
export const metadata: Metadata = { title: "Your creator earnings", robots: { index: false, follow: false } };

export default async function CreatorPage() {
  const platform = await getPlatform();
  return <CreatorDashboard platform={platform} />;
}
