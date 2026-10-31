import type { Metadata } from "next";
import { pageMeta } from "@/lib/meta";
import { getPlatform } from "@/lib/api";
import { OperatorView } from "@/components/OperatorView";

export const metadata: Metadata = pageMeta({ path: "/operator", title: "Operator", index: false });

/** The operator's own view, behind the operator token: for support, never linked from the public pages. */
export default async function OperatorPage() {
  const platform = await getPlatform();
  return <OperatorView platform={platform} />;
}
