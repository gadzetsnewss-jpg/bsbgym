import type { Metadata } from "next";
import { CrmForm } from "@/components/crm/crm-screens";

export const metadata: Metadata = { title: "Edit follow-up" };

export default async function EditFollowUpPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <CrmForm resource="follow_ups" mode="edit" id={id} />;
}
