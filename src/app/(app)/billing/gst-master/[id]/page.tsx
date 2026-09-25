import type { Metadata } from "next";
import { CatalogDetail } from "@/components/catalog/catalog-screens";

export const metadata: Metadata = { title: "GST rate" };

export default async function GstRateDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <CatalogDetail resource="gst_rates" id={id} />;
}
