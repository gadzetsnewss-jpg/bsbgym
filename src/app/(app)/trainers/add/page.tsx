import type { Metadata } from "next";
import { CatalogForm } from "@/components/catalog/catalog-screens";

export const metadata: Metadata = { title: "Add trainer" };

export default function AddTrainerPage() {
  return <CatalogForm resource="trainers" mode="create" />;
}
