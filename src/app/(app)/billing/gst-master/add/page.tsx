import type { Metadata } from "next";
import { CatalogForm } from "@/components/catalog/catalog-screens";

export const metadata: Metadata = { title: "Add GST rate" };

export default function AddGstRatePage() {
  return <CatalogForm resource="gst_rates" mode="create" />;
}
