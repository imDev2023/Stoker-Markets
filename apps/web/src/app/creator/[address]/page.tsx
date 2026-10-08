import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCreatorEarnings, getPlatform, listCreatorForwards } from "@/lib/api";
import { shortAddress } from "@/lib/format";
import { CreatorDashboard } from "@/components/CreatorDashboard";

type Props = { params: Promise<{ address: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { address } = await params;
  return { title: `Creator earnings of ${shortAddress(address)}` };
}

export default async function CreatorPage({ params }: Props) {
  const { address } = await params;
  const [earnings, platform] = await Promise.all([getCreatorEarnings(address), getPlatform()]);
  if (!earnings) notFound();
  const { forwards } = await listCreatorForwards(earnings.creator);
  return <CreatorDashboard initialEarnings={earnings} initialForwards={forwards} platform={platform} />;
}
