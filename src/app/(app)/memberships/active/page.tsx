import type { Metadata } from "next";
import { OperationsList } from "@/components/operations/operations-screens";

export const metadata: Metadata = { title: "Active memberships" };

export default function ActiveMembershipsPage() {
  return <OperationsList resource="memberships_active" />;
}
