import type { Metadata } from "next";
import { CrmForm } from "@/components/crm/crm-screens";

export const metadata: Metadata = { title: "Edit lead" };

export default async function EditLeadPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <CrmForm resource="leads" mode="edit" id={id} />;
}
