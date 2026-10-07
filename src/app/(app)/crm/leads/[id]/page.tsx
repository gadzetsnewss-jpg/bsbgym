import type { Metadata } from "next";
import { CrmDetail } from "@/components/crm/crm-screens";

export const metadata: Metadata = { title: "Lead" };

export default async function LeadDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <CrmDetail resource="leads" id={id} />;
}
