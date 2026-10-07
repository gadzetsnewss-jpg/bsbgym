import type { Metadata } from "next";
import { CrmForm } from "@/components/crm/crm-screens";

export const metadata: Metadata = { title: "Edit trial" };

export default async function EditTrialPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <CrmForm resource="trial_memberships" mode="edit" id={id} />;
}
