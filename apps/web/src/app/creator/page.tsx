import type { Metadata } from "next";
import { getPlatform } from "@/lib/api";
import { CreatorHome } from "@/components/CreatorHome";

export const metadata: Metadata = { title: "Your creator earnings" };

export default async function CreatorHomePage() {
  const platform = await getPlatform();
  return <CreatorHome platform={platform} />;
}
