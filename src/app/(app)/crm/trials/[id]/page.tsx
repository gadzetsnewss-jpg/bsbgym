import type { Metadata } from "next";
import { CrmDetail } from "@/components/crm/crm-screens";

export const metadata: Metadata = { title: "Trial" };

export default async function TrialDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <CrmDetail resource="trial_memberships" id={id} />;
}
