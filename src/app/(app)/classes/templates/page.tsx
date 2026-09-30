import type { Metadata } from "next";
import { CatalogList } from "@/components/catalog/catalog-screens";

export const metadata: Metadata = { title: "Class templates" };

export default function ClassTemplatesPage() {
  return <CatalogList resource="class_templates" />;
}
