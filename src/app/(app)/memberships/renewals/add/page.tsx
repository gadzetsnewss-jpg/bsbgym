import type { Metadata } from "next";
import { OperationsForm } from "@/components/operations/operations-screens";

export const metadata: Metadata = { title: "Add membership" };

export default function AddRenewalMembershipPage() {
  return <OperationsForm resource="memberships_renewals" mode="create" />;
}
