import type { Metadata } from "next";
import { pageMeta } from "@/lib/meta";
import { getPlatform } from "@/lib/api";
import { CreatorDashboard } from "@/components/CreatorDashboard";

// The connected Creator's own page: nothing for a search engine to list.
export const metadata: Metadata = pageMeta({ path: "/creator", title: "Your creator earnings", index: false });

export default async function CreatorPage() {
  const platform = await getPlatform();
  return <CreatorDashboard platform={platform} />;
}
