import type { Metadata } from "next";
import { CatalogForm } from "@/components/catalog/catalog-screens";

export const metadata: Metadata = { title: "Edit plan" };

export default async function EditMembershipPlanPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <CatalogForm resource="membership_plans" mode="edit" id={id} />;
}
