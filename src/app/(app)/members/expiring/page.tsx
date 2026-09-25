import type { Metadata } from "next";
import { OperationsList } from "@/components/operations/operations-screens";

export const metadata: Metadata = { title: "Expiring" };

export default function ExpiringMembershipsPage() {
  return <OperationsList resource="memberships_expiring" />;
}
