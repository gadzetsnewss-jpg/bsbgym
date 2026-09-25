import type { Metadata } from "next";
import { CatalogForm } from "@/components/catalog/catalog-screens";

export const metadata: Metadata = { title: "Add product" };

export default function AddProductPage() {
  return <CatalogForm resource="products" mode="create" />;
}
