import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCreatorFees, getPlatform, listCreatorFeeClaims } from "@/lib/api";
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
  const { claims } = await listCreatorFeeClaims(fees.creator);
  return <CreatorDashboard initialFees={fees} initialClaims={claims} platform={platform} />;
}
