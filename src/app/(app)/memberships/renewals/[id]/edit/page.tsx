import type { Metadata } from "next";
import { OperationsForm } from "@/components/operations/operations-screens";

export const metadata: Metadata = { title: "Edit membership" };

export default async function EditRenewalMembershipPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <OperationsForm resource="memberships_renewals" mode="edit" id={id} />;
}
