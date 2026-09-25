import type { Metadata } from "next";
import { CatalogForm } from "@/components/catalog/catalog-screens";

export const metadata: Metadata = { title: "Edit GST rate" };

export default async function EditGstRatePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <CatalogForm resource="gst_rates" mode="edit" id={id} />;
}
