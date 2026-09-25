import type { Metadata } from "next";
import { CatalogList } from "@/components/catalog/catalog-screens";

export const metadata: Metadata = { title: "Class schedule" };

export default function ClassSchedulePage() {
  return <CatalogList resource="class_templates" />;
}
