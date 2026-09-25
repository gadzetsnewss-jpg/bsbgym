import type { Metadata } from "next";
import { CatalogList } from "@/components/catalog/catalog-screens";

export const metadata: Metadata = { title: "GST master" };

export default function GstMasterPage() {
  return <CatalogList resource="gst_rates" />;
}
