import type { Metadata } from "next";
import { CatalogForm } from "@/components/catalog/catalog-screens";

export const metadata: Metadata = { title: "Add plan" };

export default function AddMembershipPlanPage() {
  return <CatalogForm resource="membership_plans" mode="create" />;
}
