import type { Metadata } from "next";
import { CatalogDetail } from "@/components/catalog/catalog-screens";

export const metadata: Metadata = { title: "Supplier" };

export default async function SupplierDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <CatalogDetail resource="suppliers" id={id} />;
}
