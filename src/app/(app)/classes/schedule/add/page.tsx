import type { Metadata } from "next";
import { CatalogForm } from "@/components/catalog/catalog-screens";

export const metadata: Metadata = { title: "Add class" };

export default function AddClassTemplatePage() {
  return <CatalogForm resource="class_templates" mode="create" />;
}
