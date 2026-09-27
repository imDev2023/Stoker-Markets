import type { Metadata } from "next";
import { getPlatform } from "@/lib/api";
import { LaunchForm } from "@/components/LaunchForm";

export const metadata: Metadata = { title: "Launch a coin" };

export default async function LaunchPage() {
  const platform = await getPlatform();
  return <LaunchForm platform={platform} />;
}
