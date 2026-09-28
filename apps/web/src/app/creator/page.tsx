import type { Metadata } from "next";
import { getPlatform } from "@/lib/api";
import { CreatorHome } from "@/components/CreatorHome";

export const metadata: Metadata = { title: "Your Creator Fee" };

export default async function CreatorHomePage() {
  const platform = await getPlatform();
  return <CreatorHome creatorFeePct={platform.creatorFeeBps / 100} />;
}
