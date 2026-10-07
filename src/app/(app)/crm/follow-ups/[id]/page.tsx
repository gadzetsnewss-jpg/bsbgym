import type { Metadata } from "next";
import { CrmDetail } from "@/components/crm/crm-screens";

export const metadata: Metadata = { title: "Follow-up" };

export default async function FollowUpDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <CrmDetail resource="follow_ups" id={id} />;
}
