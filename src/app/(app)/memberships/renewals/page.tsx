import type { Metadata } from "next";
import { OperationsList } from "@/components/operations/operations-screens";

export const metadata: Metadata = { title: "Renewals" };

export default function MembershipRenewalsPage() {
  return <OperationsList resource="memberships_renewals" />;
}
