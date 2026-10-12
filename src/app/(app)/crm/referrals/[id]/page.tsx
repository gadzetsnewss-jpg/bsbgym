import type { Metadata } from "next";
import { CrmDetail } from "@/components/crm/crm-screens";

export const metadata: Metadata = { title: "Referral" };

export default async function ReferralDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <CrmDetail resource="referrals" id={id} />;
}
