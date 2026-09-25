import type { Metadata } from "next";
import { CatalogDetail } from "@/components/catalog/catalog-screens";

export const metadata: Metadata = { title: "Membership plan" };

export default async function MembershipPlanDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <CatalogDetail resource="membership_plans" id={id} />;
}
