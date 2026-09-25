import type { Metadata } from "next";
import { OperationsForm } from "@/components/operations/operations-screens";

export const metadata: Metadata = { title: "Edit membership" };

export default async function EditExpiringMembershipPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <OperationsForm resource="memberships_expiring" mode="edit" id={id} />;
}
