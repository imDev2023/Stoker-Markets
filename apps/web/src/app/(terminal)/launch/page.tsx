import type { Metadata } from "next";
import { getPlatform, listQuotes } from "@/lib/api";
import { LaunchForm } from "@/components/LaunchForm";

export const metadata: Metadata = { title: "Stoke a coin" };

export default async function LaunchPage() {
  const [platform, { quotes }] = await Promise.all([getPlatform(), listQuotes()]);
  return <LaunchForm platform={platform} quotes={quotes} />;
}
