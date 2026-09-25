import type { Metadata } from "next";
import { CatalogForm } from "@/components/catalog/catalog-screens";

export const metadata: Metadata = { title: "Add supplier" };

export default function AddSupplierPage() {
  return <CatalogForm resource="suppliers" mode="create" />;
}
