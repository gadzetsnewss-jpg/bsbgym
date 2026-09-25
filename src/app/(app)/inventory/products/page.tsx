import type { Metadata } from "next";
import { CatalogList } from "@/components/catalog/catalog-screens";

export const metadata: Metadata = { title: "Products" };

export default function ProductsPage() {
  return <CatalogList resource="products" />;
}
