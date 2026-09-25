import type { Metadata } from "next";
import { CatalogList } from "@/components/catalog/catalog-screens";

export const metadata: Metadata = { title: "Membership plans" };

export default function MembershipPlansPage() {
  return <CatalogList resource="membership_plans" />;
}
