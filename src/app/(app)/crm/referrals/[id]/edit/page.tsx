import type { Metadata } from "next";
import { CrmForm } from "@/components/crm/crm-screens";

export const metadata: Metadata = { title: "Edit referral" };

export default async function EditReferralPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <CrmForm resource="referrals" mode="edit" id={id} />;
}
