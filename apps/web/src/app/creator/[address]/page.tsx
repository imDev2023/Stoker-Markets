import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCreatorFees, getPlatform, listCreatorFeeClaims, listCreatorForwards } from "@/lib/api";
import { shortAddress } from "@/lib/format";
import { CreatorDashboard } from "@/components/CreatorDashboard";

type Props = { params: Promise<{ address: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { address } = await params;
  return { title: `Creator Fee of ${shortAddress(address)}` };
}

export default async function CreatorPage({ params }: Props) {
  const { address } = await params;
  const [fees, platform] = await Promise.all([getCreatorFees(address), getPlatform()]);
  if (!fees) notFound();
  const [{ claims }, { forwards }] = await Promise.all([listCreatorFeeClaims(fees.creator), listCreatorForwards(fees.creator)]);
  return <CreatorDashboard initialFees={fees} initialClaims={claims} initialForwards={forwards} platform={platform} />;
}
