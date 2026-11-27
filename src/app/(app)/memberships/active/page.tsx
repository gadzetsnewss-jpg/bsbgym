import type { Metadata } from "next";
import { ActiveMembershipsList } from "@/components/memberships/active-memberships-list";

export const metadata: Metadata = { title: "Active memberships" };

export default function ActiveMembershipsPage() {
  return <ActiveMembershipsList />;
}
